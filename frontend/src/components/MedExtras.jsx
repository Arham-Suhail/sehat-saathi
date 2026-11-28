/* Per-medicine extras on "My medicines":
   - refill: doses left (counted down by every "Taken"), warning when 3 days or less remain
   - side-effect notes (free text, shown to the doctor; no AI reading them)
   - pill photo ID card: a small photo of the strip, stored ONLY on this phone
   - course complete badge, order/find links, and the prescription history list
   Plus interactionWarnings(): a tiny hand-checked list -> "ask your pharmacist" (never decides). */
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { hapticSuccess } from '../lib/native';
import { PharmacyLinks } from './EmergencyExtras';
import { ErrorText, fmtDay } from './ui';

const photoKey = (id) => `ss.pill.${id}`;

function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function courseDone(m) {
  if (!m.duration_days || !m.created_at) return false;
  return Date.now() > new Date(m.created_at).getTime() + m.duration_days * 86_400_000;
}

export function MedExtras({ med, onChanged, elderId }) {
  const [open, setOpen] = useState(false);
  const [doses, setDoses] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [photo, setPhoto] = useState(() => {
    try {
      return localStorage.getItem(photoKey(med.id));
    } catch {
      return null;
    }
  });
  const q = elderId ? { elder_id: elderId } : {};
  const low = med.days_left != null && med.days_left <= 3;

  const run = async (fn) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      hapticSuccess();
      await onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {courseDone(med) ? <span className="chip-ios">🎉 {t('med.course_done')}</span> : null}
        {med.doses_left != null ? (
          <span className={`chip-ios ${low ? 'chip-ios--warn' : ''}`}>
            {t('med.left', { n: med.doses_left })}
            {med.days_left != null ? ` · ${t('med.days_left', { n: med.days_left })}` : ''}
          </span>
        ) : null}
        {photo ? <img src={photo} alt={t('med.photo.alt', { name: med.name })} className="h-14 w-14 rounded-xl object-cover" /> : null}
        <button type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open} className="chip-ios pressable min-h-12 px-4">
          {open ? t('med.less') : t('med.more')}
        </button>
      </div>
      {low ? <p className="m-0 text-[1.05rem] font-semibold text-warning-text">{t('med.refill_soon')}</p> : null}
      {open ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-alt p-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (doses === '') return;
              run(async () => {
                await api(`/medicines/${encodeURIComponent(med.id)}/stock`, { method: 'POST', json: { doses: Number(doses), ...q } });
                setDoses('');
              });
            }}
          >
            <label className="form-row flex-1">
              <span>{t('med.stock')}</span>
              <input className="input" inputMode="numeric" value={doses} onChange={(e) => setDoses(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="30" />
            </label>
            <button type="submit" disabled={busy || doses === ''} className="app-btn app-btn--secondary app-btn--sm">
              {t('common.save')}
            </button>
          </form>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              run(async () => {
                await api(`/medicines/${encodeURIComponent(med.id)}/notes`, { method: 'POST', json: { text: note.trim(), ...q } });
                setNote('');
              });
            }}
          >
            <label className="form-row">
              <span>{t('med.note')}</span>
              <textarea className="input min-h-16" dir="auto" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('med.note.ph')} />
            </label>
            <button type="submit" disabled={busy || !note.trim()} className="app-btn app-btn--secondary app-btn--sm self-start">
              {t('med.note.add')}
            </button>
          </form>
          {med.notes?.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[1.05rem]">
              {med.notes
                .slice()
                .reverse()
                .map((n, i) => (
                  <li key={i}>
                    <span dir="auto">“{n.text}”</span> <span className="text-muted">— {n.by_name}, {fmtDay(n.at)}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          {!elderId ? (
            <label className="app-btn app-btn--secondary app-btn--sm cursor-pointer self-start">
              📷 {photo ? t('med.photo.change') : t('med.photo.add')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="visually-hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const data = await resizePhoto(f);
                    localStorage.setItem(photoKey(med.id), data);
                    setPhoto(data);
                  } catch {
                    setErr(t('med.photo.fail'));
                  }
                }}
              />
            </label>
          ) : null}
          {!elderId ? <p className="m-0 text-[0.95rem] text-muted">{t('med.photo.note')}</p> : null}
          <PharmacyLinks name={med.name} />
          <ErrorText>{err}</ErrorText>
        </div>
      ) : null}
    </div>
  );
}

export function RxHistory({ elderId }) {
  const [rx, setRx] = useState(null);
  useEffect(() => {
    api(`/prescriptions${elderId ? `?elder_id=${encodeURIComponent(elderId)}` : ''}`)
      .then(setRx)
      .catch(() => setRx([]));
  }, [elderId]);
  if (!rx?.length) return null;
  return (
    <section aria-labelledby="rx-h" className="flex flex-col gap-2">
      <h3 id="rx-h" className="section-label">
        {t('rx.history')}
      </h3>
      <ul className="ios-group m-0 list-none p-0">
        {rx.map((p) => (
          <li key={p.id} className="ios-row">
            <span className="w-28 shrink-0 text-[1.05rem] font-semibold text-muted">{fmtDay(p.created_at)}</span>
            <span className="min-w-0 flex-1 text-[1.1rem]" dir="auto">
              {p.diagnosis_text || t('rx.no_dx')} · {t('rx.meds', { n: p.medicine_ids.length })}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-[0.95rem] text-muted">{t('rx.note')}</p>
    </section>
  );
}

// Hand-checked, well-known pairs only. The app never decides: it says "ask your pharmacist".
const PAIRS = [
  [['warfarin'], ['aspirin', 'disprin', 'loprin', 'ibuprofen', 'brufen', 'diclofenac', 'voltral', 'naproxen', 'synflex']],
  [['clopidogrel', 'plavix'], ['omeprazole', 'risek', 'esomeprazole', 'nexum']],
  [['sildenafil', 'viagra', 'tadalafil'], ['isosorbide', 'nitroglycerin', 'angised', 'imdur']],
  [['ibuprofen', 'brufen'], ['diclofenac', 'voltral', 'naproxen', 'synflex', 'mefenamic', 'ponstan']],
  [['spironolactone', 'aldactone'], ['potassium', 'k-lyte']],
];
const norm = (s) => (s || '').toLowerCase();

export function interactionWarnings(meds) {
  const names = meds.map((m) => norm(`${m.name} ${m.original_text || ''}`));
  const out = [];
  for (const [a, b] of PAIRS) {
    const ma = meds.filter((_, i) => a.some((x) => names[i].includes(x)));
    const mb = meds.filter((_, i) => b.some((x) => names[i].includes(x)) && !ma.includes(meds[i]));
    if (ma.length && mb.length) out.push(t('med.interact', { a: ma[0].name, b: mb[0].name }));
  }
  return out;
}

/** Same medicine twice (same first word of the name). Pure code, no AI. */
export function duplicateNames(newMeds, existing) {
  const key = (n) => norm(n).split(/[\s\d]/)[0];
  const have = new Map(existing.map((m) => [key(m.name), m.name]));
  const seen = new Map();
  const dups = [];
  for (const m of newMeds) {
    const k = key(m.name);
    if (!k || k.length < 3) continue;
    if (have.has(k) || seen.has(k)) dups.push(m.name);
    seen.set(k, m.name);
  }
  return [...new Set(dups)];
}
