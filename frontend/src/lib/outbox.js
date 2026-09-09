/**
 * frontend/src/lib/outbox.js
 *
 * Offline recording queue.
 *
 * The stated user works in villages with no signal, and until now every
 * action required a live backend — a recording made out of coverage was
 * simply lost. Visits are now queued in IndexedDB with their audio, and
 * uploaded automatically when a connection returns.
 *
 * IndexedDB rather than localStorage because audio Blobs are megabytes and
 * localStorage is a ~5 MB string store. Blobs are stored directly; IndexedDB
 * handles them natively, so nothing is base64-encoded.
 */

const DB_NAME = 'parvah-outbox';
const DB_VERSION = 1;
const STORE = 'pending_visits';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser cannot store visits offline.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('queued_at', 'queued_at');
        store.createIndex('status', 'status');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the offline store.'));
  });

  return dbPromise;
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Queues a visit for upload when a connection is available.
 *
 * @param {{ patientId: string, patientName?: string, audioBlob?: Blob, notes?: string }} visit
 * @returns {Promise<number>} the queue entry id
 */
export async function queueVisit({ patientId, patientName, audioBlob, notes }) {
  if (!patientId) throw new Error('A patient is required to queue a visit.');

  const entry = {
    patient_id: patientId,
    patient_name: patientName || null,
    audio: audioBlob || null,
    audio_type: audioBlob?.type || null,
    audio_size: audioBlob?.size || 0,
    notes: notes || '',
    queued_at: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    last_error: null
  };

  return tx('readwrite', (store) => store.add(entry));
}

/** Every queued entry, oldest first. */
export async function listQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve((request.result || []).sort(
      (a, b) => new Date(a.queued_at) - new Date(b.queued_at)
    ));
    request.onerror = () => reject(request.error);
  });
}

export async function queueCount() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const request = store.count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeFromQueue(id) {
  return tx('readwrite', (store) => store.delete(id));
}

async function updateEntry(id, changes) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (!entry) { resolve(null); return; }
      store.put({ ...entry, ...changes });
    };
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Clears entries that have failed too many times to be worth retrying. */
export async function clearFailed() {
  const entries = await listQueue();
  await Promise.all(
    entries.filter((e) => e.status === 'failed').map((e) => removeFromQueue(e.id))
  );
}

const MAX_ATTEMPTS = 5;

/**
 * Uploads everything in the queue, oldest first.
 *
 * Sequential rather than parallel: an ASHA worker on a village edge-of-signal
 * connection does better with one request at a time than five competing ones,
 * and it keeps the progress count honest.
 *
 * @param {Object} api - the api client (injected to avoid a circular import)
 * @param {(progress: {done:number,total:number,current:Object}) => void} [onProgress]
 * @returns {Promise<{ uploaded: number, failed: number, remaining: number }>}
 */
export async function flushQueue(api, onProgress) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { uploaded: 0, failed: 0, remaining: await queueCount() };
  }

  const entries = (await listQueue()).filter((e) => e.status !== 'uploading');
  let uploaded = 0;
  let failed = 0;

  for (const [index, entry] of entries.entries()) {
    onProgress?.({ done: index, total: entries.length, current: entry });

    try {
      await updateEntry(entry.id, { status: 'uploading' });

      const file = entry.audio
        ? new File([entry.audio], `visit-${entry.id}.webm`, { type: entry.audio_type || 'audio/webm' })
        : null;

      const uploadRes = await api.uploadVisitAudio(entry.patient_id, file);
      const visitId = uploadRes.data.id;

      // Analysis is best-effort: once the recording is safely on the server
      // the entry has done its job, and analysis can be re-run from the visit.
      try {
        await api.processVisitAi(visitId, entry.notes || undefined);
      } catch (analysisError) {
        console.warn(`Queued visit ${entry.id} uploaded but analysis failed:`, analysisError.message);
      }

      await removeFromQueue(entry.id);
      uploaded += 1;
    } catch (err) {
      const attempts = (entry.attempts || 0) + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;

      await updateEntry(entry.id, {
        status: giveUp ? 'failed' : 'pending',
        attempts,
        last_error: err.message
      });

      failed += 1;

      // A network failure means the connection dropped again — stop rather
      // than burning through the rest of the queue with the same error.
      if (err.code === 'NETWORK_ERROR') break;
    }
  }

  onProgress?.({ done: entries.length, total: entries.length, current: null });

  return { uploaded, failed, remaining: await queueCount() };
}

/**
 * Registers the service worker that caches the app shell, so Parvah opens at
 * all when the device is offline. Safe to call more than once.
 */
export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return; // the dev server serves modules the SW must not cache

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err.message);
    });
  });
}
