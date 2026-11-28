import { motion } from 'motion/react';
import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { t } from '../i18n/useT';
import { isAppMode } from '../lib/appMode';
import { hapticSelect } from '../lib/native';
import ChotuAgent from './chotu/ChotuAgent';
import ChotuBoundary from './chotu/ChotuBoundary';
import Icon from './Icon';

/* App-mode bottom navigation (Android app / installed PWA only; the website keeps its own navigation).
   Elders: Home, Medicines, Chotu (raised middle button -> check-in), Progress, More.
   Family / doctor: Home, Alerts, Meetings, More. Shown on the tab screens only; deeper screens keep Back. */
export const ELDER_TABS = ['/elder', '/elder/reminders', '/elder/progress', '/elder/more'];
export const CARER_TABS = ['/carer', '/carer/alerts', '/carer/meetings', '/carer/more'];
export const TAB_ROOTS = [...ELDER_TABS, ...CARER_TABS];

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z" />
  </svg>
);
const MoreIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" />
  </svg>
);

const ELDER = [
  { to: '/elder', label: 'tab.home', icon: <HomeIcon /> },
  { to: '/elder/reminders', label: 'tab.meds', icon: <Icon name="pill" size={26} /> },
  { to: '/elder/checkin', label: 'tab.chotu', center: true },
  { to: '/elder/progress', label: 'tab.progress', icon: <Icon name="trophy" size={26} /> },
  { to: '/elder/more', label: 'tab.more', icon: <MoreIcon /> },
];
const CARER = [
  { to: '/carer', label: 'tab.home', icon: <HomeIcon /> },
  { to: '/carer/alerts', label: 'tab.alerts', icon: <Icon name="bell" size={26} /> },
  { to: '/carer/meetings', label: 'tab.meetings', icon: <Icon name="calendar" size={26} /> },
  { to: '/carer/more', label: 'tab.more', icon: <MoreIcon /> },
];

const buzz = () => hapticSelect();

export function useTabBarVisible() {
  const { pathname } = useLocation();
  return isAppMode() && TAB_ROOTS.includes(pathname.replace(/\/$/, '') || '/');
}

export default function AppTabBar({ badge = 0 }) {
  const visible = useTabBarVisible();
  const { pathname } = useLocation();
  const carer = pathname.startsWith('/carer');
  const tabs = carer ? CARER : ELDER;
  useEffect(() => {
    document.documentElement.classList.toggle('has-tabbar', visible);
    return () => document.documentElement.classList.remove('has-tabbar');
  }, [visible]);
  if (!visible) return null;

  return (
    <nav aria-label={t('tab.nav')} className="app-tabbar">
      <ul className={`app-tabbar__list${carer ? ' app-tabbar__list--3' : ''}`}>
        {tabs.map((tab) =>
          tab.center ? (
            <li key={tab.to} className="app-tabbar__center">
              <NavLink to={tab.to} onClick={buzz} aria-label={t(tab.label)} className="app-tabbar__chotu">
                <ChotuBoundary>
                  <ChotuAgent size={44} state="idle" />
                </ChotuBoundary>
              </NavLink>
              <span className="app-tabbar__label" aria-hidden="true">{t(tab.label)}</span>
            </li>
          ) : (
            <li key={tab.to}>
              <NavLink to={tab.to} end onClick={buzz} className="app-tabbar__item pressable">
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span layoutId="tab-pill" className="app-tabbar__pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                    ) : null}
                    <span className="app-tabbar__icon">
                      {tab.icon}
                      {tab.to === '/carer/alerts' && badge > 0 ? <span className="app-tabbar__badge">{badge > 9 ? '9+' : badge}</span> : null}
                    </span>
                    <span className="app-tabbar__label">{t(tab.label)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
