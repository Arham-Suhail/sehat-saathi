/* "Meri dawaiyan" on the Today's-medicines screen: every active medicine with a Remove button, plus
   "Add a medicine yourself". Remove = POST /medicines/{id}/stop (elder only, own medicine; the
   server deletes its future reminders and keeps the record for adherence history). It asks
   "Are you sure?" inline first (no browser popup) so an elder can't remove one by a mistaken tap.
   Adding opens the normal confirm form empty, so the server's checks apply as for a photo. */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { st } from '../i18n/server';
import { getLang, t } from '../i18n/useT';
import Icon from './Icon';
import { BigButton, ErrorText, Notice, fmtHHMM } from './ui';

function scheduleText(m) {
  if (m.reminder_mode === 'hospital') return t('dash.hospital');
  if (m.reminder_mode === 'prn') return t('confirm.prn');
  return (m.timings || []).map(fmtHHMM).join(getLang() === 'ur' ? '، ' : ', ');
}

export default function MyMedicines({ onChanged }) {
  const nav = useNavigate();
  const [meds, setMeds] = useState(null);
  const [asking, setAsking] = useState(null); // id waiting for "are you sure?"
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [removed, setRemoved] = useState(null);

  const load = useCallback(async () => {
    try {
      setMeds(await api('/medicines'));
    } catch (e) {
      setErr(e.message);
      setMeds([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const remove = async (m) => {
    setBusy(m.id);
    setErr(null);
    try {
      await api(`/medicines/${encodeURIComponent(m.id)}/stop`, { method: 'POST' });
      setRemoved(m.name);
      setAsking(null);
      await load();
      await onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card stack" aria-labelledby="mymeds-h">
      <h2 id="mymeds-h" className="flex items-center gap-2">
        <Icon name="pill" size={26} className="text-accent" />
        {t('meds.title')}
      </h2>

      <div aria-live="polite">
        {removed ? <Notice kind="success">✓ {t('meds.removed', { name: removed })}</Notice> : null}
        <ErrorText>{err}</ErrorText>
      </div>

      {meds === null ? <p className="muted">{t('common.loading')}</p> : null}
      {meds?.length === 0 ? <p className="muted">{t('meds.none')}</p> : null}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {meds?.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[1.3rem] font-bold" dir="auto">
                  {m.name} {m.strength_text ? <span className="font-normal text-muted">{m.strength_text}</span> : null}
                </p>
                <p className="m-0 text-[1.25rem] text-muted">
                  {m.dose_text ? <span dir="auto">{m.dose_text}</span> : null}
                  {m.dose_text && m.frequency_label ? ' · ' : null}
                  {m.frequency_label ? st(m.frequency_label) : null}
                </p>
                <p className="m-0 text-[1.25rem]">{scheduleText(m)}</p>
              </div>
              {asking !== m.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setAsking(m.id);
                    setRemoved(null);
                  }}
                  aria-label={t('meds.remove.aria', { name: m.name })}
                  className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-danger bg-surface px-4 text-[1.25rem] font-bold text-danger"
                >
                  ✕ {t('meds.remove')}
                </button>
              ) : null}
            </div>
            {asking === m.id ? (
              <div className="flex flex-col gap-2 rounded-2xl bg-danger-bg p-3" role="group" aria-label={t('meds.remove.aria', { name: m.name })}>
                <p className="m-0 text-[1.25rem] font-bold text-danger">{t('meds.sure', { name: m.name })}</p>
                <div className="flex flex-col gap-2">
                  <BigButton variant="danger" disabled={busy === m.id} onClick={() => remove(m)}>
                    {busy === m.id ? t('common.loading') : t('meds.yes')}
                  </BigButton>
                  <BigButton variant="secondary" disabled={busy === m.id} onClick={() => setAsking(null)}>
                    {t('meds.no')}
                  </BigButton>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <BigButton variant="secondary" onClick={() => nav('/elder/confirm', { state: { manual: true, from: '/elder/reminders' } })}>
        + {t('meds.add')}
      </BigButton>
      <BigButton variant="secondary" onClick={() => nav('/elder/upload')}>
        📷 {t('meds.add.photo')}
      </BigButton>
    </section>
  );
}
