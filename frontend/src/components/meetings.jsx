/* Meetings UI: a small card (Home), the list with Join / Accept / Decline / Cancel, and the
   "New meeting" sheet. Rules live on the server (routers/meetings.py): always about one elder,
   always with a doctor in it, only people of that elder's circle. */
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { getLang, t } from '../i18n/useT';
import { haptic } from '../lib/native';
import Icon from './Icon';
import Segmented from './Segmented';
import { ErrorText } from './ui';

const MODE_ICON = { video: 'video', phone: 'phone', in_person: 'pin' };
const locale = () => (getLang() === 'ur' ? 'ur-PK' : 'en-PK');
export const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(locale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));

export function MeetingMini({ meeting, to }) {
  return (
    <Link to={to} className="ios-row card-ios">
      <span className="row-icon row-icon--accent">
        <Icon name="calendar" size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.05rem] font-semibold text-muted">{t('meet.next')}</span>
        <span className="block text-[1.25rem] font-bold leading-snug">{fmtWhen(meeting.starts_at)}</span>
        <span className="block truncate text-[1.05rem] text-muted">{t(`meet.mode.${meeting.mode}`)}</span>
      </span>
      <Icon name="chevron" size={22} className="shrink-0 text-muted rtl:-scale-x-100" />
    </Link>
  );
}

const STATUS_TONE = { accepted: 'text-success', declined: 'text-danger', pending: 'text-muted' };

export function MeetingCard({ m, meId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const past = new Date(m.starts_at).getTime() + m.duration_min * 60_000 < Date.now();
  const cancelled = m.status === 'cancelled';
  const call = async (path, body) => {
    setBusy(true);
    setErr(null);
    haptic();
    try {
      await api(`/meetings/${encodeURIComponent(m.id)}/${path}`, { method: 'POST', json: body });
      await onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`card-ios flex flex-col gap-3 p-5 ${cancelled || past ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="row-icon row-icon--accent">
          <Icon name={MODE_ICON[m.mode]} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[1.3rem] font-bold leading-snug">{fmtWhen(m.starts_at)}</p>
          <p className="m-0 text-[1.05rem] text-muted">
            {t(`meet.mode.${m.mode}`)} · {t('meet.minutes', { n: m.duration_min })}
            {cancelled ? ` · ${t('meet.cancelled')}` : ''}
          </p>
        </div>
      </div>
      {m.reason ? (
        <p className="m-0 text-[1.15rem]" dir="auto">
          {m.reason}
        </p>
      ) : null}
      {m.location ? (
        <p className="m-0 flex items-center gap-2 text-[1.05rem] text-muted" dir="auto">
          <Icon name="pin" size={18} /> {m.location}
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-1 border-t border-[var(--hairline)] p-0 pt-3">
        <li className="flex justify-between gap-2 text-[1.05rem]">
          <span className="font-semibold">{m.organiser.id === meId ? t('meet.you') : m.organiser.name}</span>
          <span className="text-muted">{t('meet.organiser')}</span>
        </li>
        {m.participants.map((p) => (
          <li key={p.id} className="flex justify-between gap-2 text-[1.05rem]">
            <span className="font-semibold">
              {p.id === meId ? t('meet.you') : p.name} <span className="font-normal text-muted">· {t(`meet.role.${p.role}`)}</span>
            </span>
            <span className={STATUS_TONE[p.response] || 'text-muted'}>{t(`meet.resp.${p.response}`)}</span>
          </li>
        ))}
      </ul>
      <ErrorText>{err}</ErrorText>
      {!cancelled && !past ? (
        <div className="flex flex-col gap-2">
          {m.mode === 'video' && m.link ? (
            <a href={m.link} target="_blank" rel="noopener noreferrer" className="app-btn app-btn--primary">
              <Icon name="video" size={24} />
              {t('meet.join')}
            </a>
          ) : null}
          {m.my_response === 'pending' ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => call('respond', { accept: true })} className="app-btn app-btn--success">
                {t('meet.accept')}
              </button>
              <button type="button" disabled={busy} onClick={() => call('respond', { accept: false })} className="app-btn app-btn--secondary">
                {t('meet.decline')}
              </button>
            </div>
          ) : null}
          {m.mine ? (
            <button type="button" disabled={busy} onClick={() => call('cancel')} className="min-h-12 border-0 bg-transparent text-[1.1rem] font-semibold text-danger">
              {t('meet.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

const pad = (n) => String(n).padStart(2, '0');
function defaultDate() {
  const d = new Date(Date.now() + 24 * 3_600_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NewMeetingSheet({ open, onClose, onCreated, elderId, elders = [] }) {
  const [elder, setElder] = useState(elderId || elders[0]?.id || null);
  const [people, setPeople] = useState(null);
  const [picked, setPicked] = useState([]);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('11:00');
  const [duration, setDuration] = useState('30');
  const [mode, setMode] = useState('video');
  const [reason, setReason] = useState('');
  const [location, setLocation] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!elder && elders[0]) setElder(elderId || elders[0].id);
  }, [elders, elderId, elder]);

  useEffect(() => {
    if (!open) return;
    setPeople(null);
    const q = elder ? `?elder_id=${encodeURIComponent(elder)}` : '';
    api(`/meetings/people${q}`)
      .then((list) => {
        setPeople(list);
        // Sensible default: the doctor(s) for elders / family; the patient for doctors.
        const doctors = list.filter((p) => p.role === 'doctor').map((p) => p.id);
        setPicked(doctors.length ? doctors : list.filter((p) => p.role === 'elder').map((p) => p.id));
      })
      .catch((e) => setErr(e.message));
  }, [open, elder]);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const starts = useMemo(() => new Date(`${date}T${time}:00+05:00`), [date, time]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    haptic();
    try {
      const body = {
        participant_ids: picked,
        starts_at: starts.toISOString(),
        duration_min: Number(duration),
        mode,
        reason: reason.trim() || null,
        ...(elder ? { elder_id: elder } : {}),
        ...(mode === 'in_person' && location.trim() ? { location: location.trim() } : {}),
        ...(mode === 'video' && link.trim() ? { link: link.trim() } : {}),
      };
      const m = await api('/meetings', { method: 'POST', json: body });
      onCreated?.(m);
      onClose();
      setReason('');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.form
            role="dialog"
            aria-modal="true"
            aria-labelledby="newmeet-h"
            className="sheet sheet--tall"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            noValidate
          >
            <span className="sheet__grabber" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={onClose} className="min-h-12 border-0 bg-transparent text-[1.1rem] font-semibold text-accent">
                {t('carerapp.cancel')}
              </button>
              <h2 id="newmeet-h" className="m-0 text-[1.25rem] font-bold">
                {t('meet.new')}
              </h2>
              <span className="w-16" />
            </div>

            {elders.length > 1 ? (
              <label className="form-row">
                <span>{t('meet.about')}</span>
                <select className="input" value={elder || ''} onChange={(e) => setElder(e.target.value)}>
                  {elders.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <fieldset className="form-row border-0 p-0">
              <legend className="mb-2 text-[1.05rem] font-semibold text-muted">{t('meet.with')}</legend>
              {people === null ? <p className="m-0 text-muted">{t('common.loading')}</p> : null}
              {people?.length === 0 ? <p className="m-0 text-muted">{t('meet.nobody')}</p> : null}
              <div className="ios-group">
                {people?.map((p) => (
                  <label key={p.id} className="ios-row cursor-pointer">
                    <span className="row-icon row-icon--neutral">
                      <Icon name={p.role === 'doctor' ? 'stethoscope' : p.role === 'elder' ? 'elder' : 'family'} size={22} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.2rem] font-bold">{p.name}</span>
                      <span className="block text-[1rem] text-muted">{t(`meet.role.${p.role}`)}</span>
                    </span>
                    <input type="checkbox" className="ios-check" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label className="form-row">
                <span>{t('meet.date')}</span>
                <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
              <label className="form-row">
                <span>{t('meet.time')}</span>
                <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
              </label>
            </div>

            <div className="form-row">
              <span>{t('meet.how')}</span>
              <Segmented
                id="meet-mode"
                label={t('meet.how')}
                value={mode}
                onChange={setMode}
                options={[
                  ['video', t('meet.mode.video')],
                  ['phone', t('meet.mode.phone')],
                  ['in_person', t('meet.mode.in_person')],
                ]}
              />
            </div>
            <div className="form-row">
              <span>{t('meet.length')}</span>
              <Segmented
                id="meet-len"
                label={t('meet.length')}
                value={duration}
                onChange={setDuration}
                options={['15', '30', '60'].map((n) => [n, t('meet.minutes', { n })])}
              />
            </div>
            {mode === 'in_person' ? (
              <label className="form-row">
                <span>{t('meet.where')}</span>
                <input className="input" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('meet.where.ph')} />
              </label>
            ) : null}
            {mode === 'video' ? (
              <label className="form-row">
                <span>{t('meet.link')}</span>
                <input className="input" dir="ltr" inputMode="url" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" />
                <small className="text-[0.95rem] text-muted">{t('meet.link.hint')}</small>
              </label>
            ) : null}
            <label className="form-row">
              <span>{t('meet.reason')}</span>
              <textarea className="input min-h-24" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('meet.reason.ph')} />
            </label>
            <ErrorText>{err}</ErrorText>
            <button type="submit" disabled={busy || !picked.length} className="app-btn app-btn--primary disabled:opacity-50">
              <Icon name="calendar" size={22} />
              {busy ? t('common.loading') : t('meet.send')}
            </button>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

