I've now mapped the full pipeline: route → orchestrator → query-rewriter → persona-classifier →
  retrieval (intent + hybrid) → relevance-gate → safety-validator → response-formatter, plus
  ingestion and KB structure. Here is Part 1.

  ---
  PART 1 — CURRENT ARCHITECTURE MAP

  RETRIEVAL LAYER

  Component: Query construction before retrieval
  What your system does: Two-stage. (1) normalizeAndExpandQuery() lowercases + appends a hardcoded
    synonym list (hot flash → night sweats, vasomotor...). (2) Heavy regex normalization in
    normalizeTextForIntentMatching() (contractions, "so X"→"feel X", "gain weight"→"weightgain",
    temporal collapsing). The expanded string is what gets embedded.
  ────────────────────────────────────────
  Component: Conversation history in the query
  What your system does: PARTIAL. History is not folded into the embedded query by default. It's only

    used when isLikelyFollowUp() fires (short message / follow-up starter), which triggers an LLM
    rewrite (rewriteQueryWithContext, gpt-4o-mini). Self-contained queries embed with zero history.
  ────────────────────────────────────────
  Component: Pronoun / reference resolution
  What your system does: PARTIAL. Done by the same LLM rewriter, and only on detected follow-ups. A
    normal-length query containing "it"/"that" is embedded as-is — no coreference  resolution.
  ────────────────────────────────────────
  Component: Embedding model
  What your system does: text-embedding-3-large, dimensions: 1536 (reduced from native 3072 to fit
    Supabase's 2000-dim ceiling). Same model at ingest and query time.
  ────────────────────────────────────────
  Component: Vector store
  What your system does: Supabase Postgres + pgvector, table documents, queried via match_documents
    RPC (LangChain SupabaseVectorStore).
  ────────────────────────────────────────
  Component: Similarity metric
  What your system does: Cosine (LangChain SupabaseVectorStore match_documents default: 1 -
  (embedding
    <=> query_embedding)).
  ────────────────────────────────────────
  Component: Top-k
  What your system does: Variable. Candidate pool = min(topK*5, 30). Final topK = 3 (kb_strict), 5
    (hybrid), 3 (llm_reasoning follow-up).
  ────────────────────────────────────────
  Component: Similarity threshold before injection
  What your system does: Layered: semantic primary gate max(0.35, threshold-0.1); verbatim gates:
  0.30
     semantic (kb_strict), 0.35 semantic + 0.45 hybrid (hybrid mode); intent threshold 0.80
    (kb_strict); adaptive hybrid 0.44–0.50. Perfect intent matches  bypass the semantic threshold.
  ────────────────────────────────────────
  Component: Metadata filtering before vector search
  What your system does: YES (partial). kb_strict filters persona at the DB level inside the RPC.
    Hybrid personas (nutrition/exercise) deliberately send no persona filter (so menopause content is

    included). No other metadata pre-filtering (topic/subtopic/recency).

  ROUTING LAYER

  Component: KB vs OpenAI decision
  What your system does: Multi-step. First, follow-up-link click → verbatim KB (bypasses everything).

    Then classifyPersona() → keyword match + a DB scan of menopause intent patterns. Persona →
    retrieval mode: menopause_specialist=kb_strict, nutrition/exercise=hybrid, empathy=llm_reasoning.

    Within mode, retrieval score gates decide verbatim-KB / KB-grounded-LLM / LLM-only.
  ────────────────────────────────────────
  Component: Binary or tiered
  What your system does: Tiered (3 effective tiers): (1) Verbatim KB (exact/perfect intent or
    intent≥0.80 + semantic gate + relevance gate), (2) KB-grounded LLM (hybrid mode injects
    kbContext), (3) LLM-only (no match / empathy / refusal).
  ────────────────────────────────────────
  Component: Signal that triggers each route
  What your system does: Exact-intent normalized string equality OR hasPerfectIntentMatch (≥0.6
    synonym-expanded Jaccard) → verbatim. Intent score ≥0.80 + semantic ≥0.30 + LLM relevance YES →
    verbatim. Hybrid semantic ≥0.35 → grounded. Else LLM.
  ────────────────────────────────────────
  Component: Decision logged
  What your system does: PARTIAL. Extensive console.log at every branch (scores, persona, mode, gate
    results). Nothing is persisted — no DB row, no structured event. The API response carries source:
   
    "kb"|"llm" and persona, but no scores/tier.

  KNOWLEDGE BASE

  ┌───────────────────┬──────────────────────────────────────────────────────────────────────────┐
  │     Component     │                          What your system does                           │
  ├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │                   │ YAML frontmatter per section: persona, topic, subtopic, content_text,    │
  │ Entry structure   │ action_tips, motivation_nudge, habit_strategy, follow_up_question,       │
  │                   │ follow_up_links[], intent_patterns[], keywords[]. ~110+ files.           │
  ├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ Average chunk     │ Section = 1 document = 1 complete answer. No chunking unless a section   │
  │ size              │ exceeds ~8000 tokens / 24–30k chars (rare, warned). Chunks are large and │
  │                   │  self-contained — the opposite of small-chunk RAG.                       │
  ├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │                   │ YES — rich: persona/topic/subtopic, intent_patterns, keywords,           │
  │ Metadata tags     │ content_sections booleans, follow_up_links, source, section_index.       │
  │                   │ Stored in metadata JSONB.                                                │
  ├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ Same question,    │ YES, by design. This is the core mechanism: 15–25 intent_patterns per    │
  │ many phrasings →  │ entry + synonym expansion + aggressive normalization. Intent patterns    │
  │ same chunk        │ are also embedded into the content at ingest                             │
  │                   │ (enhanceContentWithMetadata) so they influence the vector too.           │
  ├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ KB update /       │ Edit markdown → npm run ingest → clears entire documents table and       │
  │ maintenance       │ re-embeds everything. No incremental update, no versioning.              │
  └───────────────────┴──────────────────────────────────────────────────────────────────────────┘

  PROMPT CONSTRUCTION

  ┌────────────────────┬─────────────────────────────────────────────────────────────────────────┐
  │     Component      │                          What your system does                          │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │                    │ Verbatim path: no prompt at all — formatted KB content streamed         │
  │ Injected on KB     │ directly (no LLM). Hybrid path: KB content injected into system prompt  │
  │ match              │ under === KNOWLEDGE BASE CONTEXT === + user profile + 30-day tracker    │
  │                    │ summary + date/time + last-20-turn history.                             │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │                    │ Persona-specific. Menopause = "Warm Science with a Sassy Edge", max 100 │
  │ System prompt      │  words, no dosages. Nutrition/Exercise/Empathy built via                │
  │                    │ buildPersonaPrompt() specs.                                             │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │                    │ NOT grounded. Hybrid instructions explicitly say "Combine KB evidence   │
  │ Stay-within-KB vs  │ with creative, practical suggestions" and "Generate personalized        │
  │ add own knowledge  │ plans/meal/workout ideas." The LLM is invited to add its own knowledge. │
  │                    │  No "answer only from context" constraint.                              │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ History passed to  │ YES — last 20 turns as HumanMessage/AIMessage, pulled from the          │
  │ OpenAI             │ conversations table (DB-backed, session-scoped).                        │
  └────────────────────┴─────────────────────────────────────────────────────────────────────────┘

  POST-RETRIEVAL

  ┌─────────────────┬────────────────────────────────────────────────────────────────────────────┐
  │    Component    │                           What your system does                            │
  ├─────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │                 │ YES, but custom — not a cross-encoder. applyHybridSearch() recomputes a    │
  │ Re-ranking      │ weighted blend of semantic score + intent score + keyword score +          │
  │                 │ section-relevance, with adaptive weights and a perfect-match bonus         │
  │                 │ (+0.20–0.35). Re-sorts so perfect intent matches always rank first.        │
  ├─────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Answer          │                                                                            │
  │ validated       │ MISSING. No faithfulness/groundedness check on generated output.           │
  │ against source  │                                                                            │
  │ chunk           │                                                                            │
  ├─────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │                 │ PARTIAL (pre-generation only). verifyKBRelevance() asks gpt-4o-mini YES/NO │
  │ Relevance gate  │  whether the article (topic — subtopic title only, not the body) addresses │
  │                 │  the query, before serving verbatim. It validates the match, not the       │
  │                 │ answer. Skipped on exact/perfect intent.                                   │
  ├─────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Confidence /    │ PARTIAL. source: "kb"|"llm", persona, isVerbatim, follow_up_links          │
  │ source in       │ returned. No numeric confidence/score exposed.                             │
  │ response        │                                                                            │
  ├─────────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ Partial         │ Falls through: if semantic gate fails → LLM fallback; if relevance gate    │
  │ relevance       │ says NO → LLM fallback; hybrid sub-threshold → inject KB as soft context   │
  │ handling        │ to LLM.                                                                    │
  └─────────────────┴────────────────────────────────────────────────────────────────────────────┘

  OBSERVABILITY

  ┌────────────────────┬─────────────────────────────────────────────────────────────────────────┐
  │     Component      │                          What your system does                          │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ Retrieval queries  │ PARTIAL — console.log only (ephemeral on Vercel). Not                   │
  │ logged             │ persisted/queryable.                                                    │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ Similarity scores  │ PARTIAL — console.log only; never written to a store.                   │
  │ logged per turn    │                                                                         │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ Answer source      │ PARTIAL — returned to client + console; not persisted against the turn. │
  │ logged (KB vs      │  The conversations table stores user/assistant text but not source,     │
  │ OpenAI)            │ persona, scores, or tier.                                               │
  ├────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ Eval / feedback    │ MISSING. No thumbs up/down, no golden-set eval, no regression harness,  │
  │ loop               │ no KB-gap detection.                                                    │
  └────────────────────┴─────────────────────────────────────────────────────────────────────────┘

  ---
  One correction to flag for accuracy

  Your CLAUDE.md describes "Verbatim KB-first RAG" and "persona-based routing into 4 personas."
  Confirmed accurate. But note the system is not grounded in hybrid mode (the LLM is told to invent
  plans), and the "relevance check" only sees titles, not body text — both matter for Part 3.

  ---
  This is the Part 1 architecture map. Confirm and I'll proceed to STOP 2: the Part 2 benchmark
  comparison table.