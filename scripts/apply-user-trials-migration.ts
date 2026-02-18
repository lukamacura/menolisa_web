import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function applyMigration() {
  try {
    console.log("Reading migration file...");
    const migrationSQL = readFileSync(
      join(process.cwd(), "supabase-migration-user-trials.sql"),
      "utf-8"
    );

    console.log("Applying migration to Supabase...");
    
    // Split SQL into individual statements and execute them
    // Note: Supabase REST API doesn't support multi-statement queries directly
    // So we'll use the Postgres connection via rpc or execute raw SQL
    // For now, we'll use the REST API's rpc function if available, or guide manual execution
    
    // Actually, the best way is to use Supabase's SQL execution via REST API
    // But that requires the Management API. Let's try using the PostgREST rpc approach
    // or we can use the pg library directly
    
    console.log("⚠️  Direct SQL execution via API is not available.");
    console.log("Please run the migration manually in Supabase SQL Editor:");
    console.log("\nFile: supabase-migration-user-trials.sql\n");
    console.log("Or use the Supabase CLI if available.");
    
    // Alternative: Try to execute via REST API using a function
    // But this requires the SQL to be in a function, which is complex
    
    process.exit(0);
  } catch (error) {
    console.error("Error applying migration:", error);
    process.exit(1);
  }
}

applyMigration();

