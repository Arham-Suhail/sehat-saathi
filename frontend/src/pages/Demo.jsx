/* /demo: judge walkthrough. Lists the demo accounts and a
   3-step script. The demo password is NOT written here (public repo): it is in the submission notes. */
import { Link } from 'react-router-dom';
import { t } from '../i18n/useT';

const ACCOUNTS = [
  ['elder@demo.example', 'demo.role.elder'],
  ['family@demo.example', 'demo.role.family'],
  ['doctor@demo.example', 'demo.role.doctor'],
];

export default function Demo() {
  return (
    <main className="page flex flex-col gap-5">
      <h1 className="m-0">{t('demo.title')}</h1>
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
