import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

export const runtime = "nodejs";

// This endpoint uses the service role to create the user_trials table
// Call it once to set up the table: POST /api/admin/create-user-trials-table
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const databaseUrl = process.env.DATABASE_URL;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase environment variables" },
        { status: 500 }
      );
    }

    // Read migration SQL
    const migrationSQL = readFileSync(
      join(process.cwd(), "supabase-migration-user-trials.sql"),
      "utf-8"
    );

    // Try to get database connection string
    let connectionString = databaseUrl;

    if (!connectionString) {
      // Try to construct from environment
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
      const dbPassword = process.env.SUPABASE_DB_PASSWORD;
      const dbHost = process.env.SUPABASE_DB_HOST || `aws-0-us-east-1.pooler.supabase.com`;

      if (projectRef && dbPassword) {
        connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@${dbHost}:6543/postgres`;
      }
    }

    if (!connectionString) {
      return NextResponse.json(
        {
          error: "Database connection string not found",
          message: "Please set DATABASE_URL or SUPABASE_DB_PASSWORD in environment variables",
          manualInstructions: "Apply the migration manually in Supabase SQL Editor",
        },
        { status: 500 }
      );
    }

    // Connect to database and execute migration
    const client = new pg.Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      await client.query(migrationSQL);

      // Verify table was created
      const result = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_trials'
      `);

      await client.end();

      if (result.rows.length > 0) {
        return NextResponse.json({
          success: true,
          message: "user_trials table created successfully",
        });
      } else {
        return NextResponse.json({
          success: false,
          message: "Migration executed but table not found",
        });
      }
    } catch (dbError) {
      await client.end();
      throw dbError;
    }
  } catch (error) {
    console.error("Error creating user_trials table:", error);
    return NextResponse.json(
      {
        error: "Failed to create table",
        message: error instanceof Error ? error.message : String(error),
        manualInstructions: "Apply the migration manually in Supabase SQL Editor",
      },
      { status: 500 }
    );
  }
}




