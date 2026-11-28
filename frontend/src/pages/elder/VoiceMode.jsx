/* Voice-only mode: hands-free screen for elders who can't read well. Big Chotu, one big button.
   Chotu speaks the next dose and today's progress out loud; the button starts the live voice call
   (or the speech check-in when the call isn't set up). Everything is also shown in large text. */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChotuAgent from '../../components/chotu/ChotuAgent';
import ChotuBoundary from '../../components/chotu/ChotuBoundary';
import { TopBar, fmtTime } from '../../components/ui';
import { st } from '../../i18n/server';
import { t } from '../../i18n/useT';
import { dayOffset } from '../../lib/days';
import { speak, stopSpeaking } from '../../lib/speak';
import { useReminders } from './ElderLayout';

export default function VoiceMode() {
  const nav = useNavigate();
  const { reminders } = useReminders();
  const now = Date.now();
  const today = reminders.filter((r) => dayOffset(r.scheduled_at) === 0);
  const taken = today.filter((r) => r.status === 'taken').length;
  const next = reminders.find((r) => r.status === 'pending' && new Date(r.scheduled_at).getTime() > now - 3_600_000);
  const line = next
    ? t('voice.next', { time: fmtTime(next.scheduled_at), name: st(next.medicine_name), done: taken, all: today.length })
    : t('voice.none', { done: taken, all: today.length });

  useEffect(() => {
    speak(line, { force: true });
    return () => stopSpeaking();
  }, [line]);

  return (
    <main className="page flex min-h-[80dvh] flex-col gap-6">
      <TopBar back="/elder" title={t('home.voice')} />
      <div className="flex flex-col items-center gap-6 text-center">
      <ChotuBoundary>
        <ChotuAgent size={200} state="speaking" />
      </ChotuBoundary>
      <p className="m-0 text-[1.6rem] font-bold leading-snug" aria-live="polite">
        {line}
      </p>
      <button type="button" onClick={() => speak(line, { force: true })} className="app-btn app-btn--secondary pressable w-full">
        🔊 {t('voice.again')}
      </button>
      <button type="button" onClick={() => nav('/elder/checkin?call=1')} className="app-btn app-btn--primary pressable min-h-24 w-full text-[1.5rem]">
        🎤 {t('voice.talk')}
      </button>
      </div>
    </main>
  );
}
