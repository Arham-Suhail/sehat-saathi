/* Calendar-day offset of a time from "now" in Asia/Karachi: 0 = today, 1 = tomorrow, -1 = yesterday.
   Used so a dose scheduled for tomorrow is never labelled "Due" under today (pure, tested). */
const ymd = (d) =>
  new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Karachi' }).format(d);

export function dayOffset(iso, now = new Date()) {
  const a = Date.parse(`${ymd(new Date(iso))}T00:00:00Z`);
  const b = Date.parse(`${ymd(now)}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}
