/**
 * backend/scripts/embedMyths.js
 *
 * Computes and stores embeddings for every row in pregnancy_myths that
 * doesn't have one yet (or all rows, with --force).
 *
 * Run after seeding/updating the myth catalog:
 *   npm run seed:myths
 *   npm run embed:myths
 *
 * Requires migration 004_add_myth_embeddings.sql to have been applied
 * (adds the `embedding vector(384)` column + match_pregnancy_myths RPC).
 */

import { supabaseAdmin } from '../config/supabase.js';
import { embedText, mythEmbeddingText } from '../services/embeddings.js';

const FORCE = process.argv.includes('--force');

async function embedMyths() {
  const query = supabaseAdmin
    .from('pregnancy_myths')
    .select('id, myth_title, common_myth, embedding');

  const { data: myths, error } = await query;
  if (error) throw error;

  const targets = FORCE ? myths : myths.filter((m) => !m.embedding);

  if (targets.length === 0) {
    console.log('✅ All myths already have embeddings. Use --force to re-embed everything.');
    return;
  }

  console.log(`Embedding ${targets.length} myth(s)${FORCE ? ' (forced re-embed)' : ''}...`);

  let done = 0;
  for (const myth of targets) {
    const text = mythEmbeddingText(myth);
    const embedding = await embedText(text);

    const { error: updateError } = await supabaseAdmin
      .from('pregnancy_myths')
      .update({ embedding })
      .eq('id', myth.id);

    if (updateError) {
      console.error(`❌ Failed to store embedding for myth ${myth.id}: ${updateError.message}`);
      continue;
    }

    done += 1;
    console.log(`  [${done}/${targets.length}] ${myth.myth_title}`);
  }

  console.log(`✅ Embedded ${done}/${targets.length} myths.`);
}

embedMyths().catch((error) => {
  console.error('Failed to embed myth database:', error.message);
  process.exitCode = 1;
});
