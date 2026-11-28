/* Native alarms for the Android app (Capacitor Local Notifications).
   Elders: one alarm per pending dose for the next 7 days, plus "still not taken?" follow-ups 15 and
   30 minutes later (cancelled as soon as the dose is marked), so alarms ring even if the app is
   closed, the phone is locked or offline. Each alarm has two buttons: "Taken" and "Not taken".
   Family / doctor: every open care alert rings again and again (urgent ones every 10 minutes) until
   it is marked read; meetings ring 15 minutes before. Website: does nothing (it uses Web Push). */
import { st } from '../i18n/server';
import { t } from '../i18n/useT';
import { LocalNotifications as LN } from '@capacitor/local-notifications';
import { isNative } from './native';

const CHANNEL = 'doses';
const CARE_CHANNEL = 'care';
const MAX_ALARMS = 90; // Android allows ~500 per app
// Minutes after the dose time: rings again every 5 minutes until marked (3 repeats), once more at 30.
const FOLLOW_UPS = [0, 5, 10, 15, 30];
// Minutes after an alert first reaches this phone at which it rings (until read / resolved).
const CARE_REPEAT = {
  concern: [0, 10, 20, 30, 45, 60, 90, 120, 180, 240],
  med_review: [0, 30, 60, 120, 240],
  missed_dose: [0, 30, 90],
  meeting: [0],
  vitals: [0, 60],
  low_mood: [0, 240],
  inactive: [0, 120, 240],
  refill: [0, 720],
};
const URGENT_KINDS = new Set(['concern']);

/** Carer quiet hours (More): non-urgent alerts that fall 22:00-07:00 ring at 07:00 instead. */
function outOfQuiet(ms) {
  let quiet = false;
  try {
    quiet = JSON.parse(localStorage.getItem('ss_prefs') || '{}').quiet;
  } catch {
    /* off */
  }
  if (!quiet) return ms;
  const d = new Date(ms);
  const h = d.getHours();
  if (h >= 22) {
    d.setDate(d.getDate() + 1);
    d.setHours(7, 0, 0, 0);
  } else if (h < 7) d.setHours(7, 0, 0, 0);
  return d.getTime();
}
// First sync after each app start re-creates every alarm: a force-stop, app update or some OEM
// battery savers wipe Android's alarms while the plugin still lists them as pending.
let fullResync = true;

// NB: Capacitor plugin objects are proxies that look "thenable": never return one from a promise.

/** Stable positive 31-bit id from a string id (Android notification ids are ints). */
export function alarmId(key) {
  let h = 0;
  for (const c of String(key)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1;
}

/** 'granted' | 'denied' | 'prompt' (not asked yet / can ask again). */
export async function alarmPermission() {
  if (!isNative()) return 'denied';
  try {
    const p = await LN.checkPermissions();
    return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'denied';
  }
}

let askedThisSession = false;
let channelReady = false;

/** True when alarms can ring. Asks for the notification permission at most once per app start
    (or again when the user taps "turn on alarms"); re-checks every time, so turning it on later in
    phone Settings starts the alarms on the next refresh. */
export async function ensureAlarmSetup(again = false) {
  if (!isNative()) return false;
  try {
    let perm = await LN.checkPermissions();
    if (perm.display !== 'granted' && (again || !askedThisSession)) {
      askedThisSession = true;
      perm = await LN.requestPermissions();
    }
    if (perm.display !== 'granted') return false;
    if (!channelReady) {
      channelReady = true;
      await LN.createChannel({
        id: CHANNEL,
        name: t('native.channel'),
        description: t('native.channel.desc'),
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#2C5F51',
      }).catch(() => {});
      await LN.createChannel({
        id: CARE_CHANNEL,
        name: t('native.care.channel'),
        description: t('native.care.channel.desc'),
        importance: 5,
        visibility: 0,
        vibration: true,
        lights: true,
        lightColor: '#B3261E',
      }).catch(() => {});
      await LN.registerActionTypes({
        types: [
          {
            id: 'DOSE',
            actions: [
              { id: 'taken', title: t('native.action.taken'), foreground: true },
              { id: 'skipped', title: t('native.action.skipped') },
            ],
          },
          {
            id: 'CARE',
            actions: [
              { id: 'read', title: t('native.action.read') },
              { id: 'open', title: t('native.action.open'), foreground: true },
            ],
          },
          { id: 'CARE_REVIEW', actions: [{ id: 'open', title: t('native.action.open'), foreground: true }] },
        ],
      }).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

function toAlarm(r, at, k = 0) {
  const text = `${st(r.medicine_name)}${r.dose ? ` — ${r.dose}` : ''}`;
  return {
    id: alarmId(k ? `${r.id}#${k}` : r.id),
    title: k ? t('native.dose.again') : t('rem.alert.title'),
    body: text,
    largeBody: `${text}${r.instructions ? `\n${st(r.instructions)}` : ''}`,
    schedule: { at, allowWhileIdle: true },
    channelId: CHANNEL,
    actionTypeId: 'DOSE',
    smallIcon: 'ic_stat_notify',
    iconColor: '#2C5F51',
    autoCancel: true,
    extra: { kind: 'dose', reminderId: r.id, name: r.medicine_name, dose: r.dose || '' },
  };
}

/** Every alarm of one dose: the dose time and the follow-ups that are still in the future. */
function doseAlarms(r, now) {
  const at = new Date(r.scheduled_at).getTime();
  return FOLLOW_UPS.map((m, k) => ({ k, at: at + m * 60_000 }))
    .filter((x) => x.at > now + 5_000)
    .map((x) => toAlarm(r, new Date(x.at), x.k));
}

/** Make the scheduled dose alarms match the pending doses in `reminders`. */
export async function syncAlarms(reminders) {
  if (!isNative() || !Array.isArray(reminders)) return;
  if (!(await ensureAlarmSetup())) return;
  const now = Date.now();
  const wanted = reminders
    .filter((r) => r.status === 'pending')
    .flatMap((r) => doseAlarms(r, now))
    .sort((a, b) => a.schedule.at - b.schedule.at)
    .slice(0, MAX_ALARMS);
  const wantedIds = new Set(wanted.map((n) => n.id));
  const { notifications: pending } = await LN.getPending();
  const doses = pending.filter((n) => (n.extra?.kind || 'dose') === 'dose');
  const stale = doses.filter((n) => fullResync || !wantedIds.has(n.id)).map((n) => ({ id: n.id }));
  if (stale.length) await LN.cancel({ notifications: stale });
  const have = fullResync ? new Set() : new Set(doses.map((n) => n.id));
  fullResync = false;
  const add = wanted.filter((n) => !have.has(n.id));
  if (add.length) await LN.schedule({ notifications: add });
}

const careSeen = new Map(); // alert id -> when this phone first saw it (repeats count from then)

/** Family / doctor: repeating notifications for every open alert until it is read or resolved, and
    a reminder 15 minutes before each upcoming meeting. Called whenever alerts / meetings load. */
export async function syncCareAlarms(alerts, meetings = [], { meetingsOnly = false } = {}) {
  if (!isNative() || !Array.isArray(alerts)) return;
  if (!(await ensureAlarmSetup())) return;
  const now = Date.now();
  const wanted = [];
  for (const a of alerts.filter((x) => x.open).slice(0, 20)) {
    if (!careSeen.has(a.id)) careSeen.set(a.id, now);
    const start = careSeen.get(a.id);
    const name = a.elder_name || t('alerts.elder');
    (CARE_REPEAT[a.kind] || [0]).forEach((m, k) => {
      let due = start + m * 60_000;
      if (k > 0 && due < now) return; // that repeat already rang
      if (!URGENT_KINDS.has(a.kind)) due = outOfQuiet(Math.max(due, now + 3_000));
      wanted.push({
        id: alarmId(`care:${a.id}:${k}`),
        title: t(`native.care.${a.kind}.title`),
        body: t(`native.care.${a.kind}.body`, { name }),
        schedule: { at: new Date(Math.max(due, now + 3_000)), allowWhileIdle: true },
        channelId: CARE_CHANNEL,
        actionTypeId: a.kind === 'med_review' ? 'CARE_REVIEW' : 'CARE',
        smallIcon: 'ic_stat_notify',
        iconColor: a.severity === 'urgent' ? '#B3261E' : '#2C5F51',
        autoCancel: true,
        extra: { kind: 'care', alertId: a.id, elderId: a.elder_id, alertKind: a.kind },
      });
    });
  }
  for (const m of meetings.filter((x) => x.status === 'scheduled' && x.my_response !== 'declined')) {
    const dayBefore = new Date(m.starts_at).getTime() - 24 * 3_600_000;
    if (dayBefore > now + 5_000)
      wanted.push({
        id: alarmId(`meet1d:${m.id}`),
        title: t('native.meeting.tomorrow'),
        body: t('native.meeting.body', { who: m.organiser?.name || '' }),
        schedule: { at: new Date(dayBefore), allowWhileIdle: true },
        channelId: CARE_CHANNEL,
        smallIcon: 'ic_stat_notify',
        iconColor: '#2C5F51',
        autoCancel: true,
        extra: { kind: 'meeting', meetingId: m.id },
      });
    const at = new Date(m.starts_at).getTime() - 15 * 60_000;
    if (at <= now + 5_000) continue;
    wanted.push({
      id: alarmId(`meet:${m.id}`),
      title: t('native.meeting.title'),
      body: t('native.meeting.body', { who: m.organiser?.name || '' }),
      schedule: { at: new Date(at), allowWhileIdle: true },
      channelId: CARE_CHANNEL,
      smallIcon: 'ic_stat_notify',
      iconColor: '#2C5F51',
      autoCancel: true,
      extra: { kind: 'meeting', meetingId: m.id },
    });
  }
  const ids = new Set(wanted.map((n) => n.id));
  const { notifications: pending } = await LN.getPending();
  const kinds = meetingsOnly ? ['meeting'] : ['care', 'meeting'];
  const mine = pending.filter((n) => kinds.includes(n.extra?.kind));
  const stale = mine.filter((n) => !ids.has(n.id)).map((n) => ({ id: n.id }));
  if (stale.length) await LN.cancel({ notifications: stale });
  const have = new Set(mine.map((n) => n.id));
  const add = wanted.filter((n) => !have.has(n.id));
  if (add.length) await LN.schedule({ notifications: add });
}

/** Meetings only (elders, or the Meetings screen): a reminder 15 minutes before each one. */
export async function syncMeetingAlarms(meetings) {
  if (!isNative()) return;
  await syncCareAlarms([], meetings, { meetingsOnly: true });
}

export async function cancelCareAlarms(alertId) {
  if (!isNative()) return;
  const n = Math.max(...Object.values(CARE_REPEAT).map((x) => x.length));
  const ids = Array.from({ length: n }, (_, k) => ({ id: alarmId(`care:${alertId}:${k}`) }));
  await LN.cancel({ notifications: ids }).catch(() => {});
}

/** Logout on a shared phone: no more alarms for the account that left. */
export async function cancelAllAlarms() {
  if (!isNative()) return;
  try {
    const { notifications } = await LN.getPending();
    if (notifications.length) await LN.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
  } catch {
    /* nothing scheduled */
  }
  careSeen.clear();
  fullResync = true;
}

/** A dose was marked: cancel its alarm and both follow-ups. */
export async function cancelAlarm(reminderId) {
  if (!isNative()) return;
  const ids = FOLLOW_UPS.map((_, k) => ({ id: alarmId(k ? `${reminderId}#${k}` : reminderId) }));
  await LN.cancel({ notifications: ids }).catch(() => {});
}

/** Demo / test: a real dose alarm in 10 seconds (for the next pending dose, or a sample one), so a
    judge can see it ring live. Website: returns false (the in-app sheet is shown instead). */
export async function testAlarmIn10s(reminder) {
  if (!isNative()) return false;
  if (!(await ensureAlarmSetup(true))) return false;
  const r = reminder || { id: 'test', medicine_name: t('demo.sample_med'), dose: '1' };
  const n = toAlarm({ ...r, id: `test-${Date.now()}` }, new Date(Date.now() + 10_000));
  n.extra = { kind: 'test' }; // the dose sync leaves it alone; its buttons do nothing on the server
  await LN.schedule({ notifications: [n] });
  return true;
}

/** Daily "measure your BP / sugar" reminder at a fixed time (Vitals screen). null = off. */
export async function setVitalsReminder(hhmm) {
  if (!isNative()) return false;
  const id = alarmId('vitals-daily');
  await LN.cancel({ notifications: [{ id }] }).catch(() => {});
  if (!hhmm) return true;
  if (!(await ensureAlarmSetup(true))) return false;
  const [hour, minute] = hhmm.split(':').map(Number);
  await LN.schedule({
    notifications: [
      {
        id,
        title: t('native.vitals.title'),
        body: t('native.vitals.body'),
        schedule: { on: { hour, minute }, repeats: true, allowWhileIdle: true },
        channelId: CHANNEL,
        smallIcon: 'ic_stat_notify',
        iconColor: '#2C5F51',
        autoCancel: true,
        extra: { kind: 'vitals' },
      },
    ],
  });
  return true;
}
