import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import Alternatives from '../../components/Alternatives';
import { AdherenceBars, MoodChart } from '../../components/charts';
import { BigButton, Disclaimer, ErrorText, Notice, PharmacistBanner, TopBar, fmtDay, fmtHHMM, fmtTime } from '../../components/ui';
import VitalsForm from '../../components/VitalsForm';
import VitalsList from '../../components/VitalsList';

const MOOD = { good: '🙂 Acha', okay: '😐 Theek', low: '🙁 Udaas' };
const CHANNEL = { text: 'likh kar', speech: 'bol kar', vapi: 'call' };

function Timeline({ checkins }) {
  if (!checkins.length) return <p className="muted">Abhi koi hal-chaal nahi.</p>;
  return (
    <ul className="timeline">
      {checkins.map((c) => (
        <li key={c.id} className={`timeline__item stack${c.concern_flag ? ' timeline__item--concern' : ''}`}>
          <div className="spaced">
            <strong>{MOOD[c.mood]}</strong>
            <span className="muted small">
              {fmtDay(c.created_at)} {fmtTime(c.created_at)} · {CHANNEL[c.channel]}
            </span>
          </div>
          {c.concern_flag ? (
            <div className="notice notice--danger" role="note">
              <strong>⚠ Tawajjo zaroori</strong>
              {c.concern_reason}
            </div>
          ) : null}
          {c.transcript
            .filter((x) => x.role === 'elder')
            .map((x, i) => (
              <p key={i} className="timeline__quote">
                “{x.text}”
              </p>
            ))}
        </li>
      ))}
    </ul>
  );
}

function AdherenceRing({ pct }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const value = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <svg className="stat-ring__svg" viewBox="0 0 110 110" width="110" height="110" role="img"
      aria-label={pct == null ? 'Abhi data nahi' : `${pct}% dawai waqt par`}>
      <circle className="stat-ring__track" cx="55" cy="55" r={r} />
      <circle className="stat-ring__value" cx="55" cy="55" r={r} strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)} transform="rotate(-90 55 55)" />
      <text className="stat-ring__num" x="55" y="62" textAnchor="middle">
        {pct == null ? '—' : `${pct}%`}
      </text>
    </svg>
  );
}

export default function Dashboard() {
  const { elderId } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [showVitalsForm, setShowVitalsForm] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api(`/dashboard/${encodeURIComponent(elderId)}?days=14`, { timeoutMs: 60000 }));
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, [elderId]);
  useEffect(() => {
    load();
  }, [load]);

  if (err && !d)
    return (
      <main className="page stack">
        <TopBar back="/carer" />
        <ErrorText>{err}</ErrorText>
      </main>
    );
  if (!d)
    return (
      <main className="page">
        <TopBar back="/carer" />
        <p className="muted">Load ho raha hai…</p>
      </main>
    );

  const t = d.adherence_totals;
  return (
    <main className="page page--wide stack">
      <TopBar back="/carer" title={d.elder.name} right={<BigButton variant="secondary" small block={false} onClick={load}>↻</BigButton>} />
      <h1>{d.elder.name} — pichle {d.days} din</h1>

      <div className="dash-grid">
        <section className="card" aria-label="Khulasa">
          <h2>Khulasa</h2>
          <div className="stat-ring">
            <AdherenceRing pct={t.adherence_pct} />
            <div className="stack" style={{ gap: 8 }}>
              <p className="big" style={{ margin: 0 }}>
                {t.adherence_pct != null ? 'Dawai waqt par' : 'Abhi data nahi'}
              </p>
              <div className="chips">
                <span className="chip-stat chip-stat--ok">✓ {t.taken} li</span>
                <span className="chip-stat chip-stat--skip">{t.skipped} nahi li</span>
                <span className="chip-stat chip-stat--miss">{t.missed} reh gayin</span>
              </div>
            </div>
          </div>
          {d.concerns ? (
            <Notice kind="warning">⚠ {d.concerns} hal-chaal mein tawajjo ki baat</Notice>
          ) : (
            <p className="muted">Koi tawajjo wali baat nahi.</p>
          )}
        </section>

        <section className="card" aria-labelledby="mood-h">
          <h2 id="mood-h">Mood</h2>
          <MoodChart series={d.mood_series} />
        </section>

        <section className="card" aria-labelledby="adh-h">
          <h2 id="adh-h">Dawai: li / reh gayi</h2>
          <AdherenceBars series={d.adherence} totals={t} />
        </section>

        <section className="card span-all" aria-labelledby="tl-h">
          <h2 id="tl-h">Hal-chaal (timeline)</h2>
          <Timeline checkins={d.checkins} />
        </section>

        <section className="card stack" aria-labelledby="meds-h">
          <h2 id="meds-h">Dawaiyan</h2>
          {d.medicines.length === 0 ? <p className="muted">Koi dawai nahi.</p> : null}
          <ul className="list">
            {d.medicines.map((m) => (
              <li key={m.id} className="med-row stack">
                <div>
                  <strong>{m.name}</strong> {m.strength_text ? <span className="muted">{m.strength_text}</span> : null}
                  <p className="small muted" style={{ margin: 0 }}>
                    {[m.dose_text, m.frequency_label, m.route_kind !== 'unknown' ? m.route_label : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="small" style={{ margin: 0 }}>
                    {m.reminder_mode === 'hospital'
                      ? 'Hospital wali dawai — reminders nahi'
                      : m.reminder_mode === 'prn'
                        ? `Zaroorat par${m.prn_condition ? `: ${m.prn_condition}` : ''}`
                        : m.timings.map(fmtHHMM).join(', ')}
                  </p>
                </div>
                {m.needs_pharmacist ? <PharmacistBanner /> : null}
                <Alternatives medicine={m} />
              </li>
            ))}
          </ul>
          <Disclaimer />
        </section>

        <section className="card stack" aria-labelledby="vit-h">
          <h2 id="vit-h">BP / Sugar / Pulse</h2>
          {d.can_add_vitals ? (
            showVitalsForm ? (
              <VitalsForm elderId={d.elder.id} onSaved={() => load()} />
            ) : (
              <BigButton variant="secondary" small onClick={() => setShowVitalsForm(true)}>
                + Reading likhein
              </BigButton>
            )
          ) : null}
          <VitalsList vitals={d.vitals} />
        </section>
      </div>
    </main>
  );
}
