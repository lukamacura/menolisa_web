import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/getAuthenticatedUser';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { generateAndPersistInsight } from '@/lib/insights/aiInsight';
import type { InsightApiResponse } from '@/lib/insights/types';

export const runtime = 'nodejs';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  // 1. Authenticate (supports cookie and Bearer token)
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const forceRefresh = req.nextUrl.searchParams.get('refresh') === 'true';

  // 2. Query user_insights for this user
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existingRow, error: readError } = await supabaseAdmin
    .from('user_insights')
    .select('insight, generated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (readError) {
    console.error('[insights] read error:', readError);
  }

  const now = Date.now();

  if (existingRow && !forceRefresh) {
    const generatedAt = new Date(existingRow.generated_at).getTime();
    const ageMs       = now - generatedAt;

    // 3. Fresh cache hit — return immediately
    if (ageMs < CACHE_TTL_MS) {
      const body: InsightApiResponse = {
        insight: existingRow.insight,
        cached:  true,
      };
      return NextResponse.json(body);
    }

    // 4. Stale — return old data immediately, regenerate in background
    void generateAndPersistInsight(user.id).catch(err =>
      console.error('[insights] background regeneration failed:', err)
    );

    const body: InsightApiResponse = {
      insight: existingRow.insight,
      cached:  true,
      stale:   true,
    };
    return NextResponse.json(body);
  }

  // 5. No row yet, or ?refresh=true — full blocking generation
  try {
    const insight = await generateAndPersistInsight(user.id);
    const body: InsightApiResponse = {
      insight,
      cached: false,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[insights] generation error:', err);
    return NextResponse.json(
      { error: 'Failed to generate insight' },
      { status: 500 }
    );
  }
}
