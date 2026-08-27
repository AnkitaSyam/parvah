/**
 * backend/services/embeddings.js
 *
 * Local, free text embeddings via transformers.js (@xenova/transformers).
 * Model: Xenova/all-MiniLM-L6-v2 (384-dim, ONNX, runs on CPU in Node).
 *
 * No API key required. The model (~90MB) is downloaded once from the
 * Hugging Face Hub on first use and cached on disk afterward
 * (default cache dir: node_modules/@xenova/transformers/.cache, or
 * override with process.env.TRANSFORMERS_CACHE).
 */

export class EmbeddingUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

// Lazy-loaded singleton so the model is only downloaded/initialized once
// per process, not once per request.
let extractorPromise = null;
let embeddingsUnavailable = false;
let loadError = null;

/**
 * Lazy extractor promise resolver.
 * NOTE: This lazy-load dynamic import pattern is intentional and required. 
 * The top-level static import of @xenova/transformers was removed specifically 
 * because failure to load its native binary dependencies (e.g. sharp or 
 * onnxruntime) crashed the entire Express process at boot time. Moving it here 
 * allows the server to boot successfully and degrade gracefully.
 */
async function getExtractor() {
  if (embeddingsUnavailable) {
    throw new EmbeddingUnavailableError(`Embedding model is unavailable. Initial load failed: ${loadError?.message}`);
  }
  if (!extractorPromise) {
    try {
      const transformers = await import('@xenova/transformers');
      extractorPromise = await transformers.pipeline('feature-extraction', MODEL_NAME);
    } catch (err) {
      embeddingsUnavailable = true;
      loadError = err;
      console.warn('⚠️ Failed to dynamically load @xenova/transformers or initialize pipeline:', err.message);
      throw new EmbeddingUnavailableError(`Failed to initialize embedding pipeline: ${err.message}`);
    }
  }
  return extractorPromise;
}

/**
 * Embeds a single string into a 384-dim vector (mean-pooled, L2-normalized,
 * ready for cosine similarity / pgvector's <=> operator).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('embedText error: non-empty string is required.');
  }

  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    // output.data is a Float32Array; pgvector/JS client wants a plain array.
    return Array.from(output.data);
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError || embeddingsUnavailable) {
      throw new EmbeddingUnavailableError(err.message);
    }
    throw err;
  }
}

/**
 * Embeds many strings in a single batch. transformers.js doesn't require
 * batching the way GPU-bound libraries do, but this keeps a clean call
 * shape for scripts that embed a whole myth catalog at once.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
export async function embedBatch(texts) {
  const results = [];
  for (const text of texts) {
    results.push(await embedText(text));
  }
  return results;
}

/**
 * Builds the canonical text representation of a myth used for embedding.
 * Keep this consistent between seeding/backfill and query-time embedding
 * of transcripts isn't needed (transcripts embed as-is) — but myths
 * should always be embedded the same way so re-runs stay stable.
 */
export function mythEmbeddingText(myth) {
  return [myth.myth_title, myth.common_myth].filter(Boolean).join('. ');
}
