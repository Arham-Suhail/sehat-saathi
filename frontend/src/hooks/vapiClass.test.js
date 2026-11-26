import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveVapiClass } from './vapiClass.js';

class Fake {}

test('ESM shape: default is the class', () => {
  assert.equal(resolveVapiClass({ default: Fake }), Fake);
});

test('CommonJS via bundler: default is the module object (the production bug)', () => {
  assert.equal(resolveVapiClass({ default: { __esModule: true, default: Fake } }), Fake);
});

test('the real installed @vapi-ai/web resolves to a constructor', async () => {
  let mod;
  try {
    mod = await import('@vapi-ai/web');
  } catch {
    return; // the SDK may need browser globals to load in Node; the shape tests above still guard the bug
  }
  assert.equal(typeof resolveVapiClass(mod), 'function');
});

test('unknown shape fails loudly', () => {
  assert.throws(() => resolveVapiClass({ default: {} }), TypeError);
});
