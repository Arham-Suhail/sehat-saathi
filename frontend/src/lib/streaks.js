/* Streaks & badges, computed from the dashboard payload the elder can already read
   (GET /dashboard/{own id}). Pure functions, no I/O, so they are unit tested (streaks.test.js).

   A "good day" = at least one dose taken and none missed or skipped. Today counts while it is still
   going (pending doses are fine). Days with no doses due neither break nor extend a streak. */

function goodDay(d) {
  return d.taken > 0 && d.missed === 0 && d.skipped === 0;
}

/** Consecutive good days ending today (or yesterday, if today has nothing settled yet). */
export function currentStreak(adherence, today) {
  const byDate = new Map(adherence.map((d) => [d.date, d]));
  const dates = [...byDate.keys()].filter((d) => d <= today).sort().reverse();
  let streak = 0;
  for (const date of dates) {
    const d = byDate.get(date);
    const settled = d.taken + d.missed + d.skipped;
    if (date === today && settled === 0) continue; // today not started yet: don't break
    if (!goodDay(d)) break;
    streak += 1;
  }
  return streak;
}

export const BADGES = [
  { id: 'first', icon: 'check', test: (s) => s.taken >= 1 },
  { id: 'streak3', icon: 'flame', test: (s) => s.streak >= 3 },
  { id: 'streak7', icon: 'trophy', test: (s) => s.streak >= 7 },
  { id: 'doses20', icon: 'pill', test: (s) => s.taken >= 20 },
  { id: 'checkin5', icon: 'chat', test: (s) => s.checkins >= 5 },
  { id: 'vitals', icon: 'heart', test: (s) => s.vitals >= 1 },
];

/** Summary used by the Home card and the Progress screen. */
export function progressFrom(dash, today) {
  const adherence = dash?.adherence || [];
  const stats = {
    streak: currentStreak(adherence, today),
    taken: dash?.adherence_totals?.taken || 0,
    pct: dash?.adherence_totals?.adherence_pct ?? null,
    checkins: (dash?.checkins || []).length,
    vitals: (dash?.vitals || []).length,
  };
  const badges = BADGES.map((b) => ({ ...b, earned: b.test(stats) }));
  return { ...stats, badges, earned: badges.filter((b) => b.earned).length };
}

/** "YYYY-MM-DD" in Asia/Karachi (the server groups adherence by Karachi day). */
export function karachiToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(now);
}
