import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getImportPromptState,
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
    hasLocalData: true,
  }), false);
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

test('import prompt decisions are optional and prevent repeated prompt after decision', () => {
  assert.equal(getImportPromptState({ hasLocalData: true }), 'prompt');
  assert.equal(getImportPromptState({ hasLocalData: true, decision: 'device-only' }), 'none');
  assert.equal(getImportPromptState({ hasLocalData: true, decision: 'imported' }), 'none');
  assert.equal(getImportPromptState({ hasLocalData: true, decision: 'later' }), 'quiet-later');
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
