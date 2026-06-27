import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const capacitorIndex = join(root, 'dist-capacitor', 'index.html');

// Building is the slow part; give it room and only do it once for the suite.
test('build:capacitor produces a bundle with relative asset paths', { timeout: 180000 }, () => {
  execFileSync('npm', ['run', 'build:capacitor'], { cwd: root, stdio: 'inherit' });

  assert.ok(existsSync(capacitorIndex), 'dist-capacitor/index.html should exist');
  const html = readFileSync(capacitorIndex, 'utf8');

  // Assets must resolve relative to capacitor://localhost/, i.e. ./assets/...
  assert.match(html, /(src|href)="\.\/assets\//, 'expected at least one ./assets/ reference');

  // It must NOT carry the web build's absolute /planner/ base, or the WKWebView
  // would request capacitor://localhost/planner/assets/... which does not exist.
  assert.doesNotMatch(html, /(src|href)="\/planner\//, 'capacitor bundle must not use the /planner/ base');
});
