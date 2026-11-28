/* /demo: judge walkthrough. Wakes the (free-tier) server first, lists the demo accounts and a
   3-step script. The demo password is NOT written here (public repo): it is in the submission notes. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { wakeServer } from '../api/client';
import Icon from '../components/Icon';
import { t } from '../i18n/useT';

const ACCOUNTS = [
  ['elder@demo.example', 'demo.role.elder'],
  ['family@demo.example', 'demo.role.family'],
  ['doctor@demo.example', 'demo.role.doctor'],
];

export default function Demo() {
  const [server, setServer] = useState('waking');
  const warm = () => {
    setServer('waking');
    wakeServer().then((ok) => setServer(ok ? 'ok' : 'down'));
  };
  useEffect(warm, []);
  return (
    <main className="page flex flex-col gap-5">
      <h1 className="m-0">{t('demo.title')}</h1>
      <div className={`flex items-center gap-3 rounded-[22px] px-4 py-3 ${server === 'ok' ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning-text'}`} role="status">
        <Icon name={server === 'ok' ? 'check' : 'bell'} size={24} />
        <span className="flex-1 text-[1.15rem] font-semibold">{t(`demo.server.${server}`)}</span>
        {server !== 'ok' ? (
          <button type="button" onClick={warm} className="app-btn app-btn--secondary app-btn--sm">
            {t('demo.wake')}
          </button>
        ) : null}
      </div>
      <section className="card-ios p-5">
        <h2 className="m-0 mb-3 text-[1.3rem]">{t('demo.accounts')}</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {ACCOUNTS.map(([email, role]) => (
            <li key={email} className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{t(role)}</span>
              <code className="select-all text-[1.05rem]">{email}</code>
            </li>
          ))}
        </ul>
        <p className="m-0 mt-3 text-[1rem] text-muted">{t('demo.password')}</p>
      </section>
      <section className="card-ios p-5">
        <h2 className="m-0 mb-3 text-[1.3rem]">{t('demo.script')}</h2>
        <ol className="m-0 flex flex-col gap-2 ps-6 text-[1.15rem]">
          <li>{t('demo.s1')}</li>
          <li>{t('demo.s2')}</li>
          <li>{t('demo.s3')}</li>
        </ol>
      </section>
      <Link to="/login" className="app-btn app-btn--primary no-underline">
        {t('demo.login')}
      </Link>
    </main>
  );
}
