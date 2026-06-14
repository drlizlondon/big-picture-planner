import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideWriteScope,
  deriveCalendarSyncStatus,
  getCalendarLinkType,
  getCalendarSyncStatusLabel,
  markSourcePushed,
  resolveCalendarSync,
  supportsWriteBack,
} from '../src/services/calendarSyncCore.ts';

// ─── Link classification (req #4) ──────────────────────────────────────────────

test('blocks are classified by how they relate to an external calendar', () => {
  assert.equal(getCalendarLinkType(undefined), 'local_only');
  assert.equal(getCalendarLinkType({ provider: 'manual', name: 'Manual' }), 'local_only');
  assert.equal(getCalendarLinkType({ provider: 'google_calendar', name: 'G' }), 'linked');
  assert.equal(getCalendarLinkType({ provider: 'apple_calendar', name: 'A' }), 'imported_copy');
  // explicit link type wins over the provider default
  assert.equal(getCalendarLinkType({ provider: 'google_calendar', name: 'G', link: 'exported' }), 'exported');
});

test('only two-way linked providers support write-back', () => {
  assert.equal(supportsWriteBack({ provider: 'google_calendar', name: 'G', link: 'linked' }), true);
  assert.equal(supportsWriteBack({ provider: 'apple_calendar', name: 'A', link: 'imported_copy' }), false);
  assert.equal(supportsWriteBack(undefined), false);
});

// ─── Conflict-safe reconciliation (req #6) ─────────────────────────────────────

test('reconciliation never silently picks a winner when both sides changed', () => {
  assert.equal(resolveCalendarSync({ lastSyncedAt: 100 }), 'in_sync');
  assert.equal(resolveCalendarSync({ lastSyncedAt: 100, localEditedAt: 200 }), 'local_ahead');
  assert.equal(resolveCalendarSync({ lastSyncedAt: 100, externalUpdatedAt: 200 }), 'external_ahead');
  assert.equal(resolveCalendarSync({ lastSyncedAt: 100, localEditedAt: 200, externalUpdatedAt: 300 }), 'conflict');
});

// ─── Status derivation + labels (req #9) ───────────────────────────────────────

const linked = (source) => ({ metadata: { source: { provider: 'google_calendar', name: 'G', link: 'linked', ...source }, labelIds: [], systemTags: [], viewIds: [] } });

test('sync status is derived from local vs external edit times', () => {
  assert.equal(deriveCalendarSyncStatus({ metadata: undefined }), 'local_only');
  assert.equal(deriveCalendarSyncStatus(linked({ lastSyncedAt: 100, externalUpdatedAt: 100 })), 'synced');
  assert.equal(deriveCalendarSyncStatus(linked({ lastSyncedAt: 100, localEditedAt: 200 })), 'changed_locally');
  assert.equal(deriveCalendarSyncStatus(linked({ lastSyncedAt: 100, externalUpdatedAt: 200 })), 'changed_externally');
  assert.equal(deriveCalendarSyncStatus(linked({ lastSyncedAt: 100, localEditedAt: 200, externalUpdatedAt: 300 })), 'conflict');
});

test('imported copies are never reported as conflicts (one-way)', () => {
  const imported = (source) => ({ metadata: { source: { provider: 'apple_calendar', name: 'A', link: 'imported_copy', ...source }, labelIds: [], systemTags: [], viewIds: [] } });
  assert.equal(deriveCalendarSyncStatus(imported({ lastSyncedAt: 100, externalUpdatedAt: 999 })), 'synced');
  assert.equal(deriveCalendarSyncStatus(imported({ lastSyncedAt: 100, localEditedAt: 200 })), 'changed_locally');
});

test('every status maps to a clear user-facing label', () => {
  assert.equal(getCalendarSyncStatusLabel('synced'), 'Synced');
  assert.equal(getCalendarSyncStatusLabel('local_only'), 'Local only');
  assert.equal(getCalendarSyncStatusLabel('changed_locally'), 'Changed in Big Planner');
  assert.equal(getCalendarSyncStatusLabel('changed_externally'), 'Changed externally');
  assert.equal(getCalendarSyncStatusLabel('conflict'), 'Conflict');
});

// ─── Write-scope: no accidental external overwrite when editing (reqs #5, #6) ───

test('editing a local-only block never targets an external calendar', () => {
  const decision = decideWriteScope({ metadata: undefined }, 'always');
  assert.equal(decision.scope, 'local_only');
  assert.equal(decision.requiresChoice, false);
});

test('editing an imported copy never writes back, regardless of preference', () => {
  const imported = { metadata: { source: { provider: 'apple_calendar', name: 'A', link: 'imported_copy' }, labelIds: [], systemTags: [], viewIds: [] } };
  for (const pref of ['ask', 'local_only', 'always']) {
    assert.equal(decideWriteScope(imported, pref).scope, 'local_only');
  }
});

test('default "ask" preference keeps linked edits local and flags a choice', () => {
  const block = linked({ lastSyncedAt: 100, externalUpdatedAt: 100 });
  const decision = decideWriteScope(block, 'ask');
  assert.equal(decision.scope, 'local_only', 'edit must not silently push');
  assert.equal(decision.requiresChoice, true, 'user must be offered the choice');
});

test('"always" preference pushes a clean linked edit but refuses on conflict', () => {
  const clean = linked({ lastSyncedAt: 100, externalUpdatedAt: 100, localEditedAt: 150 });
  assert.equal(decideWriteScope(clean, 'always').scope, 'external');

  // External also changed since sync → pushing would overwrite it. Must not.
  const conflicted = linked({ lastSyncedAt: 100, localEditedAt: 150, externalUpdatedAt: 200 });
  const decision = decideWriteScope(conflicted, 'always');
  assert.equal(decision.scope, 'local_only');
  assert.equal(decision.blockedByConflict, true);
  assert.equal(decision.requiresChoice, true);
});

test('"local_only" preference never pushes even a clean linked edit', () => {
  const clean = linked({ lastSyncedAt: 100, externalUpdatedAt: 100, localEditedAt: 150 });
  assert.equal(decideWriteScope(clean, 'local_only').scope, 'local_only');
});

test('a successful push returns the block to synced', () => {
  const source = { provider: 'google_calendar', name: 'G', link: 'linked', lastSyncedAt: 100, localEditedAt: 150 };
  const pushed = markSourcePushed(source, 300);
  assert.equal(pushed.localEditedAt, undefined);
  assert.equal(pushed.lastSyncedAt, 300);
  assert.equal(deriveCalendarSyncStatus({ metadata: { source: pushed, labelIds: [], systemTags: [], viewIds: [] } }), 'synced');
});

console.log('calendar sync core tests passed');
