import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRetryDelayMs,
  getSyncStatusLabel,
  mergeQueuedChange,
  shouldQueueForSync,
} from '../src/services/syncCore.ts';

test('local-only mode uses device status and does not queue', () => {
  assert.equal(getSyncStatusLabel({
    isSyncing: false,
    isConfigured: false,
    isLoggedIn: false,
    isOnline: true,
    pendingCount: 0,
    hasRetriedItem: false,
    hasSynced: false,
  }), 'Saved on this device');

  assert.equal(shouldQueueForSync({
    isConfigured: false,
    isLoggedIn: false,
  }), false);
});

test('a logged-in account always syncs (no import/device-only choice)', () => {
  // Logged in + configured => always queue, regardless of local data.
  assert.equal(shouldQueueForSync({ isConfigured: true, isLoggedIn: true }), true);
  // Configured but signed out => stays local.
  assert.equal(shouldQueueForSync({ isConfigured: true, isLoggedIn: false }), false);
});

test('logged-in synced mode reports synced after successful sync', () => {
  assert.equal(getSyncStatusLabel({
    isSyncing: false,
    isConfigured: true,
    isLoggedIn: true,
    isOnline: true,
    pendingCount: 0,
    hasRetriedItem: false,
    hasSynced: true,
  }), 'Synced');
});

test('queue creation and repeated edits coalesce to the latest change', () => {
  const created = mergeQueuedChange(undefined, {
    entityType: 'blocks',
    entityId: 'block-1',
    action: 'upsert',
    payload: { title: 'first' },
    updatedAt: 100,
  });

  assert.equal(created.entityId, 'block-1');
  assert.equal(created.action, 'upsert');
  assert.equal(created.attempts, 0);

  const merged = mergeQueuedChange({
    id: 'queue-1',
    entityType: 'blocks',
    entityId: 'block-1',
    action: 'upsert',
    payload: { title: 'first' },
    createdAt: 100,
    updatedAt: 100,
    attempts: 2,
    nextAttemptAt: 10000,
    lastError: 'network',
  }, {
    entityType: 'blocks',
    entityId: 'block-1',
    action: 'delete',
    payload: { title: 'latest', deletedAt: 200 },
    updatedAt: 200,
  });

  assert.equal(merged.id, 'queue-1');
  assert.equal(merged.action, 'delete');
  assert.deepEqual(merged.payload, { title: 'latest', deletedAt: 200 });
  assert.equal(merged.attempts, 0);
  assert.equal(merged.nextAttemptAt, undefined);
});

test('queue retry uses calm retry state and capped backoff', () => {
  assert.equal(getSyncStatusLabel({
    isSyncing: false,
    isConfigured: true,
    isLoggedIn: true,
    isOnline: true,
    pendingCount: 1,
    hasRetriedItem: true,
    hasSynced: false,
  }), 'Sync failed, retrying');

  assert.equal(getRetryDelayMs(1), 2500);
  assert.equal(getRetryDelayMs(99), 30000);
});

test('offline shows an explicit Offline status, even with queued changes', () => {
  assert.equal(getSyncStatusLabel({
    isSyncing: false,
    isConfigured: true,
    isLoggedIn: true,
    isOnline: false,
    pendingCount: 3,
    hasRetriedItem: false,
    hasSynced: true,
  }), 'Offline');

  // Offline with an empty queue is still Offline (not "Synced").
  assert.equal(getSyncStatusLabel({
    isSyncing: false,
    isConfigured: true,
    isLoggedIn: true,
    isOnline: false,
    pendingCount: 0,
    hasRetriedItem: false,
    hasSynced: true,
  }), 'Offline');
});

test('logout preserves local data by returning to device status', () => {
  assert.equal(getSyncStatusLabel({
    isSyncing: false,
    isConfigured: true,
    isLoggedIn: false,
    isOnline: true,
    pendingCount: 0,
    hasRetriedItem: false,
    hasSynced: true,
  }), 'Saved on this device');
});
