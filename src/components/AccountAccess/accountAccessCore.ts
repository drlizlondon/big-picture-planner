import type { ImportDecision } from '../../types/models';

export type AccountAccessState = 'local-only' | 'email-entry' | 'magic-link-sent' | 'import-choice' | 'signed-in' | 'decide-later';

export const getAccountAccessState = (state: {
  isConfigured: boolean;
  isLoggedIn: boolean;
  needsImport: boolean;
  importDecision?: ImportDecision;
  magicLinkSent: boolean;
}): AccountAccessState => {
  if (!state.isConfigured) return 'local-only';
  if (!state.isLoggedIn) return state.magicLinkSent ? 'magic-link-sent' : 'email-entry';
  if (state.needsImport) return 'import-choice';
  if (state.importDecision === 'later') return 'decide-later';
  return 'signed-in';
};

export const getImportChoiceDescription = (choice: ImportDecision | 'import'): string => {
  if (choice === 'import') {
    return 'uploads this device’s current planner to the signed-in account.';
  }
  if (choice === 'device-only') {
    return 'keeps the current planner local and does not upload it.';
  }
  return 'leaves the choice available in settings.';
};
