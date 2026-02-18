import { readFileSync } from "fs";
import { join } from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: join(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase environment variables");
  console.error("Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function applyMigration() {
  try {
    console.log("📖 Reading migration file...");
    const migrationSQL = readFileSync(
      join(process.cwd(), "supabase-migration-user-trials.sql"),
      "utf-8"
    );

    // Supabase JS client doesn't support raw SQL execution directly
    // We need to use the Management API or pg library
    // For now, we'll output instructions
    
    console.log("\n⚠️  Direct SQL execution via Supabase JS client is not supported.");
    console.log("\n✅ Please apply the migration manually:");
    console.log("\n1. Go to Supabase Dashboard → SQL Editor");
    console.log("2. Copy and paste the contents of: supabase-migration-user-trials.sql");
    console.log("3. Click 'Run' to execute\n");
    
    console.log("📄 Migration SQL preview (first 500 chars):");
    console.log(migrationSQL.substring(0, 500) + "...\n");
    
    console.log("💡 Alternative: Use Supabase CLI if installed:");
    console.log("   supabase db push supabase-migration-user-trials.sql\n");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

applyMigration();

