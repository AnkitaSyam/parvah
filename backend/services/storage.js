/**
 * backend/services/storage.js
 *
 * Visit audio is a recorded medical conversation about a named pregnant
 * woman. It previously landed on local disk and was served by
 * express.static at /uploads with no authentication and CORS wide open —
 * anyone with a filename could download a patient's consultation. Local disk
 * is also ephemeral on every container host, so recordings vanished on
 * redeploy and later processing silently fell back to a mock transcript.
 *
 * This module is now actually wired into the upload route. Files go to a
 * private Supabase Storage bucket; playback is via short-lived signed URLs
 * issued only to the ASHA worker who owns the visit.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { supabase } from '../config/supabase.js';

const BUCKET = 'visit-audio';
const MAX_BYTES = 25 * 1024 * 1024; // Groq Whisper's own upload ceiling
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

export const AUDIO_BUCKET = BUCKET;
export const MAX_AUDIO_BYTES = MAX_BYTES;

export const ALLOWED_AUDIO_MIME = [
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4',
  'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/flac',
  'video/webm' // MediaRecorder on some browsers labels webm audio this way
];

let bucketReady = false;

/**
 * Ensures the private bucket exists. Cached after the first success so this
 * is not a round-trip on every upload.
 */
async function ensureBucket() {
  if (bucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw new Error(`Could not list storage buckets: ${listError.message}`);
  }

  if (!buckets?.some((b) => b.name === BUCKET)) {
    console.log(`📦 Creating private storage bucket "${BUCKET}"…`);
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ALLOWED_AUDIO_MIME
    });

    // A concurrent request may have created it between our list and create.
    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(`Could not create the "${BUCKET}" bucket: ${createError.message}`);
    }
  }

  bucketReady = true;
}

/**
 * Uploads visit audio to the private bucket.
 *
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, size: number }} file
 * @param {string} patientId
 * @returns {Promise<{ path: string, size: number, mimetype: string }>}
 */
export async function uploadAudioFile(file, patientId) {
  if (!file?.buffer) throw new Error('uploadAudioFile error: no file buffer provided.');
  if (!patientId) throw new Error('uploadAudioFile error: patientId is required.');
  if (file.buffer.length > MAX_BYTES) {
    throw new Error(`Audio file is too large (${Math.round(file.buffer.length / 1048576)} MB). The limit is ${MAX_BYTES / 1048576} MB.`);
  }

  await ensureBucket();

  const ext = (path.extname(file.originalname || '') || '.webm').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const storagePath = `${patientId}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype || 'audio/webm',
      upsert: false
    });

  if (error) {
    throw new Error(`Could not upload audio to storage: ${error.message}`);
  }

  return { path: data.path, size: file.buffer.length, mimetype: file.mimetype };
}

/**
 * Issues a short-lived signed URL for playback. The caller is responsible for
 * having already checked, via RLS, that this worker owns the visit.
 *
 * @param {string} storagePath
 * @returns {Promise<string|null>}
 */
export async function getSignedAudioUrl(storagePath) {
  if (!storagePath) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn(`Could not sign audio URL for ${storagePath}: ${error.message}`);
    return null;
  }

  return data.signedUrl;
}

/**
 * Downloads an object to a temporary file so it can be streamed to Whisper,
 * which needs a file handle rather than a buffer.
 *
 * The caller must delete the returned path — use removeTempFile().
 *
 * @param {string} storagePath
 * @returns {Promise<string>} absolute path to the temp file
 */
export async function downloadToTempFile(storagePath) {
  if (!storagePath) throw new Error('downloadToTempFile error: storagePath is required.');

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);

  if (error) {
    throw new Error(`Could not download audio ${storagePath}: ${error.message}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(storagePath) || '.webm';
  const tempPath = path.join(os.tmpdir(), `parvah-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);

  await fs.promises.writeFile(tempPath, buffer);
  return tempPath;
}

/**
 * Best-effort temp file cleanup. Never throws — a failed unlink must not fail
 * a request that otherwise succeeded.
 */
export async function removeTempFile(tempPath) {
  if (!tempPath) return;
  try {
    await fs.promises.unlink(tempPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Could not remove temp file ${tempPath}: ${err.message}`);
    }
  }
}

/**
 * Permanently deletes a stored recording (used when a visit is deleted).
 */
export async function deleteAudioFile(storagePath) {
  if (!storagePath) return;
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.warn(`Could not delete audio ${storagePath}: ${error.message}`);
  }
}
