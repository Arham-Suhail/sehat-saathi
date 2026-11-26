import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentStreak, karachiToday, progressFrom } from './streaks.js';

const day = (date, taken, missed = 0, skipped = 0, pending = 0) => ({ date, taken, missed, skipped, pending });

test('streak counts consecutive good days ending today', () => {
  const a = [day('2026-11-24', 2), day('2026-11-25', 2), day('2026-11-26', 1)];
  assert.equal(currentStreak(a, '2026-11-26'), 3);
});

test('a missed or skipped dose breaks the streak', () => {
  assert.equal(currentStreak([day('2026-11-24', 2), day('2026-11-25', 1, 1), day('2026-11-26', 2)], '2026-11-26'), 1);
  assert.equal(currentStreak([day('2026-11-25', 2), day('2026-11-26', 1, 0, 1)], '2026-11-26'), 0);
});

test('today with only pending doses does not break the streak', () => {
  const a = [day('2026-11-25', 2), day('2026-11-26', 2), day('2026-11-27', 0, 0, 0, 3)];
  assert.equal(currentStreak(a, '2026-11-27'), 2);
});

test('days without doses are skipped over, future days ignored, empty is 0', () => {
  assert.equal(currentStreak([day('2026-11-20', 1), day('2026-11-26', 1)], '2026-11-26'), 2);
  assert.equal(currentStreak([day('2026-11-28', 1)], '2026-11-26'), 0);
  assert.equal(currentStreak([], '2026-11-26'), 0);
});

test('progressFrom computes badges and tolerates missing data', () => {
  const p = progressFrom(
    {
      adherence: [day('2026-11-24', 3), day('2026-11-25', 3), day('2026-11-26', 3)],
      adherence_totals: { taken: 9, adherence_pct: 100 },
      checkins: [{}, {}, {}, {}, {}],
      vitals: [],
    },
    '2026-11-26',
  );
  assert.equal(p.streak, 3);
  const earned = p.badges.filter((b) => b.earned).map((b) => b.id);
  assert.deepEqual(earned, ['first', 'streak3', 'checkin5']);
  assert.equal(p.earned, 3);
  const empty = progressFrom(null, '2026-11-26');
  assert.equal(empty.streak, 0);
  assert.equal(empty.earned, 0);
  assert.equal(empty.pct, null);
});

test('karachiToday uses Asia/Karachi (UTC+5)', () => {
  assert.equal(karachiToday(new Date('2026-11-26T20:30:00Z')), '2026-11-27');
  assert.equal(karachiToday(new Date('2026-11-26T18:30:00Z')), '2026-11-26');
});
