/**
 * backend/scripts/testMythRetrieval.js
 *
 * Quick manual sanity check: embeds a sample transcript and prints the
 * myths semantic retrieval finds for it. Not part of the app's request
 * path -- just a CLI tool to confirm migration 004 + embed:myths worked
 * end-to-end before relying on it in the real pipeline.
 *
 * Usage:
 *   node scripts/testMythRetrieval.js "my aunt told me not to eat papaya during pregnancy"
 */

import { retrieveRelevantMyths } from '../services/mythRetrieval.js';

const transcript = process.argv[2] ||
  'I have had a headache for two days and my aunt told me not to eat papaya during pregnancy.';

console.log(`Transcript: "${transcript}"\n`);

try {
  const matches = await retrieveRelevantMyths(transcript, { matchThreshold: 0.3, matchCount: 5 });

  if (matches.length === 0) {
    console.log('No myths matched above the similarity threshold.');
  } else {
    console.log(`Top ${matches.length} match(es):\n`);
    matches.forEach((m, i) => {
      console.log(`${i + 1}. [similarity: ${m.similarity.toFixed(3)}] ${m.myth_title}`);
    });
  }
} catch (err) {
  console.error('Retrieval failed:', err.message);
  process.exitCode = 1;
}
