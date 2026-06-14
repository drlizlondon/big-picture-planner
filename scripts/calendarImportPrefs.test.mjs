import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyImportPreferenceToBlock,
  findImportPreference,
  importPrefKey,
  upsertImportPreference,
} from '../src/services/calendarImportPrefs.ts';

const makeBlock = (overrides = {}) => ({
  id: 'ics_1',
  title: 'Swimming',
  durationMinutes: 60,
  date: '2026-06-20',
  startTime: '09:00',
  endTime: '10:00',
  isScheduled: true,
  isBaseEvent: false,
  isHidden: false,
  sourceType: 'calendar_import',
  metadata: {
    source: { provider: 'apple_calendar', name: 'Family', externalCalendarId: 'family', link: 'imported_copy' },
    labelIds: [],
    systemTags: ['imported'],
    viewIds: [],
  },
  travelEnabled: false,
  travelBeforeMinutes: 0,
  travelAfterMinutes: 0,
  features: {},
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

test('preference keys are stable per provider + calendar', () => {
  assert.equal(importPrefKey('apple_calendar', 'family'), 'apple_calendar:family');
  assert.notEqual(importPrefKey('apple_calendar', 'family'), importPrefKey('google_calendar', 'family'));
});

test('saving and finding a preference round-trips', () => {
  let prefs = {};
  prefs = upsertImportPreference(prefs, {
    provider: 'apple_calendar',
    externalCalendarId: 'family',
    calendarName: 'Family (Apple)',
    categoryId: 'cat-personal',
    target: 'calendar',
  }, 1000);

  const found = findImportPreference(prefs, 'apple_calendar', 'family');
  assert.ok(found);
  assert.equal(found.calendarName, 'Family (Apple)');
  assert.equal(found.categoryId, 'cat-personal');
  assert.equal(found.target, 'calendar');
  assert.equal(findImportPreference(prefs, 'apple_calendar', 'work'), undefined);
});

test('upsert overwrites the same calendar without duplicating', () => {
  let prefs = upsertImportPreference({}, { provider: 'apple_calendar', externalCalendarId: 'family', calendarName: 'Family', target: 'calendar' }, 1);
  prefs = upsertImportPreference(prefs, { provider: 'apple_calendar', externalCalendarId: 'family', calendarName: 'Family', categoryId: 'cat-2', target: 'inbox' }, 2);
  assert.equal(Object.keys(prefs).length, 1);
  assert.equal(findImportPreference(prefs, 'apple_calendar', 'family').categoryId, 'cat-2');
  assert.equal(findImportPreference(prefs, 'apple_calendar', 'family').target, 'inbox');
});

test('a saved preference applies its category and tag to imported events (reqs #7, #8)', () => {
  const pref = {
    key: 'apple_calendar:family',
    provider: 'apple_calendar',
    externalCalendarId: 'family',
    calendarName: 'Family',
    categoryId: 'cat-personal',
    labelId: 'label-home',
    target: 'calendar',
    updatedAt: 1,
  };
  const applied = applyImportPreferenceToBlock(makeBlock(), pref);
  assert.equal(applied.categoryId, 'cat-personal');
  assert.deepEqual(applied.metadata.labelIds, ['label-home']);
  // keeps its scheduled time when targeting the week
  assert.equal(applied.isScheduled, true);
  assert.equal(applied.startTime, '09:00');
});

test('targeting the inbox unschedules the imported event', () => {
  const pref = {
    key: 'apple_calendar:family', provider: 'apple_calendar', externalCalendarId: 'family',
    calendarName: 'Family', target: 'inbox', updatedAt: 1,
  };
  const applied = applyImportPreferenceToBlock(makeBlock(), pref);
  assert.equal(applied.isScheduled, false);
  assert.equal(applied.date, undefined);
  assert.equal(applied.startTime, undefined);
});

test('applying a tag does not duplicate one already present', () => {
  const block = makeBlock({ metadata: { source: { provider: 'apple_calendar', name: 'Family' }, labelIds: ['label-home'], systemTags: [], viewIds: [] } });
  const pref = { key: 'k', provider: 'apple_calendar', externalCalendarId: 'family', calendarName: 'Family', labelId: 'label-home', target: 'calendar', updatedAt: 1 };
  assert.deepEqual(applyImportPreferenceToBlock(block, pref).metadata.labelIds, ['label-home']);
});

console.log('calendar import preference tests passed');
