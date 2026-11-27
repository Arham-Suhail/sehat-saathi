import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayOffset } from './days.js';

test('dayOffset uses the Karachi calendar day (UTC+5)', () => {
  const now = new Date('2026-11-27T18:00:00Z'); // 11 PM Nov 27 in Karachi
  assert.equal(dayOffset('2026-11-27T17:30:00Z', now), 0); // 10:30 PM today
  assert.equal(dayOffset('2026-11-27T19:30:00Z', now), 1); // 00:30 Nov 28 Karachi = tomorrow
  assert.equal(dayOffset('2026-11-28T03:00:00Z', now), 1); // 8 AM tomorrow
  assert.equal(dayOffset('2026-11-29T03:00:00Z', now), 2);
  assert.equal(dayOffset('2026-11-26T20:00:00Z', now), 0); // 1 AM Nov 27 Karachi = today
  assert.equal(dayOffset('2026-11-26T18:00:00Z', now), -1);
});
