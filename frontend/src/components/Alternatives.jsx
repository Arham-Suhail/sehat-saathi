import { useState } from 'react';
import { api } from '../api/client';
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
          {busy ? 'Dhoond raha hoon…' : 'Sasti generic dawai?'}
        </BigButton>
        <ErrorText>{err}</ErrorText>
      </>
    );

  return (
    <div className="notice notice--warning stack" role="region" aria-label={`${medicine.name} alternatives`}>
      <strong>⚠ {data.label}</strong>
      <p style={{ margin: 0 }}>
        Generic naam: <strong>{data.generic_name === 'unknown' ? 'Maloom nahi' : data.generic_name}</strong>
      </p>
      {data.alternatives.length ? (
        <ul style={{ margin: 0 }}>
          {data.alternatives.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0 }}>Koi pakka mashwara nahi mila — pharmacist ya doctor se poochein.</p>
      )}
      <Disclaimer text={data.disclaimer} />
    </div>
  );
}
