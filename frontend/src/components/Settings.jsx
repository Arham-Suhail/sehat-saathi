/* More -> settings that live on this phone: text size, high contrast, simple mode, Chotu speaks,
   sound, fall check, carer quiet hours; alarm reliability (battery, 10-second test alarm); privacy
   (download my data, who viewed my data) and the app version check. */
import { registerPlugin } from '@capacitor/core';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { t } from '../i18n/useT';
import { hapticSelect, isNative } from '../lib/native';
import { testAlarmIn10s } from '../lib/nativeAlarms';
import { setPref, usePrefs } from '../lib/prefs';
import { setSpeakEnabled, speak, speakEnabled } from '../lib/speak';
import { TEXT_SIZES, getTextSize, setTextSize } from '../lib/textSize';
import Segmented from './Segmented';
import { PinSetup, hasPin, setPin } from './PinLock';
import { fmtDay, fmtTime } from './ui';

const Battery = registerPlugin('Battery');
export const APP_VERSION = '3.1';

function Switch({ label, sub, checked, onChange }) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center gap-4 px-4 py-2">
      <span className="min-w-0 flex-1">
        <span className="block text-[1.2rem] font-bold leading-snug">{label}</span>
        {sub ? <span className="block text-[1rem] text-muted">{sub}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="ss-switch"
        checked={checked}
        onChange={(e) => {
          hapticSelect();
          onChange(e.target.checked);
        }}
      />
    </label>
  );
}

const Group = ({ children }) => <div className="ios-group">{children}</div>;
const Head = ({ children }) => (
  <h2 className="m-0 mb-2 mt-1 px-1 text-[1.1rem] font-bold uppercase tracking-wide text-muted">{children}</h2>
);

export function DisplaySettings({ elder }) {
  const p = usePrefs();
  const [size, setSize] = useState(getTextSize);
  const [talk, setTalk] = useState(speakEnabled);
  return (
    <section>
      <Head>{t('set.display')}</Head>
      <Group>
        <div className="flex flex-col gap-2 px-4 py-3">
          <span className="text-[1.2rem] font-bold">{t('set.textsize')}</span>
          <Segmented
            id="textsize"
            label={t('set.textsize')}
            value={size}
            onChange={(v) => {
              setSize(v);
              setTextSize(v);
            }}
            options={TEXT_SIZES.map((k) => [k, t(`set.textsize.${k}`)])}
          />
        </div>
        <Switch label={t('set.contrast')} sub={t('set.contrast.sub')} checked={p.contrast} onChange={(v) => setPref('contrast', v)} />
        {elder ? <Switch label={t('set.simple')} sub={t('set.simple.sub')} checked={p.simple} onChange={(v) => setPref('simple', v)} /> : null}
        {elder ? (
          <Switch
            label={t('set.speak')}
            sub={t('set.speak.sub')}
            checked={talk}
            onChange={(v) => {
              setTalk(v);
              setSpeakEnabled(v);
              if (v) speak(t('set.speak.sample'), { force: true });
            }}
          />
        ) : null}
        <Switch label={t('set.sound')} sub={t('set.sound.sub')} checked={p.sound} onChange={(v) => setPref('sound', v)} />
        {elder ? <Switch label={t('set.fall')} sub={t('set.fall.sub')} checked={p.fall} onChange={(v) => setPref('fall', v)} /> : null}
        {!elder ? <Switch label={t('set.quiet')} sub={t('set.quiet.sub')} checked={p.quiet} onChange={(v) => setPref('quiet', v)} /> : null}
      </Group>
    </section>
  );
}

export function AlarmSettings({ nextDose }) {
  const [battery, setBattery] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    if (!isNative()) return undefined;
    const check = () =>
      Battery.isIgnoring()
        .then((r) => setBattery(r.ignoring))
        .catch(() => setBattery(null));
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  if (!isNative()) return null;
  return (
    <section>
      <Head>{t('set.alarms')}</Head>
      <Group>
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-[1.2rem] font-bold">{t('set.battery')}</span>
            <span className="block text-[1rem] text-muted">{battery ? t('set.battery.ok') : t('set.battery.sub')}</span>
          </span>
          {battery === false ? (
            <button type="button" onClick={() => Battery.request().catch(() => {})} className="app-btn app-btn--primary app-btn--sm pressable">
              {t('set.battery.fix')}
            </button>
          ) : battery ? (
            <span className="rounded-full bg-success-bg px-3 py-1 font-bold text-success">✓</span>
          ) : null}
        </div>
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-2">
          <span className="min-w-0 flex-1">
            <span className="block text-[1.2rem] font-bold">{t('set.test')}</span>
            <span className="block text-[1rem] text-muted">{msg || t('set.test.sub')}</span>
          </span>
          <button
            type="button"
            onClick={async () => setMsg((await testAlarmIn10s(nextDose)) ? t('set.test.set') : t('native.denied'))}
            className="app-btn app-btn--secondary app-btn--sm pressable"
          >
            {t('set.test.go')}
          </button>
        </div>
      </Group>
    </section>
  );
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function PrivacySettings({ elder }) {
  const [views, setViews] = useState(null);
  const [pinOn, setPinOn] = useState(hasPin);
  const [settingPin, setSettingPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(null);
  const exportData = async () => {
    setBusy(true);
    try {
      const data = await api('/me/export');
      const text = JSON.stringify(data, null, 2);
      if (isNative()) setShown(text);
      else download('sehat-saathi-my-data.json', text);
    } catch {
      /* the button stays */
    } finally {
      setBusy(false);
    }
  };
  return (
    <section>
      <Head>{t('set.privacy')}</Head>
      {settingPin ? (
        <div className="card-ios mb-3 p-5">
          <PinSetup
            onClose={(ok) => {
              setSettingPin(false);
              setPinOn(ok || hasPin());
            }}
          />
        </div>
      ) : null}
      <Group>
        <Switch
          label={t('set.pin')}
          sub={t('set.pin.sub')}
          checked={pinOn}
          onChange={(v) => {
            if (v) setSettingPin(true);
            else {
              setPin(null);
              setPinOn(false);
            }
          }}
        />
        <button type="button" disabled={busy} onClick={exportData} className="ios-row w-full border-0 bg-transparent text-start">
          <span className="flex-1 text-[1.2rem] font-bold">{busy ? t('common.loading') : t('set.export')}</span>
        </button>
        {elder ? (
          <button
            type="button"
            onClick={() => api('/me/views').then(setViews).catch(() => setViews([]))}
            className="ios-row w-full border-0 bg-transparent text-start"
          >
            <span className="flex-1 text-[1.2rem] font-bold">{t('set.views')}</span>
          </button>
        ) : null}
      </Group>
      {views ? (
        <ul className="m-0 mt-2 list-none rounded-[20px] bg-surface p-4 text-[1.05rem]">
          {views.length === 0 ? <li className="text-muted">{t('set.views.none')}</li> : null}
          {views.slice(0, 15).map((v, i) => (
            <li key={i} className="py-1">
              <strong>{v.name}</strong> ({t(v.role === 'doctor' ? 'auth.role.doctor' : 'auth.role.family')}) · {fmtDay(v.at)} {fmtTime(v.at)}
            </li>
          ))}
        </ul>
      ) : null}
      {shown ? <textarea readOnly className="input mt-2 min-h-40 font-mono text-[0.85rem]" value={shown} aria-label={t('set.export')} /> : null}
    </section>
  );
}

export function VersionRow() {
  const [latest, setLatest] = useState(null);
  useEffect(() => {
    api('/app/version', { auth: false })
      .then((v) => setLatest(v.latest))
      .catch(() => {});
  }, []);
  const newer = latest && latest.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0;
  return (
    <p className="m-0 text-center text-[1rem] text-muted">
      {t('set.version', { v: APP_VERSION })}
      {isNative() && newer ? <span className="ms-2 font-bold text-accent">· {t('set.update', { v: latest })}</span> : null}
    </p>
  );
}
