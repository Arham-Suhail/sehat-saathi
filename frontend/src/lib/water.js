/* Water tracker ("Paani piyein"): glasses per Karachi day, kept on this device only (localStorage,
   per user). Not medical data and never sent to the server. Pure helpers are unit tested. */
export const WATER_GOAL = 8;
export const WATER_MAX = 20;
const NUDGE_EVERY_MS = 2 * 60 * 60 * 1000;

/** Parse stored JSON safely; a new day starts at 0. */
export function readWater(raw, today) {
  try {
    const s = JSON.parse(raw);
    if (s && s.date === today && Number.isInteger(s.count)) {
      return { date: today, count: Math.min(WATER_MAX, Math.max(0, s.count)), lastAt: Number(s.lastAt) || 0 };
    }
  } catch {
    /* corrupt or missing: start fresh */
  }
  return { date: today, count: 0, lastAt: 0 };
}

export function addGlass(state, delta, now) {
  const count = Math.min(WATER_MAX, Math.max(0, state.count + delta));
  return { ...state, count, lastAt: delta > 0 ? now : state.lastAt };
}

/** Gentle in-app nudge: goal not met, 2 h since the last glass (or none yet), 08:00–21:00 Karachi. */
export function shouldNudge(state, now, karachiHour) {
  if (state.count >= WATER_GOAL) return false;
  if (karachiHour < 8 || karachiHour >= 21) return false;
  return !state.lastAt || now - state.lastAt >= NUDGE_EVERY_MS;
}

export function karachiHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hour12: false }).format(now)) % 24;
}
