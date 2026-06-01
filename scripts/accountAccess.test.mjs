import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAccountAccessState,
  getImportChoiceDescription,
} from '../src/components/AccountAccess/accountAccessCore.ts';

test('missing Supabase env vars show local-only account state', () => {
  assert.equal(getAccountAccessState({
    isConfigured: false,
    isLoggedIn: false,
    needsImport: false,
    magicLinkSent: false,
  }), 'local-only');
});

test('magic-link request state moves from email entry to sent', () => {
  assert.equal(getAccountAccessState({
    isConfigured: true,
    isLoggedIn: false,
    needsImport: false,
    magicLinkSent: false,
  }), 'email-entry');

  assert.equal(getAccountAccessState({
    isConfigured: true,
    isLoggedIn: false,
    needsImport: false,
    magicLinkSent: true,
  }), 'magic-link-sent');
});

test('signed-in user with local planner data sees import decision state', () => {
  assert.equal(getAccountAccessState({
    isConfigured: true,
    isLoggedIn: true,
    needsImport: true,
    magicLinkSent: false,
  }), 'import-choice');

  assert.equal(getImportChoiceDescription('import'), 'uploads this device’s current planner to the signed-in account.');
  assert.equal(getImportChoiceDescription('device-only'), 'keeps the current planner local and does not upload it.');
  assert.equal(getImportChoiceDescription('later'), 'leaves the choice available in settings.');
});

test('local-only fallback stays available even after magic-link state exists', () => {
  assert.equal(getAccountAccessState({
    isConfigured: false,
    isLoggedIn: false,
    needsImport: false,
    magicLinkSent: true,
  }), 'local-only');
});
