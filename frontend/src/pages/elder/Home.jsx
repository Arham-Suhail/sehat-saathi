import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BigButton, fmtTime } from '../../components/ui';
import { t } from '../../i18n/useT';
import { useReminders } from './ElderLayout';

export default function ElderHome() {
  const { user, logout } = useAuth();
  const { reminders } = useReminders();
  const now = Date.now();
  const next = reminders.find((r) => r.status === 'pending' && new Date(r.scheduled_at).getTime() >= now - 60 * 60_000);

  const tiles = [
    { to: '/elder/upload', title: t('home.upload'), sub: t('home.upload.sub'), icon: '📷' },
    { to: '/elder/reminders', title: t('home.reminders'), sub: t('home.reminders.sub'), icon: '💊' },
    { to: '/elder/checkin', title: t('home.checkin'), sub: t('home.checkin.sub'), icon: '💬' },
    { to: '/elder/vitals', title: t('home.vitals'), sub: t('home.vitals.sub'), icon: '❤️' },
    { to: '/elder/invite', title: t('home.invite'), sub: t('home.invite.sub'), icon: '👪' },
  ];

  return (
    <main className="page stack">
      <header className="spaced">
        <h1>{t('home.greeting', { name: user.name.split(' ')[0] })}</h1>
        <BigButton variant="secondary" block={false} small onClick={logout}>
          {t('common.logout')}
        </BigButton>
      </header>

      <section className="card card--feature" aria-labelledby="next-title">
        <h2 id="next-title">{t('home.next')}</h2>
        {next ? (
          <p className="big">
            {fmtTime(next.scheduled_at)} — {next.medicine_name}
            {next.dose ? <span className="muted"> ({next.dose})</span> : null}
          </p>
        ) : (
          <p className="muted">{t('home.next.none')}</p>
        )}
      </section>

      <nav className="tiles" aria-label="Menu">
        {tiles.map((x) => (
          <Link key={x.to} to={x.to} className="tile tile--icon">
            <span className="tile__icon" aria-hidden="true">
              {x.icon}
            </span>
            <span className="tile__text">
              <span>{x.title}</span>
              <small>{x.sub}</small>
            </span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
