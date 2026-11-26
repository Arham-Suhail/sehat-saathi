// Same vectors as backend/tests/test_translit.py: both implementations must agree exactly.
// Run: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { toRoman } from './translit.js';

const vectors = JSON.parse(readFileSync(new URL('../../../shared/translit-vectors.json', import.meta.url), 'utf8'));

for (const [source, expected] of vectors.cases) {
  test(`toRoman(${JSON.stringify(source)})`, () => {
    assert.equal(toRoman(source), expected);
  });
}

test('idempotent on Roman text', () => {
  const s = 'Aaj theek hoon, seene mein dard hai';
  assert.equal(toRoman(toRoman(s)), s);
});

test('null and undefined become empty strings', () => {
  assert.equal(toRoman(null), '');
  assert.equal(toRoman(undefined), '');
});
