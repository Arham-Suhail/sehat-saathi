import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BigButton, ErrorText, Notice, TopBar, fmtDay, fmtTime } from '../../components/ui';
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
      <NotificationToggle />
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
              <li key={r.id} className="card stack">
                <div className="spaced">
                  <div>
                    <p className="big" style={{ margin: 0 }}>
                      {fmtTime(r.scheduled_at)} <span className="muted small">{fmtDay(r.scheduled_at)}</span>
                    </p>
                    <p style={{ margin: 0 }}>
                      {r.medicine_name}
                      {r.dose ? <span className="muted"> — {r.dose}</span> : null}
                    </p>
                    {r.instructions ? <p className="muted small" style={{ margin: 0 }}>{r.instructions}</p> : null}
                  </div>
                  <span className={`tag tag--${r.status === 'skipped' ? 'missed' : r.status}`}>
                    {t(`rem.status.${r.status}`)}
                  </span>
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
