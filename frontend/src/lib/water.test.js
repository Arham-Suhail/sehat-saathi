import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WATER_GOAL, addGlass, karachiHour, readWater, shouldNudge } from './water.js';

test('readWater resets on a new day and survives bad input', () => {
  assert.deepEqual(readWater(JSON.stringify({ date: '2026-11-26', count: 5, lastAt: 9 }), '2026-11-26'), { date: '2026-11-26', count: 5, lastAt: 9 });
  assert.equal(readWater(JSON.stringify({ date: '2026-11-25', count: 5 }), '2026-11-26').count, 0);
  assert.equal(readWater('not json', '2026-11-26').count, 0);
  assert.equal(readWater(null, '2026-11-26').count, 0);
  assert.equal(readWater(JSON.stringify({ date: '2026-11-26', count: 999 }), '2026-11-26').count, 20);
  assert.equal(readWater(JSON.stringify({ date: '2026-11-26', count: -3 }), '2026-11-26').count, 0);
  assert.equal(readWater(JSON.stringify({ date: '2026-11-26', count: '4' }), '2026-11-26').count, 0);
});

test('addGlass clamps and records time only when adding', () => {
  const s = { date: 'd', count: 0, lastAt: 0 };
  assert.deepEqual(addGlass(s, 1, 100), { date: 'd', count: 1, lastAt: 100 });
  assert.deepEqual(addGlass(s, -1, 100), { date: 'd', count: 0, lastAt: 0 });
  assert.equal(addGlass({ ...s, count: 20 }, 1, 5).count, 20);
});

test('shouldNudge: daytime, goal not met, 2 hours since last glass', () => {
  const h2 = 2 * 3600 * 1000;
  assert.equal(shouldNudge({ count: 0, lastAt: 0 }, 1e12, 10), true);
  assert.equal(shouldNudge({ count: 3, lastAt: 1e12 - h2 + 1 }, 1e12, 10), false);
  assert.equal(shouldNudge({ count: 3, lastAt: 1e12 - h2 }, 1e12, 10), true);
  assert.equal(shouldNudge({ count: WATER_GOAL, lastAt: 0 }, 1e12, 10), false);
  assert.equal(shouldNudge({ count: 0, lastAt: 0 }, 1e12, 23), false);
  assert.equal(shouldNudge({ count: 0, lastAt: 0 }, 1e12, 7), false);
});

test('karachiHour is UTC+5', () => {
  assert.equal(karachiHour(new Date('2026-11-26T03:00:00Z')), 8);
  assert.equal(karachiHour(new Date('2026-11-26T19:30:00Z')), 0);
});
