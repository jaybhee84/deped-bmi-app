import React, { useState, useEffect, useCallback } from 'react';
import {
  isOnline, isSupabaseConfigured, getQueueLength,
  loadLastSync, syncToServer, pruneSyncQueue, discardPendingUploads,
} from '../utils/syncService';
import './SyncStatus.css';

export default function SyncStatus({ students, schoolId }) {
  const [online,      setOnline]      = useState(isOnline());
  const [configured,  setConfigured]  = useState(isSupabaseConfigured());
  const [queueLen,    setQueueLen]    = useState(getQueueLength());
  const [syncing,     setSyncing]     = useState(false);
  const [lastSync,    setLastSync]    = useState(loadLastSync());
  const [syncMsg,     setSyncMsg]     = useState(null);

  // Refresh state
  const refresh = useCallback(() => {
    setOnline(isOnline());
    setConfigured(isSupabaseConfigured());
    setQueueLen(getQueueLength());
    setLastSync(loadLastSync());
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    window.addEventListener('online',  refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('local-storage-sync-update', refresh);
    return () => {
      window.removeEventListener('online',  refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('local-storage-sync-update', refresh);
    };
  }, [refresh]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && configured && queueLen > 0) {
      handleSync();
    }
    // eslint-disable-next-line
  }, [online]);

  // Refresh queue count whenever students change
  useEffect(() => {
    // An empty list is also the initial loading state, so do not clear a valid
    // offline queue before SQLite has finished loading.
    if (students.length > 0) pruneSyncQueue(students);
    setQueueLen(getQueueLength());
  }, [students]);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    const result = await syncToServer(students, schoolId);
    setSyncing(false);
    refresh();
    if (result.success) {
      setSyncMsg({
        type: 'ok',
        text: result.synced
          ? `✓ Synced ${result.synced} records`
          : result.discarded
            ? `Removed ${result.discarded} stale upload requests`
            : '✓ Already up to date',
      });
    } else {
      setSyncMsg({ type: 'err', text: result.message || 'Sync failed' });
    }
    setTimeout(() => setSyncMsg(null), 4000);
  }

  function handleDiscard() {
    const confirmed = window.confirm(
      `Stop uploading these ${queueLen} pending records?\n\n` +
      'The records will remain on this device. This only clears the pending upload list and does not delete cloud data.'
    );
    if (!confirmed) return;

    const discarded = discardPendingUploads();
    refresh();
    setSyncMsg({ type: 'ok', text: `Stopped ${discarded} pending uploads` });
    setTimeout(() => setSyncMsg(null), 4000);
  }

  function formatLastSync(date) {
    if (!date) return null;
    const now  = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Status pill content ───────────────────────────────────────────────
  let pill;

  if (!configured) {
    pill = (
      <div className="sync-pill sync-local" title="Supabase not configured — data saved locally only">
        <span className="sync-dot local" />
        <span className="sync-text">Local only</span>
      </div>
    );
  } else if (!online) {
    pill = (
      <div className="sync-pending-actions">
        <div className="sync-pill sync-offline" title="No internet — changes queued for upload">
          <span className="sync-dot offline" />
          <span className="sync-text">
            Offline{queueLen > 0 ? ` · ${queueLen} pending` : ''}
          </span>
        </div>
        {queueLen > 0 && (
          <button
            className="sync-discard"
            onClick={handleDiscard}
            title="Stop and discard these pending uploads"
            aria-label="Stop and discard pending uploads"
          >
            ×
          </button>
        )}
      </div>
    );
  } else if (syncing) {
    pill = (
      <div className="sync-pill sync-syncing">
        <span className="sync-spinner" />
        <span className="sync-text">Syncing…</span>
      </div>
    );
  } else if (queueLen > 0) {
    pill = (
      <div className="sync-pending-actions">
        <button className="sync-pill sync-pending" onClick={handleSync} title="Click to sync now">
          <span className="sync-dot pending" />
          <span className="sync-text">{queueLen} unsynced · Tap to upload</span>
        </button>
        <button
          className="sync-discard"
          onClick={handleDiscard}
          title="Stop and discard these pending uploads"
          aria-label="Stop and discard pending uploads"
        >
          ×
        </button>
      </div>
    );
  } else {
    pill = (
      <div className="sync-pill sync-ok" title={lastSync ? `Last synced: ${lastSync.toLocaleString()}` : 'Synced'}>
        <span className="sync-dot ok" />
        <span className="sync-text">
          Synced{lastSync ? ` · ${formatLastSync(lastSync)}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="sync-bar">
      {pill}
      {syncMsg && (
        <span className={`sync-flash ${syncMsg.type}`}>{syncMsg.text}</span>
      )}
    </div>
  );
}
