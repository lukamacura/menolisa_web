/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { fetchTrackerData, analyzeTrackerData } from "@/lib/trackerAnalysis";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";

export const runtime = "nodejs";

// GET: Get tracker insights and patterns
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    // Fetch and analyze tracker data
    const trackerData = await fetchTrackerData(user.id, days);
    const summary = analyzeTrackerData(
      trackerData.symptomLogs,
      trackerData.dailyMood
    );

    return NextResponse.json(
      { 
        data: summary,
        period: `${days} days`,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (e: any) {
    console.error("GET /api/tracker-insights error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

