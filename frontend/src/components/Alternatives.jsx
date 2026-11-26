import { useState } from 'react';
import { api } from '../api/client';
import { st } from '../i18n/server';
import { t } from '../i18n/useT';
import { BigButton, Disclaimer, ErrorText } from './ui';

/** Cheaper generic options — always labelled "needs doctor verification". */
export default function Alternatives({ medicine }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(await api(`/medicines/${medicine.id}/alternatives`, { timeoutMs: 60000 }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <>
        <BigButton variant="secondary" small disabled={busy} onClick={load}>
          {busy ? t('alt.searching') : t('alt.ask')}
        </BigButton>
        <ErrorText>{err}</ErrorText>
      </>
    );

  return (
    <div className="notice notice--warning stack" role="region" aria-label={t('alt.region', { name: medicine.name })}>
      <strong>⚠ {st(data.label)}</strong>
      <p style={{ margin: 0 }}>
        {t('alt.generic')} <strong>{data.generic_name === 'unknown' ? t('alt.unknown') : data.generic_name}</strong>
      </p>
      {data.alternatives.length ? (
        <ul style={{ margin: 0 }}>
          {data.alternatives.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0 }}>{t('alt.none')}</p>
      )}
      <Disclaimer text={st(data.disclaimer)} />
    </div>
  );
}
