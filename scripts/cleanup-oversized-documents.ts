/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Cleanup Script: Remove or Split Oversized Documents
 * 
 * This script identifies and handles documents in the database that exceed
 * the 10,240 character limit for Supabase UI display.
 * 
 * Usage:
 *   npx tsx scripts/cleanup-oversized-documents.ts [--delete|--split]
 * 
 * Options:
 *   --delete: Delete oversized documents (default)
 *   --split: Attempt to split oversized documents (experimental)
 */

// Load environment variables
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_CHARS = 10000; // Character limit (10,240 is Supabase UI limit, we use 10,000 for safety)

/**
 * Estimate token count (rough approximation: ~4 characters per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Find all oversized documents
 */
async function findOversizedDocuments() {
  console.log("🔍 Searching for oversized documents...");
  
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, content, metadata');
  
  if (error) {
    console.error("❌ Error fetching documents:", error);
    return [];
  }
  
  if (!documents) {
    console.log("📭 No documents found in database");
    return [];
  }
  
  const oversized = documents.filter(doc => {
    const chars = doc.content?.length || 0;
    return chars > MAX_CHARS;
  });
  
  console.log(`📊 Found ${documents.length} total documents`);
  console.log(`⚠️  Found ${oversized.length} oversized documents (>${MAX_CHARS} chars)`);
  
  if (oversized.length > 0) {
    console.log("\n📋 Oversized documents:");
    oversized.forEach((doc, index) => {
      const chars = doc.content?.length || 0;
      const tokens = estimateTokens(doc.content || '');
      const subtopic = (doc.metadata as any)?.subtopic || 'Unknown';
      console.log(`   ${index + 1}. ID: ${doc.id}`);
      console.log(`      Subtopic: ${subtopic.substring(0, 60)}...`);
      console.log(`      Size: ${chars} chars, ~${tokens} tokens`);
    });
  }
  
  return oversized;
}

/**
 * Delete oversized documents
 */
async function deleteOversizedDocuments(oversized: any[]) {
  console.log(`\n🗑️  Deleting ${oversized.length} oversized documents...`);
  
  const ids = oversized.map(doc => doc.id);
  
  // Delete in batches to avoid issues
  const BATCH_SIZE = 50;
  let deleted = 0;
  
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('documents')
      .delete()
      .in('id', batch);
    
    if (error) {
      console.error(`   ✗ Error deleting batch: ${error.message}`);
    } else {
      deleted += batch.length;
      console.log(`   ✓ Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} documents)`);
    }
  }
  
  console.log(`\n✅ Deleted ${deleted} oversized documents`);
  console.log("💡 Run the ingestion script again to re-ingest these documents with proper chunking:");
  console.log("   npx tsx scripts/ingest-documents.ts");
}

/**
 * Main function
 */
async function main() {
  // Check environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    process.exit(1);
  }
  
  const args = process.argv.slice(2);
  const mode = args.includes('--split') ? 'split' : 'delete';
  
  console.log("🧹 Document Cleanup Script");
  console.log(`📝 Mode: ${mode === 'delete' ? 'Delete oversized documents' : 'Split oversized documents'}\n`);
  
  const oversized = await findOversizedDocuments();
  
  if (oversized.length === 0) {
    console.log("\n✅ No oversized documents found. Database is clean!");
    process.exit(0);
  }
  
  if (mode === 'delete') {
    await deleteOversizedDocuments(oversized);
  } else {
    console.log("\n⚠️  Split mode is not yet implemented.");
    console.log("💡 Please use --delete mode to remove oversized documents, then re-ingest.");
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log("\n✨ Cleanup complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}

export { findOversizedDocuments, deleteOversizedDocuments };

