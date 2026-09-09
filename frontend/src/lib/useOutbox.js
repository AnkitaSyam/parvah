import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { queueCount, flushQueue, listQueue, clearFailed } from './outbox';

/**
 * Tracks connectivity and the offline visit queue, and drains the queue
 * automatically when a connection returns.
 *
 * `navigator.onLine` only reports whether the device has *a* network
 * interface — a phone showing one bar of unusable GPRS still reports true.
 * So a failed upload also marks us offline until the next successful call,
 * rather than trusting the flag alone.
 */
export function useOutbox({ enabled = true } = {}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  // Guards against two flushes racing when the browser fires `online` at the
  // same moment as the interval tick.
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const entries = await listQueue();
      setPending(entries.filter((e) => e.status !== 'failed').length);
      setFailed(entries.filter((e) => e.status === 'failed').length);
    } catch {
      setPending(0);
      setFailed(0);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!enabled || flushingRef.current) return null;

    const count = await queueCount().catch(() => 0);
    if (count === 0) return null;

    flushingRef.current = true;
    setSyncing(true);

    try {
      const result = await flushQueue(api, setProgress);
      setLastResult(result);
      setIsOnline(result.uploaded > 0 ? true : isOnline);
      await refreshCount();
      return result;
    } catch (err) {
      console.warn('Outbox sync failed:', err.message);
      return null;
    } finally {
      flushingRef.current = false;
      setSyncing(false);
      setProgress(null);
    }
  }, [enabled, refreshCount, isOnline]);

  // Connectivity events.
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); sync(); };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [sync]);

  // Initial count, plus one attempt in case the app opened already online
  // with a queue left over from a previous session.
  useEffect(() => {
    if (!enabled) return;
    refreshCount().then(() => sync());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Retry periodically while anything is queued — `online` does not fire when
  // a connection improves from unusable to usable.
  useEffect(() => {
    if (!enabled || pending === 0) return undefined;
    const id = setInterval(() => { if (navigator.onLine) sync(); }, 45_000);
    return () => clearInterval(id);
  }, [enabled, pending, sync]);

  const discardFailed = useCallback(async () => {
    await clearFailed();
    await refreshCount();
  }, [refreshCount]);

  return {
    isOnline, pending, failed, syncing, progress, lastResult,
    sync, refreshCount, discardFailed
  };
}
