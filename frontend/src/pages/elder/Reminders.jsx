import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BigButton, ErrorText, Notice, TopBar, fmtDay, fmtTime } from '../../components/ui';
import { isIosNotInstalled, usePush } from '../../hooks/usePush';
import { notificationsSupported } from '../../hooks/useReminderEngine';
import { t } from '../../i18n/useT';
import { useReminders } from './ElderLayout';

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

// Web Push when available (alarm even with the app closed); otherwise in-app notifications.
function AlarmToggle() {
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

const DOSE_CLASS = { taken: 'dose--done', missed: 'dose--missed', skipped: 'dose--missed' };

export default function Reminders() {
  const { state } = useLocation();
  const { reminders, refresh, act, error } = useReminders();
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const run = async (id, action) => {
    setBusyId(id);
    setErr(null);
    try {
      await act(id, action);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const now = Date.now();
  return (
    <main className="page stack">
      <TopBar back="/elder" title={t('rem.title')} />
      <h1>{t('rem.title')}</h1>
      {state?.saved ? <Notice kind="success">✓ {t('confirm.saved')}</Notice> : null}
      <AlarmToggle />
      <p className="muted small">{t('rem.tab_note')}</p>
      <ErrorText>{err || error}</ErrorText>

      {reminders.length === 0 ? (
        <p className="muted">{t('rem.none')}</p>
      ) : (
        <ul className="list">
          {reminders.map((r) => {
            const at = new Date(r.scheduled_at).getTime();
            const actionable = r.status === 'pending' && at - now < 60 * 60_000;
            return (
              <li key={r.id} className={`card stack ${DOSE_CLASS[r.status] || ''}`}>
                <div className="dose">
                  <div className="dose__time">
                    <strong>{fmtTime(r.scheduled_at)}</strong>
                    <small>{fmtDay(r.scheduled_at)}</small>
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <p className="dose__name">{r.medicine_name}</p>
                    {r.dose ? <p className="muted" style={{ margin: 0 }}>{r.dose}</p> : null}
                    {r.instructions ? <p className="muted small" style={{ margin: 0 }}>{r.instructions}</p> : null}
                    <span className={`tag tag--${r.status === 'skipped' ? 'missed' : r.status}`} style={{ justifySelf: 'start' }}>
                      {t(`rem.status.${r.status}`)}
                    </span>
                  </div>
                </div>
                {actionable ? (
                  <div className="grid-2">
                    <BigButton variant="success" disabled={busyId === r.id} onClick={() => run(r.id, 'taken')}>
                      ✓ {t('rem.taken')}
                    </BigButton>
                    <BigButton variant="danger" disabled={busyId === r.id} onClick={() => run(r.id, 'skipped')}>
                      {t('rem.skip')}
                    </BigButton>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
