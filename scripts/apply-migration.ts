import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

async function applyMigration() {
  // supabaseUrl is guaranteed to be defined due to check above
  const dbHost = process.env.SUPABASE_DB_HOST || 
    (supabaseUrl ? 'db.' + supabaseUrl.replace('https://', '').replace('.supabase.co', '') + '.supabase.co' : 'localhost');
  
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL || 
      `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@${dbHost}:5432/postgres`,
  });

  try {
    console.log("Connecting to database...");
    await client.connect();

    console.log("Reading migration file...");
    const migrationSQL = readFileSync(
      join(process.cwd(), "supabase-migration-user-trials.sql"),
      "utf-8"
    );

    console.log("Applying migration...");
    await client.query(migrationSQL);

    console.log("✅ Migration applied successfully!");
    await client.end();
  } catch (error) {
    console.error("❌ Error applying migration:", error);
    await client.end();
    process.exit(1);
  }
}

applyMigration();

