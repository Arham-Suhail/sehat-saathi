/* Native dose alarms for the Android app (Capacitor Local Notifications).
   The app schedules one Android notification per pending dose for the next 7 days, so alarms ring
   even if the app is closed, the phone is locked or offline. Re-synced on every reminder refresh:
   taken / skipped / stopped doses are cancelled, new ones added. Each alarm has "Taken" and
   "Remind me in 10 min" buttons. Website: does nothing (it uses Web Push instead). */
import { st } from '../i18n/server';
import { t } from '../i18n/useT';
import { isNative } from './native';

const CHANNEL = 'doses';
const MAX_ALARMS = 60; // Android allows ~500 per app; a week of doses is far below this
let setup = null;

const plugin = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);

/** Stable positive 31-bit id from a reminder id (Android notification ids are ints). */
export function alarmId(reminderId) {
  let h = 0;
  for (const c of String(reminderId)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1;
}

export function ensureAlarmSetup() {
  if (!isNative()) return Promise.resolve(false);
  if (!setup) {
    setup = (async () => {
      const LN = await plugin();
      let perm = await LN.checkPermissions();
      if (perm.display !== 'granted') perm = await LN.requestPermissions();
      await LN.createChannel({
        id: CHANNEL,
        name: t('native.channel'),
        description: t('native.channel.desc'),
        importance: 5,
        visibility: 1,
        vibration: true,
        lights: true,
        lightColor: '#0E5B56',
      }).catch(() => {});
      await LN.registerActionTypes({
        types: [
          {
            id: 'DOSE',
            actions: [
              { id: 'taken', title: t('native.action.taken'), foreground: true },
              { id: 'snooze', title: t('native.action.snooze') },
            ],
          },
        ],
      }).catch(() => {});
      return perm.display === 'granted';
    })().catch(() => false);
  }
  return setup;
}

function toAlarm(r, at) {
  return {
    id: alarmId(r.id),
    title: t('rem.alert.title'),
    body: `${st(r.medicine_name)}${r.dose ? ` — ${r.dose}` : ''}`,
    largeBody: `${st(r.medicine_name)}${r.dose ? ` — ${r.dose}` : ''}${r.instructions ? `\n${st(r.instructions)}` : ''}`,
    schedule: { at, allowWhileIdle: true },
    channelId: CHANNEL,
    actionTypeId: 'DOSE',
    smallIcon: 'ic_stat_notify',
    iconColor: '#0E5B56',
    autoCancel: true,
    extra: { reminderId: r.id, name: r.medicine_name, dose: r.dose || '' },
  };
}

/** Make the scheduled alarms match the pending doses in `reminders`. */
export async function syncAlarms(reminders) {
  if (!isNative() || !Array.isArray(reminders)) return;
  if (!(await ensureAlarmSetup())) return;
  const LN = await plugin();
  const now = Date.now();
  const wanted = reminders
    .filter((r) => r.status === 'pending' && new Date(r.scheduled_at).getTime() > now + 5_000)
    .slice(0, MAX_ALARMS);
  const wantedIds = new Set(wanted.map((r) => alarmId(r.id)));
  const { notifications: pending } = await LN.getPending();
  const stale = pending.filter((n) => !wantedIds.has(n.id) && !n.extra?.snoozed).map((n) => ({ id: n.id }));
  if (stale.length) await LN.cancel({ notifications: stale });
  const have = new Set(pending.map((n) => n.id));
  const add = wanted.filter((r) => !have.has(alarmId(r.id))).map((r) => toAlarm(r, new Date(r.scheduled_at)));
  if (add.length) await LN.schedule({ notifications: add });
}

export async function cancelAlarm(reminderId) {
  if (!isNative()) return;
  const LN = await plugin();
  await LN.cancel({ notifications: [{ id: alarmId(reminderId) }] }).catch(() => {});
}

/** "Remind me in 10 min" from the notification itself. */
export async function snoozeAlarm(extra) {
  if (!isNative() || !extra?.reminderId) return;
  const LN = await plugin();
  const r = { id: `${extra.reminderId}:snooze`, medicine_name: extra.name, dose: extra.dose };
  const n = toAlarm(r, new Date(Date.now() + 10 * 60_000));
  n.extra = { ...extra, snoozed: true };
  await LN.schedule({ notifications: [n] });
}
