/**
 * backend/services/mythRetrieval.js
 *
 * Semantic retrieval of relevant myths for a visit transcript, via
 * pgvector cosine similarity (see migration 004_add_myth_embeddings.sql).
 *
 * This replaces two previously fragile things:
 *  1. Passing the ENTIRE myth catalog as text into every LLM prompt
 *     (doesn't scale, wastes tokens).
 *  2. The hardcoded keyword-matching fallback used when the LLM call
 *     failed (missed anything not in a 4-item if/else chain — e.g. the
 *     papaya myth, which was seeded in the DB but never checked for).
 */

import { supabaseAdmin } from '../config/supabase.js';
import { embedText } from './embeddings.js';

const DEFAULT_MATCH_THRESHOLD = 0.45;
const DEFAULT_MATCH_COUNT = 5;

/**
 * Returns myths whose stored embedding is semantically close to the given
 * transcript, ordered by similarity (highest first).
 *
 * @param {string} transcript
 * @param {{ matchThreshold?: number, matchCount?: number }} [options]
 * @returns {Promise<Array<{ id, external_id, myth_title, common_myth, medical_fact, counseling_guidance, category, similarity }>>}
 */
export async function retrieveRelevantMyths(transcript, options = {}) {
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return [];
  }

  const matchThreshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
  const matchCount = options.matchCount ?? DEFAULT_MATCH_COUNT;

  const queryEmbedding = await embedText(transcript);

  const { data, error } = await supabaseAdmin.rpc('match_pregnancy_myths', {
    query_embedding: queryEmbedding,
    match_threshold: matchThreshold,
    match_count: matchCount
  });

  if (error) {
    throw new Error(`Semantic myth retrieval failed: ${error.message}`);
  }

  return data || [];
}
