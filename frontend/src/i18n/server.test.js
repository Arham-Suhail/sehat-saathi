import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// server.js imports useT.js -> en.json/ur.json; plain node can't import JSON without attributes,
// so test the pure logic through a tiny loader-free re-implementation check: compare catalogs and
// exercise st() via dynamic import with JSON import attributes enabled by Node 22+.
const shared = JSON.parse(readFileSync(new URL('../../../shared/server-strings.json', import.meta.url), 'utf8'));
const local = JSON.parse(readFileSync(new URL('./server-strings.json', import.meta.url), 'utf8'));

test('frontend catalog is an exact copy of shared/server-strings.json', () => {
  assert.deepEqual(local, shared);
});

test('every catalog entry has non-empty English and Urdu', () => {
  for (const [k, v] of Object.entries(shared.exact)) {
    assert.equal(v.length, 2, k);
    assert.ok(v[0] && v[1], k);
    assert.match(v[1], /[؀-ۿ]/, `Urdu column has no Urdu script: ${k}`);
  }
});

test('translateServer: exact, patterns, slot lists, unknown passthrough', async () => {
  const { translateServer: tr } = await import('./server-core.js');
  assert.equal(tr(shared, 'Ijazat nahi', 'en'), 'Not allowed');
  assert.equal(tr(shared, 'Ijazat nahi', 'ur'), 'اجازت نہیں');
  assert.equal(tr(shared, 'Din mein 2 baar', 'en'), '2 times a day');
  assert.equal(tr(shared, 'Har 8 ghante baad', 'ur'), 'ہر 8 گھنٹے بعد');
  assert.match(tr(shared, 'Har 6 ghante = 24 ghante mein 4 baar. Raat ka waqt zaroorat ho to khud add karein.', 'en'), /^Every 6 hours = 4 times/);
  assert.equal(tr(shared, 'Subah aur raat', 'en'), 'Morning and night');
  assert.equal(tr(shared, 'Subah, dopahar, shaam aur raat', 'ur'), 'صبح، دوپہر، شام اور رات');
  assert.equal(tr(shared, 'Sirf raat', 'en'), 'Only night');
  assert.equal(tr(shared, 'Sirf dopahar', 'ur'), 'صرف دوپہر');
  assert.equal(tr(shared, 'Panadol 500 mg', 'ur'), 'Panadol 500 mg');
  assert.equal(tr(shared, '', 'en'), '');
  assert.equal(tr(shared, 'Ijazat nahi', 'roman'), 'Ijazat nahi');
});
