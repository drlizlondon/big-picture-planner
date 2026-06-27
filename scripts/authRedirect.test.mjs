import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthRedirectTo, parseTokensFromUrl, isAuthCallbackUrl, getAuthCodeFromUrl, AUTH_CALLBACK_PATH } from '../src/services/authRedirect.ts';

test('web redirect stays on the current page (unchanged behaviour)', () => {
  assert.equal(
    getAuthRedirectTo({
      isNative: false,
      origin: 'https://bigpictureplanner.app',
      pathname: '/planner/',
      scheme: 'bigpictureplanner',
    }),
    'https://bigpictureplanner.app/planner/'
  );
});

test('native redirect targets the custom-scheme deep link', () => {
  assert.equal(
    getAuthRedirectTo({
      isNative: true,
      origin: 'capacitor://localhost',
      pathname: '/',
      scheme: 'bigpictureplanner',
    }),
    `bigpictureplanner://${AUTH_CALLBACK_PATH}`
  );
});

test('parseTokensFromUrl extracts implicit-flow tokens from the deep link', () => {
  const url = 'bigpictureplanner://auth-callback#access_token=abc&refresh_token=def&token_type=bearer';
  assert.deepEqual(parseTokensFromUrl(url), { access_token: 'abc', refresh_token: 'def' });
});

test('parseTokensFromUrl returns null when tokens are absent', () => {
  assert.equal(parseTokensFromUrl('bigpictureplanner://auth-callback'), null);
  assert.equal(parseTokensFromUrl('bigpictureplanner://auth-callback#error=access_denied'), null);
});

test('isAuthCallbackUrl only matches the auth-callback deep link', () => {
  assert.equal(isAuthCallbackUrl('bigpictureplanner://auth-callback#access_token=x'), true);
  assert.equal(isAuthCallbackUrl('bigpictureplanner://some-other-link'), false);
});

test('getAuthCodeFromUrl extracts a PKCE code and ignores implicit hashes', () => {
  assert.equal(getAuthCodeFromUrl('bigpictureplanner://auth-callback?code=xyz123'), 'xyz123');
  assert.equal(getAuthCodeFromUrl('bigpictureplanner://auth-callback?code=xyz&state=abc#frag'), 'xyz');
  assert.equal(getAuthCodeFromUrl('bigpictureplanner://auth-callback#access_token=abc'), null);
  assert.equal(getAuthCodeFromUrl('bigpictureplanner://auth-callback'), null);
});
