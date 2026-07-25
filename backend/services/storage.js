import { supabase } from '../config/supabase.js';

/**
 * Ensures that the private 'audio' storage bucket exists in Supabase.
 * If not, attempts to create it as a private bucket.
 */
async function ensureAudioBucketExists() {
  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      throw new Error(`Failed to list storage buckets: ${listError.message}`);
    }

    const hasAudioBucket = buckets?.some((b) => b.name === 'audio');
    if (!hasAudioBucket) {
      console.log('📦 Private storage bucket "audio" not found. Creating bucket...');
      const { error: createError } = await supabase.storage.createBucket('audio', {
        public: false,
        fileSizeLimit: 10485760, // 10MB limit
        allowedMimeTypes: ['audio/*']
      });

      if (createError) {
        throw new Error(`Failed to create "audio" storage bucket: ${createError.message}`);
      }
      console.log('📦 Private storage bucket "audio" successfully created.');
    }
  } catch (err) {
    console.error('❌ Storage initialization error:', err.message);
    throw new Error(`Storage bucket check/creation failed: ${err.message}`);
  }
}

/**
 * Uploads a file to a private Supabase storage bucket named "audio".
 * Path structure: {patientId}/{timestamp}-{filename}
 * 
 * @param {Express.Multer.File} file - Multer file object
 * @param {string} patientId - UUID of the patient
 * @returns {Promise<string>} The uploaded file storage path inside the bucket
 */
export async function uploadAudioFile(file, patientId) {
  if (!file) {
    throw new Error('uploadAudioFile error: No file provided.');
  }
  if (!patientId) {
    throw new Error('uploadAudioFile error: patientId is required.');
  }

  // 1. Ensure the bucket exists
  await ensureAudioBucketExists();

  // 2. Generate file name and upload path
  const timestamp = Date.now();
  const fileExt = file.originalname.split('.').pop() || 'webm';
  const rawBaseName = file.originalname.substring(0, file.originalname.lastIndexOf('.')) || file.originalname;
  // Sanitize the filename to alphanumeric + underscores
  const sanitizedBaseName = rawBaseName.replace(/[^a-zA-Z0-9]/g, '_');
  const storagePath = `${patientId}/${timestamp}-${sanitizedBaseName}.${fileExt}`;

  // 3. Upload file buffer to Supabase Storage using admin/service role client
  try {
    const { data, error } = await supabase.storage
      .from('audio')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      throw error;
    }

    console.log(`✅ Audio file successfully uploaded to Supabase Storage path: ${data.path}`);
    return data.path;
  } catch (error) {
    console.error('❌ Supabase storage upload error:', error.message);
    throw new Error(`Failed to upload audio to Supabase Storage: ${error.message}`);
  }
}
