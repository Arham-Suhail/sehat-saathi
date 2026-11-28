import { MotionConfig, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import Icon from '../../components/Icon';
import ThemeToggle from '../../components/ThemeToggle';
import { Disclaimer } from '../../components/ui';
import { usePush } from '../../hooks/usePush';
import { LangToggle } from '../../i18n/LangProvider';
import { t } from '../../i18n/useT';

/* "More" tab (app mode), for elders and for family / doctors: profile, tools (elders), settings
   (language, light/dark, urgent alerts for carers) and account, as a native-style list. 64px rows. */
const TOOLS = [
  { to: '/elder/upload', key: 'home.upload', icon: 'camera', tint: 'bg-accent-soft text-accent' },
  { to: '/elder/vitals', key: 'home.vitals', icon: 'heart', tint: 'bg-danger-bg text-danger' },
  { to: '/elder/invite', key: 'home.invite', icon: 'family', tint: 'bg-gold-soft text-gold-text' },
  { to: '/elder/alternatives', key: 'home.alternatives', icon: 'swap', tint: 'bg-accent-soft text-accent' },
  { to: '/elder/emergency', key: 'home.emergency', icon: 'phone', tint: 'bg-danger-bg text-danger' },
];

const list = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } };

function Row({ children }) {
  return (
    <motion.li variants={item} className="border-b border-line last:border-b-0">
      {children}
    </motion.li>
  );
}

export default function More() {
  const { user, logout } = useAuth();
  const elder = user?.role === 'elder';
  const push = usePush();
  const initial = (user?.name || '?').trim().charAt(0).toUpperCase();
  return (
    <MotionConfig reducedMotion="user">
      <motion.main className="page flex flex-col gap-5" variants={list} initial="hidden" animate="show">
        <motion.header variants={item} className="flex items-center gap-4 rounded-3xl bg-accent p-5 text-accent-text shadow-lift">
          <span aria-hidden="true" className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface text-[1.8rem] font-bold text-accent">
            {initial}
          </span>
          <div className="min-w-0">
            {elder ? null : (
              <p className="m-0 mb-1 inline-flex rounded-full bg-surface px-3 py-0.5 text-[1rem] font-bold text-accent">
                {t(user?.role === 'doctor' ? 'auth.role.doctor' : 'auth.role.family')}
              </p>
            )}
            <h1 className="m-0 truncate text-[1.6rem] leading-tight">{user?.name}</h1>
            <p className="m-0 truncate text-[1.05rem] opacity-90">{user?.email}</p>
          </div>
        </motion.header>

        {elder ? (
        <section aria-labelledby="more-tools">
          <h2 id="more-tools" className="m-0 mb-2 px-1 text-[1.1rem] font-bold uppercase tracking-wide text-muted">{t('more.section.tools')}</h2>
          <motion.ul variants={list} className="m-0 list-none overflow-hidden rounded-3xl border border-line bg-surface p-0 shadow-soft">
            {TOOLS.map((x) => (
              <Row key={x.to}>
                <Link to={x.to} className="flex min-h-16 items-center gap-4 px-4 py-2 text-ink no-underline active:bg-surface-alt">
                  <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${x.tint}`}>
                    <Icon name={x.icon} size={24} />
                  </span>
                  <span className="flex-1 text-[1.25rem] font-bold leading-snug">{t(x.key)}</span>
                  <Icon name="chevron" size={22} className="text-muted rtl:-scale-x-100" />
                </Link>
              </Row>
            ))}
          </motion.ul>
        </section>
        ) : null}

        <section aria-labelledby="more-settings">
          <h2 id="more-settings" className="m-0 mb-2 px-1 text-[1.1rem] font-bold uppercase tracking-wide text-muted">{t('more.section.settings')}</h2>
          <motion.ul variants={list} className="m-0 list-none overflow-hidden rounded-3xl border border-line bg-surface p-0 shadow-soft">
            <Row>
              <div className="flex min-h-16 items-center gap-4 px-4 py-2">
                <span className="flex-1 text-[1.25rem] font-bold">{t('more.language')}</span>
                <LangToggle />
              </div>
            </Row>
            <Row>
              <div className="flex min-h-16 items-center gap-4 px-4 py-2">
                <span className="flex-1 text-[1.25rem] font-bold">{t('more.theme')}</span>
                <ThemeToggle />
              </div>
            </Row>
            {!elder && ['on', 'off', 'denied'].includes(push.state) ? (
              <Row>
                <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2">
                  <span className="flex-1 text-[1.25rem] font-bold">{t('more.alerts')}</span>
                  {push.state === 'on' ? (
                    <span className="rounded-full bg-success-bg px-3 py-1 text-[1.05rem] font-bold text-success">{t('more.alerts.on')}</span>
                  ) : push.state === 'denied' ? (
                    <span className="text-[1.05rem] text-muted">{t('push.denied')}</span>
                  ) : (
                    <button type="button" onClick={push.enable} className="min-h-12 rounded-full border-0 bg-accent px-4 text-[1.1rem] font-bold text-accent-text">
                      {t('more.alerts.turn_on')}
                    </button>
                  )}
                </div>
              </Row>
            ) : null}
          </motion.ul>
        </section>

        <section aria-labelledby="more-account">
          <h2 id="more-account" className="m-0 mb-2 px-1 text-[1.1rem] font-bold uppercase tracking-wide text-muted">{t('more.section.account')}</h2>
          <motion.ul variants={list} className="m-0 list-none overflow-hidden rounded-3xl border border-line bg-surface p-0 shadow-soft">
            <Row>
              <button type="button" onClick={logout} className="flex min-h-16 w-full items-center gap-4 border-0 bg-transparent px-4 py-2 text-start text-ink active:bg-surface-alt">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-alt text-muted">
                  <Icon name="logout" size={24} />
                </span>
                <span className="flex-1 text-[1.25rem] font-bold">{t('home.logout')}</span>
              </button>
            </Row>
            <Row>
              <Link to="/account/delete" className="flex min-h-16 items-center gap-4 px-4 py-2 text-danger no-underline active:bg-surface-alt">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-bg">
                  <Icon name="trash" size={22} />
                </span>
                <span className="flex-1 text-[1.25rem] font-bold">{t('delete.link')}</span>
              </Link>
            </Row>
          </motion.ul>
        </section>

        <motion.div variants={item}>
          <Disclaimer />
        </motion.div>
      </motion.main>
    </MotionConfig>
  );
}
