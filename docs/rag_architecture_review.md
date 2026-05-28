# RAG Architecture Review — MenoLisa "Lisa" Chat

**Date:** 2026-05-28
**Reviewer:** Senior RAG systems architect (diagnostic exercise)
**Scope:** End-to-end review of the production RAG pipeline serving the Lisa AI companion (`lib/rag/`, `app/api/langchain-rag/`, `scripts/ingest-documents.ts`, `knowledge-base/`).
**Purpose:** Map the current architecture, benchmark it against advanced production RAG systems, identify gaps, and produce a prioritized improvement roadmap.

---

## PART 1 — CURRENT ARCHITECTURE MAP

### Retrieval Layer

- **Query construction before retrieval.** User query is normalized + expanded with a hardcoded menopause synonym map (`normalizeAndExpandQuery` in `lib/rag/retrieval.ts`). Punctuation stripped, contractions expanded, phrases like "gain weight" → `weightgain` token, "at/every/each night" → `night`. The normalized string is what gets embedded.
- **Conversation history in retrieval query.** PARTIAL. Not included in the embedding by default. A rule-based gate (`isLikelyFollowUp` in `lib/rag/query-rewriter.ts`) detects ambiguous follow-ups (≤12 chars, "yes/ok/tell me more", etc.) and only then calls gpt-4o-mini with the last 6 history messages to rewrite into a standalone query. Self-contained queries pass through unchanged.
- **Pronouns/references resolved before retrieval.** PARTIAL. Only via the LLM rewriter, and only when the rule gate fires. Pronouns inside longer queries (e.g. *"does it cause that?"*) do not trigger rewriting.
- **Embedding model.** `text-embedding-3-large` reduced to **1536 dimensions** to fit pgvector's 2000-dim Supabase index.
- **Vector store.** Supabase pgvector (`documents` table). Search via the `match_documents` RPC.
- **Similarity metric.** Cosine (pgvector default in `match_documents`).
- **Top-k.** Adaptive. Retrieval pulls `min(topK * 5, 30)` candidates and trims to topK=3 (kb_strict / llm_reasoning follow-up) or topK=5 (hybrid).
- **Similarity thresholds before injection.** Multi-layer:
  - Initial vector retrieval threshold: 0.3 (kb_strict) / 0.5 (hybrid).
  - Verbatim semantic gate: ≥0.30 (kb_strict), ≥0.35 (hybrid).
  - Hybrid score gate: ≥0.45 (hybrid), adaptive 0.44–0.50.
  - Intent score gate for kb_strict verbatim: ≥0.80.
- **Metadata filtering before vector search.** YES. `match_documents` RPC accepts a `filter` object. kb_strict filters by `persona`. Hybrid mode (nutrition/exercise) intentionally passes `{}` to also reach menopause content.

### Routing Layer

- **KB vs OpenAI decision.** Tiered, per-persona. Four routes:
  1. **Follow-up link match** (subtopic/label exact string) → verbatim KB, no LLM.
  2. **Exact intent pattern match across all personas** (`checkExactIntentMatchAcrossAllPersonas`) → verbatim KB.
  3. Persona-based modes: `kb_strict` (menopause_specialist), `hybrid` (nutrition_coach, exercise_trainer), `llm_reasoning` (empathy_companion).
- **Tiering.** Tiered — verbatim KB / KB-context + LLM (hybrid) / LLM only.
- **Signals per route.**
  - Verbatim: exact-string intent match OR (intent ≥0.80 AND semantic ≥0.30 AND LLM relevance gate passes).
  - Hybrid LLM with KB context: intent <threshold but at least one KB candidate retrieved.
  - LLM only: empathy persona, no KB candidates above threshold, or relevance gate rejected verbatim.
- **Decision logging.** PARTIAL. Console logs throughout (e.g. `[KB Strict Mode] ✅ VERBATIM RESPONSE triggered`) with scores. No structured persisted log — stdout only.

### Knowledge Base

- **Entry structure.** Markdown files with YAML frontmatter (`persona`, `topic`, `subtopic`, `keywords[]`, `intent_patterns[]`, `content_sections{}`, `follow_up_links[]`). One markdown section = one Supabase `documents` row. Intent patterns repeated at the start of the embedded text to boost semantic matching.
- **Chunk size.** One full section per chunk. Ingestion intentionally does NOT split (comment: *"Each section = 1 document (no chunking unless extremely large)"*). A `cleanup-oversized-documents.ts` script exists as a safety net. No `RecursiveCharacterTextSplitter` is used.
- **Metadata tags on chunks.** YES — rich: `persona`, `topic`, `subtopic`, `keywords[]`, `intent_patterns[]`, `content_sections{has_content,has_action_tips,has_motivation,has_followup,has_habit_strategy}`, `follow_up_links[]`, `source`, `section_index`.
- **Same question, multiple phrasings.** PARTIAL. Handled via three mechanisms: (1) explicit `intent_patterns` array per doc, (2) normalization pipeline collapsing phrasings (e.g. temporal "at night/every night/nightly"), (3) hardcoded synonym map. Robust for in-domain variations the team has anticipated; brittle for novel phrasings.
- **KB updates.** `npm run ingest` **clears and re-ingests the entire `documents` table**. No incremental update.

### Prompt Construction

- **Injected on KB match.**
  - **Verbatim path:** KB content is returned **directly to the user** — no LLM call. `formatVerbatimResponse` renders content + follow-up link chips.
  - **Hybrid path:** KB content is injected into the system prompt under a `=== KNOWLEDGE BASE CONTEXT ===` block with instructions to "Use the knowledge base content as evidence" and "Generate personalized plans and meal/workout ideas based on the KB data".
- **System prompt contents.** Persona-specific prompt (`MENOPAUSE_SPECIALIST_SYSTEM_PROMPT` is tone+style+format, ≤100 words, emoji rules, refuse Rx names) + current date/time + optional `KB CONTEXT` + user context + tracker context + casual conversation mode override.
- **Stay within KB context.** PARTIAL. Hybrid mode explicitly invites the LLM to "Generate personalized plans" and "Combine KB evidence with creative, practical suggestions" — i.e. not strict grounding. No explicit "if not in context, say you don't know" rule. Verbatim path doesn't need it (no LLM).
- **Conversation history to OpenAI.** YES. Last 20 turns from in-memory `lib/rag/conversation-memory.ts` pushed as alternating `HumanMessage`/`AIMessage` after the system message.

### Post-Retrieval

- **Re-ranking.** PARTIAL. `applyHybridSearch` does linear-combination reranking using semantic + intent + keyword + section-relevance scores with adaptive weights, plus a perfect-intent-match bonus boost (0.20–0.35). **No cross-encoder.** No model-based reranker.
- **Answer validated against source chunk.** PARTIAL. The `verifyKBRelevance` LLM gate (gpt-4o-mini, 3 max tokens) only sees `topic` + `subtopic` strings — NOT the chunk content or the user's actual answer. It validates *retrieval relevance*, not *answer faithfulness*.
- **Confidence / source in response.** PARTIAL. API returns `source: "kb" | "llm"` and `isVerbatim` flag. No numeric confidence score. No `doc_id` / topic identifier exposed.
- **Partially relevant chunk.** In kb_strict, falls through to LLM-only. In hybrid, the partial chunk is still injected as KB context. No "use only the relevant part" logic.

### Observability

- **Retrieval queries logged.** Console only. Not persisted.
- **Similarity scores logged per turn.** Console only. Hybrid + semantic + intent scores printed.
- **Answer source logged.** Console only. Returned to the client in the response but not stored server-side per turn.
- **Eval / feedback loop.** MISSING. No thumbs up/down, no golden-question regression set, no offline eval harness, no logged ground-truth pairs.

### Notable system characteristics

- Two parallel exact-intent lookups exist (`checkExactIntentMatchAcrossAllPersonas` at orchestrator entry + `retrieveFromKBByIntentOnly`'s own direct DB scan inside the persona). Both scan up to 1000 docs in-memory per request.
- In-memory `Map` for conversation memory (`memoryStore`) — lost on serverless cold start; doesn't survive across Vercel invocations.
- Heavy heuristic layer (`whyRouter`, `safety-validator`, `relevance-gate`, `query-rewriter`, multiple synonym maps) — system is mostly rules + tuned thresholds, not learned.

---

## PART 2 — BENCHMARK COMPARISON

### Query Intelligence

| Capability | Status | Impact if PARTIAL/MISSING |
|---|---|---|
| **Query rewriting** (resolves pronouns/context before retrieval) | **PARTIAL** | Only fires on short messages matching a fixed regex. A longer follow-up like *"does that one also cause weight gain?"* skips the rewriter — the pronoun "that" gets embedded literally, retrieval drifts to whatever lexically overlaps with "weight gain". Mid-length contextual follow-ups silently degrade. |
| **HyDE** (hypothetical answer embedding) | **MISSING** | Queries phrased very differently from KB intent patterns (e.g. *"my body feels like it's on fire at 3am"* vs. *"why do I get night sweats"*) underperform. HyDE would close that lexical gap. The current synonym map is the manual substitute and only covers cases the team thought of. |
| **Multi-query retrieval** | **MISSING** | Ambiguous queries spanning two topics (*"why am I so tired and gaining weight?"*) get one embedding → one ranked list → one persona. Two retrievals fused would surface both Sleep and Metabolism docs. |
| **Conversation-aware retrieval** | **PARTIAL** | History is given to the LLM at generation time, but the retrieval embedding only contains history when the rule-based rewriter fires. Lisa "knows" the context for chat but retrieves as if every turn were standalone. Direct cause of retrieving the wrong chunk on follow-ups. |

### Retrieval Quality

| Capability | Status | Impact |
|---|---|---|
| **Hybrid search** (vector + BM25 fusion) | **PARTIAL** | A hybrid *scorer* exists (semantic + intent-pattern + keyword + section relevance), but the keyword side is hand-rolled Jaccard over a stop-word list, not BM25, and it runs **only as a reranker** over the top-30 vector candidates. True BM25/full-text recall at the database level is MISSING — a doc with strong lexical match but weak embedding similarity may never enter the candidate pool. |
| **Re-ranking** (cross-encoder) | **MISSING** | Current "rerank" is linear weighting of feature scores with hardcoded weights + bonus boosts. A cross-encoder (Cohere Rerank, BGE-reranker) scores `(query, chunk_content)` jointly — which is what catches semantically close-but-wrong matches. Today the LLM relevance gate substitutes, but it sees only `topic + subtopic`, not the chunk itself. |
| **Parent-chunk / small-to-big retrieval** | **MISSING** | Ingestion is "one section = one doc, no chunking." Sections can be large, so the embedding is an averaged vector across mixed sub-topics. A query for *"action tips for hot flashes"* may not match a 2000-word Hot Flashes overview even though one paragraph inside is a perfect match. |
| **Semantic chunking** | **MISSING** | Chunks are split at human-authored section boundaries, not meaning boundaries. Works because the KB is hand-authored; would not scale for bulk-ingested medical literature. |

### Routing Intelligence

| Capability | Status | Impact |
|---|---|---|
| **Three-tier routing** (verbatim / grounded / LLM) | **YES** | All three tiers exist (verbatim KB, hybrid KB+LLM, LLM-only). Genuinely advanced. Weakness: transitions are hand-tuned thresholds (0.30/0.35/0.45/0.80), not learned. |
| **Intent classification before retrieval** | **PARTIAL** | Persona classifier exists (keywords + KB intent-pattern check + "why" regex). It selects KB subset (filtered by persona) before retrieval. But it's a keyword classifier with a bolted-on DB query scanning up to 1000 docs in-memory *per request* — expensive and fragile. |
| **Routing logged with confidence per turn** | **MISSING** | Decisions and scores are `console.log`-only, not persisted. You cannot answer "what % of queries hit verbatim last week" without reconstruction from raw logs. |

### Prompt Architecture

| Capability | Status | Impact |
|---|---|---|
| **Grounding instruction** in tier 2 | **MISSING** | Hybrid mode prompt explicitly invites the model to *"Combine KB evidence with creative, practical suggestions"*. There is no "do not introduce facts that aren't in the context" clause. For a medical/wellness assistant this is the single biggest hallucination vector. |
| **Uncertainty instruction** | **MISSING** | Persona prompts dictate tone, format, word count, emoji rules — never tell the LLM to acknowledge lack of evidence. Combined with `temperature: 0.7` (base) / `0.35` (KB-grounded), the model confabulates confidently when KB is silent. |
| **Medical safety instruction** | **PARTIAL** | "NEVER provide specific medication names or dosages / prescription advice" + "Encourage healthcare provider consultation" exist in the menopause prompt. No conditional disclaimer appended to clinical/treatment topics — blanket rule the model may forget under prompt pressure. No safety classifier on the answer itself. |
| **Source citation** | **MISSING** | API returns `source: "kb"` and `isVerbatim: true`, but no document ID, topic, or "based on Bone Health → Nutrition Solutions" reference reaches the user or queryable logs. Users can't verify; you can't trace a hallucination back to a chunk. |

### Answer Quality

| Capability | Status | Impact |
|---|---|---|
| **Faithfulness check** (answer vs. source chunk) | **MISSING** | `verifyKBRelevance` runs *before* generation and checks retrieval ↔ query, not answer ↔ chunk. Once hybrid mode generates, nothing checks groundedness. Hallucinations are undetected. |
| **Hallucination detection** | **MISSING** | No NLI-style entailment check, no Ragas-style faithfulness metric, no claim extraction. |
| **`answer_source` field** | **PARTIAL** | Response includes `source` and `isVerbatim`. You can distinguish verbatim from LLM-only, but cannot distinguish *KB-grounded LLM* from *pure LLM* without combining `source === "kb" && !isVerbatim`. Works but undocumented and no chunk-id reference. |

### Observability & Improvement

| Capability | Status | Impact |
|---|---|---|
| **Full retrieval log per turn** | **MISSING** | All telemetry lives in `console.log` and dies with the request. You cannot run aggregate analysis. This is the #1 reason iteration is slow — every tuning decision is anecdote-driven. |
| **Human feedback loop** | **MISSING** | No thumbs up/down. No table linking `message_id ↔ retrieval_event ↔ rating`. |
| **KB gap detection** | **MISSING** | Every kb_strict → LLM fallback is free signal that the KB has a gap. Not captured. After 10k queries you'd have a ranked list of missing topics. |
| **Periodic retrieval eval** | **MISSING** | No test suite, no eval script, no fixture file mapping representative queries to expected `(persona, topic, subtopic)`. Every threshold tweak today is a blind change. |

### Shape of the gap

You've over-invested in **rule-based retrieval precision** (synonym maps, intent normalization, perfect-match boosts, three layers of verbatim gates) and under-invested in:
1. **Conversation-aware retrieval embedding**
2. **Answer-time grounding instructions**
3. **Persisted observability**
4. **Content-level reranking**

Result: a system that is very accurate on queries the team has seen and tuned for, brittle on novel phrasings or multi-turn follow-ups, with no telemetry to confirm or refute the hypothesis. The single most consequential MISSING capability is **persisted per-turn retrieval logging** — not because it improves answers directly, but because every other improvement is a guess without it.

---

## PART 3 — GAP ANALYSIS & ROADMAP

### 1. Critical Gaps (causing wrong answers / hallucinations now)

| # | Gap | Failure it causes | Complexity |
|---|---|---|---|
| C1 | **No grounding instruction in hybrid-mode prompt** | Nutrition Coach and Exercise Trainer are explicitly told to "combine KB evidence with creative, practical suggestions". With temperature 0.35 and no "do not introduce facts outside context" clause, the LLM invents foods, macros, supplement dosages, or workout protocols not in the KB — on a medical-adjacent product. | **Low** |
| C2 | **No uncertainty instruction** | When KB is silent or weak, the LLM confabulates confidently instead of saying *"I don't have evidence on that — please ask your clinician."* No persona prompt contains this clause. | **Low** |
| C3 | **No answer-time faithfulness check** | Once hybrid mode generates, nothing verifies the output stayed in the chunk. `verifyKBRelevance` runs before generation and only sees `topic + subtopic`. | **Medium** |
| C4 | **Conversation-unaware retrieval for mid-length follow-ups** | The rewriter only fires for <12 chars or matching a fixed regex. *"does that also affect bone density?"* (33 chars) → embedded literally → wrong chunk → relevance gate may approve it because "bone density" lexically matches. User gets a fluent answer to the wrong question. | **Low** |
| C5 | **In-memory conversation store on serverless** | `memoryStore = new Map()` lives in process RAM. Vercel cold-starts silently lose history → rewriter has nothing to rewrite against. The client passes `conversationHistory` so it partially masks this, but the orchestrator's fallback path is broken. | **Low** |

### 2. Quality Gaps (degrading quality, not outright failing)

| # | Gap | Impact | Complexity |
|---|---|---|---|
| Q1 | **No cross-encoder reranker** | Linear-combination scoring with hand-tuned weights + bonus boosts is fragile. A reranker scoring `(query, chunk_content)` jointly would replace ~half of the scoring code AND the LLM relevance gate. Symptom: constant threshold tweaking when adding KB sections. | **Low–Medium** |
| Q2 | **No HyDE for novel phrasings** | Colloquial queries that don't match any `intent_pattern` and aren't in the synonym map miss. Team currently patches by hand-extending `intentSynonymMap` and `normalizeTextForIntentMatching`. Doesn't scale. | **Medium** |
| Q3 | **No parent-chunk / small-to-big retrieval** | Sections can be large; embedding represents an averaged vector. Sub-topic queries underperform. Visible in queries asking for action tips vs. overview content. | **Medium** |
| Q4 | **Synonym/normalization maintenance burden** | `intentSynonymMap`, `normalizeAndExpandQuery`, `normalizeTextForIntentMatching`, persona keyword lists — all hardcoded, grown organically. Every new KB topic risks a rule the team forgot to add. | **Medium (to remove)** |
| Q5 | **Two redundant full-KB scans per request** | `checkExactIntentMatchAcrossAllPersonas` (1000 docs) at orchestrator entry; `retrieveFromKBByIntentOnly` repeats with persona filter. Every kb_strict query: 2× full-table pull. Latency + cost. | **Low** |
| Q6 | **Source citation not exposed to client** | `response.source` and `isVerbatim` exist but no `topic`/`subtopic`/`doc_id` reaches the API consumer. Users can't verify; you can't ask a user "which answer was wrong" by reference. | **Low** |

### 3. Observability Gaps (preventing iteration)

| # | Gap | Why it blocks you |
|---|---|---|
| O1 | **No persisted retrieval log table** | Every routing decision, score, top chunk, and source lives in stdout. Cannot run "show all turns where semantic was 0.4–0.5 and we routed LLM" — exactly the diagnostic needed to tune thresholds. |
| O2 | **No feedback capture** | No thumbs up/down. No correlation between user satisfaction and retrieval events. Flying without an outcome signal. |
| O3 | **No KB gap detection** | kb_strict → LLM fallback is free signal that KB lacks content. Not captured. |
| O4 | **No eval/regression set** | No fixture mapping golden queries → expected `(persona, topic, subtopic)`. Every change ships untested. Over-fit to manual spot-checks. |
| O5 | **No latency / cost telemetry per stage** | Two full-KB scans, two LLM gate calls (rewriter + relevance gate), one generation. Don't know which stage dominates. Can't optimize what you can't see. |

### 4. Improvement Roadmap (Impact × Speed)

#### IMMEDIATE — this week (high impact, low effort)

1. **C1 + C2: Add grounding + uncertainty clauses** to hybrid-mode and persona prompts. One-file edit, ~30 min. Stops the largest hallucination vector for nutrition/exercise personas.
2. **C5: Stop relying on in-memory conversation store.** Client already sends history; remove `memoryStore` as silent fallback and make client-passed history authoritative (or persist to Supabase). ~1 hour.
3. **O1: Add `rag_events` Supabase table and log every turn.** Columns: `turn_id, user_id, session_id, raw_query, rewritten_query, persona, mode, top_chunk_id, top_topic, top_subtopic, semantic_score, hybrid_score, intent_score, route, source, is_verbatim, latency_ms, created_at`. Fire-and-forget insert at end of `orchestrateRAG`. ~2–3 hours. **Unlocks every subsequent improvement.**
4. **Q5: De-duplicate the two full-KB intent scans.** Pick one. ~1 hour.
5. **Q6: Expose `top_topic` / `top_subtopic` / `doc_id` in API response.** Trivial. Enables citation and feedback correlation.

#### SHORT TERM — this month (high impact, medium effort)

6. **C4: Broaden the query-rewriting trigger.** Replace "<12 chars OR regex" with a lightweight LLM classifier ("does this query depend on prior context? YES/NO, 3 tokens") OR always rewrite when history exists and the query contains pronouns/demonstratives. ~half day.
7. **C3: Add a faithfulness check on hybrid-mode outputs.** Post-generation gpt-4o-mini call: *"Given this KB context and this answer, list any claims in the answer NOT supported by the context."* If any → regenerate with stricter grounding or fall back to verbatim. ~400ms added on hybrid path only. ~1 day.
8. **Q1: Replace the linear hybrid scorer + relevance gate with a cross-encoder reranker.** Cohere Rerank v3 or BGE-reranker-base via serverless endpoint. Feed top-30 candidates, take top-3. Deletes hundreds of lines of scoring code, removes most threshold tuning, improves precision. ~2–3 days.
9. **O2: Add thumbs up/down on Lisa responses**, stored with `turn_id`. Frontend + API route + table. ~half day.
10. **O3: Flag every LLM-fallback event as a KB-gap candidate** in `rag_events`. Admin view ranking unanswered queries by frequency. ~half day once O1 exists.

#### MEDIUM TERM — this quarter (high impact, high effort)

11. **O4: Build a regression eval harness.** 50–100 golden queries with expected `(persona, topic, subtopic)`. CI script runs them, fails if top-1 hit-rate drops. Safe threshold changes. ~2–3 days for v1, then ongoing curation.
12. **Q3: Small-to-big chunking.** Split large sections into paragraph-level chunks for matching, store `parent_id`; return parent for the LLM but match on the child. Requires re-ingest. ~3–5 days.
13. **Q2: Optional HyDE branch for low-confidence queries.** When top semantic <0.45, generate a hypothetical answer with gpt-4o-mini, embed it, re-retrieve, fuse with original results. Gated by score so latency stays bounded. ~2–3 days.
14. **Q4: Begin retiring manual synonym maps** in favor of embeddings + reranker. Soft deletion gated by eval results.

#### LONG TERM — strategic

15. **Learned router** trained on `rag_events` + feedback data, replacing hand-tuned thresholds. Once you have ~10k labeled events, a simple logistic regression on `(semantic_score, intent_score, hybrid_score, query_length, has_history)` → `route` will outperform the current `if`-tree.
16. **Versioned KB corpus**, not destructive re-ingest. Incremental update by content hash; track which doc versions answered which queries. Necessary if you add a content-author workflow.
17. **Single session store (Supabase)** for conversation + retrieval log. Reconstruct the model context window server-side; don't trust the client to pass full history. Improves continuity across web/mobile.

### 5. Single Most Important Fix (next 48 hours)

**Add the `rag_events` Supabase table and log every retrieval turn (O1).**

Not because it improves answers directly — but because **every other improvement is a guess without it**. Right now you cannot answer:

- What % of queries hit verbatim vs. hybrid vs. LLM?
- What does the score distribution look like when we route wrong?
- Which KB topics get retrieved most? Which never get retrieved?
- Are users asking things the KB doesn't cover?
- When the relevance gate rejects a verbatim match, is it usually right?

Until those questions are answerable, every threshold tweak, prompt change, and "let me add a synonym" is anecdote-driven engineering on a medical product.

#### Implementation sketch

1. **New table `rag_events`** in Supabase:
   - `id uuid primary key default gen_random_uuid()`
   - `created_at timestamptz default now()`
   - `user_id uuid`, `session_id text`
   - `raw_query text`, `rewritten_query text`, `was_rewritten boolean`
   - `persona text`, `retrieval_mode text` (kb_strict/hybrid/llm_reasoning)
   - `route text` (verbatim_intent / verbatim_followup_link / verbatim_kb / hybrid_llm / llm_only / refused)
   - `source text` ("kb" / "llm"), `is_verbatim boolean`
   - `top_doc_id uuid`, `top_topic text`, `top_subtopic text`
   - `top_semantic_score real`, `top_hybrid_score real`, `top_intent_score real`
   - `candidates_returned int`, `relevance_gate_passed boolean`
   - `latency_ms int`
2. **Index** on `(created_at desc)`, `(persona, route)`, `(source)` for common queries.
3. **Insert site:** at the end of `orchestrateRAG` (and in `app/api/langchain-rag/route.ts` after generation), build one event row from variables already in scope.
4. **Fire-and-forget:** do not `await` the insert. Wrap in try/catch so a logging failure never breaks a user response. Use `getSupabaseAdmin()` (service role bypasses RLS).
5. **No backfill required** — start from now. Within a week of traffic you have empirical answers to questions that currently drive tuning by feel.
6. **Phase 2** (optional, later): a thin admin page. For now, raw SQL in the Supabase dashboard pays for the work.

The win: every subsequent item on this roadmap becomes evidence-based instead of intuition-based.

---

## Appendix — Files of interest

- `lib/rag/orchestrator.ts` — main routing and tier selection
- `lib/rag/retrieval.ts` — embedding, hybrid scoring, intent matching, adaptive thresholds
- `lib/rag/query-rewriter.ts` — rule-based follow-up detector + LLM rewriter
- `lib/rag/relevance-gate.ts` — pre-generation LLM relevance check
- `lib/rag/persona-classifier.ts` — keyword + KB intent-pattern persona routing
- `lib/rag/persona-prompts.ts` + `lib/rag/personas/buildPersonaPrompt.ts` — system prompts
- `lib/rag/conversation-memory.ts` — in-memory (volatile) history store
- `lib/rag/response-formatter.ts` — verbatim response rendering + KB-for-LLM formatting
- `app/api/langchain-rag/route.ts` — auth, tracker context, orchestration call, generation
- `scripts/ingest-documents.ts` — KB ingestion (destructive rebuild)
- `knowledge-base/*.md` — KB source (YAML frontmatter + content sections)
