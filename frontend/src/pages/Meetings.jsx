/* Meetings (elder, family and doctor): upcoming and recent meetings, and "New meeting".
   A carer opening it from an elder's dashboard (?elder=<id>) gets that elder preselected. */
import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { readCache, writeCache } from '../lib/cache';
import { useAuth } from '../auth/AuthContext';
import Icon from '../components/Icon';
import { MeetingCard, NewMeetingSheet } from '../components/meetings';
import { ErrorText, Notice, TopBar } from '../components/ui';
import { t } from '../i18n/useT';
import { syncMeetingAlarms } from '../lib/nativeAlarms';

export default function Meetings() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const carer = user.role !== 'elder';
  const [list, setList] = useState(() => readCache('meetings', null));
  const [elders, setElders] = useState([]);
  const [open, setOpen] = useState(params.get('new') === '1');
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = await api('/meetings');
      setList(m);
      writeCache('meetings', m);
      syncMeetingAlarms(m).catch(() => {});
    } catch (e) {
      setErr(e.message);
      setList((x) => x || []);
    }
  }, []);

  useEffect(() => {
    load();
    if (carer) api('/carer/elders').then(setElders).catch(() => {});
  }, [load, carer]);

  const upcoming = (list || []).filter((m) => new Date(m.starts_at).getTime() + m.duration_min * 60_000 >= Date.now() && m.status !== 'cancelled');
  const rest = (list || []).filter((m) => !upcoming.includes(m));

  return (
    <MotionConfig reducedMotion="user">
      <main className="page flex flex-col gap-4">
        <TopBar back={carer ? '/carer/more' : '/elder/more'} title={t('meet.title')} />
        <div className="flex items-end justify-between gap-3">
          <h1 className="m-0">{t('meet.title')}</h1>
        </div>
        <p className="m-0 text-[1.1rem] text-muted">{t(user.role === 'doctor' ? 'meet.intro.doctor' : 'meet.intro')}</p>
        <button type="button" onClick={() => setOpen(true)} className="app-btn app-btn--primary">
          <Icon name="plus" size={24} />
          {t('meet.new')}
        </button>
        {ok ? <Notice kind="success">✓ {t('meet.sent')}</Notice> : null}
        <ErrorText>{err}</ErrorText>
        {list === null ? <div className="h-40 animate-pulse rounded-[24px] bg-surface-alt" aria-label={t('common.loading')} /> : null}
        {list && !list.length ? (
          <div className="card-ios flex flex-col items-center gap-2 p-8 text-center">
            <span className="row-icon row-icon--accent">
              <Icon name="calendar" size={26} />
            </span>
            <p className="m-0 text-[1.2rem] font-semibold">{t('meet.none')}</p>
          </div>
        ) : null}
        {upcoming.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="up-h">
            <h2 id="up-h" className="section-label">
              {t('meet.upcoming')}
            </h2>
            <motion.ul layout className="m-0 flex list-none flex-col gap-3 p-0">
              {upcoming.map((m) => (
                <MeetingCard key={m.id} m={m} meId={user.id} onChanged={load} />
              ))}
            </motion.ul>
          </section>
        ) : null}
        {rest.length ? (
          <section className="flex flex-col gap-3" aria-labelledby="past-h">
            <h2 id="past-h" className="section-label">
              {t('meet.past')}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {rest.map((m) => (
                <MeetingCard key={m.id} m={m} meId={user.id} onChanged={load} />
              ))}
            </ul>
          </section>
        ) : null}
        <NewMeetingSheet
          open={open}
          onClose={() => setOpen(false)}
          elderId={params.get('elder')}
          elders={elders}
          onCreated={() => {
            setOk(true);
            load();
          }}
        />
      </main>
    </MotionConfig>
  );
}
