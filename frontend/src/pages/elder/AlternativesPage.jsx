/* "Extra alternatives" screen (Home tile): every active medicine with its Extra-alternatives box, so the
   elder can compare products and open real prices. Each box is isolated by SafeBoundary. */
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Alternatives from '../../components/Alternatives';
import Icon from '../../components/Icon';
import SafeBoundary from '../../components/SafeBoundary';
import { BigButton, Disclaimer, ErrorText, TopBar } from '../../components/ui';
import { t } from '../../i18n/useT';

export default function AlternativesPage() {
  const [meds, setMeds] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api('/medicines')
      .then(setMeds)
      .catch((e) => {
        setErr(e.message);
        setMeds([]);
      });
  }, []);

  return (
    <main className="page stack">
      <TopBar back="/elder" title={t('alt.ask')} />
      <h1 className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon name="swap" size={28} />
        </span>
        {t('alt.ask')}
      </h1>
      <p>{t('alt.page.intro')}</p>
      <ErrorText>{err}</ErrorText>
      {meds === null ? <p className="muted">{t('common.loading')}</p> : null}
      {meds?.length === 0 && !err ? (
        <>
          <p className="muted">{t('meds.none')}</p>
          <BigButton variant="secondary" to="/elder/reminders">
            {t('home.reminders')}
          </BigButton>
        </>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {meds?.map((m) => (
          <li key={m.id} className="card stack">
            <h2 className="m-0" dir="auto">
              {m.name} {m.strength_text ? <span className="font-normal text-muted">{m.strength_text}</span> : null}
            </h2>
            <SafeBoundary>
              <Alternatives medicine={m} />
            </SafeBoundary>
          </li>
        ))}
      </ul>
      <Disclaimer />
    </main>
  );
}
