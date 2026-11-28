import { useEffect, useState } from 'react';
import DoseCard from '../../components/DoseCard';
import { useLocation } from 'react-router-dom';
import { BigButton, ErrorText, Notice, TopBar, fmtDay, fmtTime } from '../../components/ui';
import { isIosNotInstalled, usePush } from '../../hooks/usePush';
import { isNative } from '../../lib/native';
import { alarmPermission, ensureAlarmSetup } from '../../lib/nativeAlarms';
import { notificationsSupported } from '../../hooks/useReminderEngine';
import { t } from '../../i18n/useT';
import { useReminders } from './ElderLayout';
import { st } from '../../i18n/server';
import MyMedicines from '../../components/MyMedicines';
import { dayOffset } from '../../lib/days';
import { speak } from '../../lib/speak';

const SLOT = (iso) => {
  const h = Number(new Date(iso).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Karachi' }));
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 16 ? 'afternoon' : h >= 16 && h < 20 ? 'evening' : 'night';
};


function NotificationToggle() {
  const [perm, setPerm] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'));
  if (perm === 'unsupported') return <Notice>{t('rem.notify.unsupported')}</Notice>;
  if (perm === 'granted') return <Notice kind="success">🔔 {t('rem.notify.enabled')}</Notice>;
  if (perm === 'denied') return <Notice kind="warning">{t('rem.notify.denied')}</Notice>;
  return (
    <BigButton variant="secondary" onClick={async () => setPerm(await Notification.requestPermission())}>
      🔔 {t('rem.notify.on')}
    </BigButton>
  );
}

// Android app: native alarms (scheduled by the reminder engine). Shows whether they can ring.
function NativeAlarmStatus() {
  const { refresh } = useReminders();
  const [perm, setPerm] = useState('loading');
  useEffect(() => {
    alarmPermission().then(setPerm);
  }, []);
  if (perm === 'loading') return null;
  if (perm === 'granted') return <Notice kind="success">🔔 {t('push.elder.enabled')}</Notice>;
  if (perm === 'denied') return <Notice kind="warning">{t('native.denied')}</Notice>;
  return (
    <BigButton
      variant="secondary"
      onClick={async () => {
        const ok = await ensureAlarmSetup(true);
        setPerm(ok ? 'granted' : await alarmPermission());
        if (ok) refresh();
      }}
    >
      {t('push.elder.on')}
    </BigButton>
  );
}

// Web Push when available (alarm even with the app closed); otherwise in-app notifications.
function AlarmToggle() {
  if (isNative()) return <NativeAlarmStatus />;
  return <WebAlarmToggle />;
}

function WebAlarmToggle() {
  const push = usePush();
  if (push.state === 'on') return <Notice kind="success">🔔 {t('push.elder.enabled')}</Notice>;
  if (push.state === 'denied') return <Notice kind="warning">{t('push.denied')}</Notice>;
  if (push.state === 'off')
    return (
      <>
        <BigButton variant="secondary" onClick={push.enable}>
          {t('push.elder.on')}
        </BigButton>
        <ErrorText>{push.error}</ErrorText>
      </>
    );
  if (push.state === 'unsupported' && isIosNotInstalled()) return <Notice>{t('push.ios')}</Notice>;
  if (push.state === 'loading') return null;
  return <NotificationToggle />;
}

// Doses grouped under "Today" / "Tomorrow" / a date (Karachi calendar), so a dose for tomorrow is
// never shown as "Due" under today.
function groupByDay(reminders) {
  const groups = [];
  for (const r of reminders) {
    const offset = dayOffset(r.scheduled_at);
    const label = offset === 0 ? t('home.date.today') : offset === 1 ? t('day.tomorrow') : fmtDay(r.scheduled_at);
    const last = groups[groups.length - 1];
    // Today is split into Morning / Afternoon / Evening / Night (like a pill box).
    const full = offset === 0 ? `${label} · ${t(`slot.${SLOT(r.scheduled_at)}`)}` : label;
    if (last && last.label === full) last.items.push(r);
    else groups.push({ offset, label: full, items: [r] });
  }
  return groups;
}

const TAG = {
  taken: 'bg-success-bg text-success',
  missed: 'bg-danger-bg text-danger',
  skipped: 'bg-surface-alt text-muted',
  pending: 'bg-accent-soft text-accent',
};

export default function Reminders() {
  const { state } = useLocation();
  const { reminders, refresh, act, error } = useReminders();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const now = Date.now();
  // The dose to answer now: from 10 minutes before until 3 hours after its time.
  const due = reminders.find((r) => {
    const at = new Date(r.scheduled_at).getTime();
    return r.status === 'pending' && at - now <= 10 * 60_000 && now - at <= 3 * 3_600_000;
  });
  return (
    <main className="page flex flex-col gap-4">
      <TopBar back="/elder" title={t('rem.title')} />
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0">{t('rem.title')}</h1>
        <button
          type="button"
          onClick={() => {
            const left = reminders.filter((r) => r.status === 'pending' && dayOffset(r.scheduled_at) === 0);
            speak(
              left.length
                ? t('speak.list', { list: left.map((r) => `${fmtTime(r.scheduled_at)} ${st(r.medicine_name)}`).join(', ') })
                : t('speak.list.none'),
              { force: true },
            );
          }}
          className="app-btn app-btn--secondary app-btn--sm pressable shrink-0 whitespace-nowrap"
        >
          🔊 {t('rem.read')}
        </button>
      </div>
      {state?.saved === 'asked' ? <Notice kind="success">✓ {t('confirm.asked')}</Notice> : state?.saved ? <Notice kind="success">✓ {t('confirm.saved')}</Notice> : null}
      <ErrorText>{error}</ErrorText>
      {due ? <DoseCard reminder={due} onAct={act} /> : null}

      {reminders.length === 0 ? (
        <p className="m-0 text-muted">{t('rem.none')}</p>
      ) : (
        groupByDay(reminders).map(({ offset, label, items }) => (
          <section key={label} className="flex flex-col gap-2" aria-label={label}>
            <h2 className="section-label">{label}</h2>
            <ul className="ios-group m-0 list-none p-0">
              {items.map((r) => (
                <li key={r.id} className="ios-row">
                  <span className="w-[5.6rem] shrink-0 text-[1.2rem] font-bold [font-variant-numeric:tabular-nums]">{fmtTime(r.scheduled_at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.2rem] font-semibold" dir="auto">
                      {st(r.medicine_name)}
                    </span>
                    {r.dose || r.instructions ? (
                      <span className="block truncate text-[1rem] text-muted" dir="auto">
                        {[r.dose, r.instructions ? st(r.instructions) : null].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[0.9rem] font-bold ${TAG[r.status] || TAG.pending}`}>
                    {r.status === 'pending' && offset > 0 ? t('rem.status.upcoming') : t(`rem.status.${r.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <AlarmToggle />
      {isNative() ? null : <p className="m-0 text-[1rem] text-muted">{t('rem.tab_note')}</p>}
      <MyMedicines onChanged={refresh} />
    </main>
  );
}
