// @ts-nocheck
import { restoreAuthSession } from './auth.js';

const SYNC_TICK_EVENT = 'ims-sync-tick';
const SYNC_STATE_EVENT = 'ims-sync-state';

let intervalId = null;
let inFlight = false;
let lastSyncedAt = null;

function emitSyncState() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(SYNC_STATE_EVENT, {
      detail: {
        syncing: inFlight,
        lastSyncedAt,
      },
    })
  );
}

function emitSyncTick(source) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(SYNC_TICK_EVENT, {
      detail: {
        source: String(source || 'manual'),
        at: lastSyncedAt,
      },
    })
  );
}

export function getSyncState() {
  return {
    syncing: inFlight,
    lastSyncedAt,
  };
}

export async function triggerSync(source = 'manual') {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'Sync is only available in browser.' };
  }

  if (inFlight) {
    return { ok: false, error: 'Sync already in progress.' };
  }

  inFlight = true;
  emitSyncState();

  try {
    await restoreAuthSession();
    lastSyncedAt = Date.now();
    emitSyncTick(source);
    return { ok: true, lastSyncedAt };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    inFlight = false;
    emitSyncState();
  }
}

export function startAutoSync(intervalMs = 15000) {
  if (typeof window === 'undefined') {
    return;
  }

  stopAutoSync();

  const safeIntervalMs = Math.max(5000, Number(intervalMs) || 15000);
  intervalId = window.setInterval(() => {
    triggerSync('auto');
  }, safeIntervalMs);
}

export function stopAutoSync() {
  if (typeof window === 'undefined') {
    return;
  }

  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

export function subscribeToSync(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) => {
    listener(event?.detail ?? null);
  };

  window.addEventListener(SYNC_TICK_EVENT, handler);

  return () => {
    window.removeEventListener(SYNC_TICK_EVENT, handler);
  };
}

export function subscribeToSyncState(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listener(getSyncState());

  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) => {
    listener(event?.detail ?? null);
  };

  window.addEventListener(SYNC_STATE_EVENT, handler);

  return () => {
    window.removeEventListener(SYNC_STATE_EVENT, handler);
  };
}
