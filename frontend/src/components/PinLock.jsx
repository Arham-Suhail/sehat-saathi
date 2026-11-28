/* Optional 4-digit app lock (More -> App lock) for health data on a shared phone. Only a salted
   SHA-256 of the PIN is kept on this phone. Asked when the app opens and after 5 minutes in the
   background. Native alarms and their Taken / Not taken buttons keep working while locked.
   Forgot the PIN? "Log out" clears it (the account itself is safe). */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n/useT';
import { hapticTap, hapticWarning } from '../lib/native';

const KEY = 'ss_pin';
const AWAY_MS = 5 * 60_000;

async function hash(pin) {
  const salt = 'sehat-saathi-pin';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export const hasPin = () => {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
};
export async function setPin(pin) {
  if (pin) localStorage.setItem(KEY, await hash(pin));
  else localStorage.removeItem(KEY);
}

function Keypad({ title, onDone, error, footer }) {
  const [v, setV] = useState('');
  useEffect(() => {
    if (v.length === 4) {
      onDone(v);
      setV('');
    }
  }, [v, onDone]);
  const press = (d) => {
    hapticTap();
    setV((x) => (d === 'del' ? x.slice(0, -1) : (x + d).slice(0, 4)));
  };
  return (
    <div className="flex flex-col items-center gap-5">
      <h2 className="m-0 text-[1.6rem] font-bold">{title}</h2>
      <div className="flex gap-4" aria-label={t('pin.entered', { n: v.length })}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-5 w-5 rounded-full border-2 border-accent ${i < v.length ? 'bg-accent' : ''}`} />
        ))}
      </div>
      {error ? <p className="m-0 text-[1.1rem] font-semibold text-danger">{error}</p> : null}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((d, i) =>
          d ? (
            <button
              key={i}
              type="button"
              onClick={() => press(d)}
              aria-label={d === 'del' ? t('pin.delete') : d}
              className="pressable h-20 w-20 rounded-full border-0 bg-surface text-[1.8rem] font-semibold shadow-soft"
            >
              {d === 'del' ? '⌫' : d}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      {footer}
    </div>
  );
}

export function PinSetup({ onClose }) {
  const [first, setFirst] = useState(null);
  const [err, setErr] = useState(null);
  return (
    <Keypad
      title={first ? t('pin.again') : t('pin.new')}
      error={err}
      onDone={async (p) => {
        if (!first) return setFirst(p);
        if (p !== first) {
          hapticWarning();
          setFirst(null);
          return setErr(t('pin.mismatch'));
        }
        await setPin(p);
        onClose(true);
      }}
      footer={
        <button type="button" onClick={() => onClose(false)} className="sheet__close">
          {t('carerapp.cancel')}
        </button>
      }
    />
  );
}

export default function PinLock() {
  const { user, logout } = useAuth();
  const [locked, setLocked] = useState(() => hasPin());
  const [err, setErr] = useState(null);
  useEffect(() => {
    let hiddenAt = 0;
    const on = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hasPin() && hiddenAt && Date.now() - hiddenAt > AWAY_MS) setLocked(true);
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  if (!locked || !user || !hasPin()) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={t('pin.title')} className="fixed inset-0 z-[100] flex items-center justify-center bg-bg p-6">
      <Keypad
        title={t('pin.title')}
        error={err}
        onDone={async (p) => {
          if ((await hash(p)) === localStorage.getItem(KEY)) {
            setErr(null);
            setLocked(false);
          } else {
            hapticWarning();
            setErr(t('pin.wrong'));
          }
        }}
        footer={
          <button
            type="button"
            onClick={() => {
              setPin(null);
              setLocked(false);
              logout();
            }}
            className="sheet__close"
          >
            {t('pin.forgot')}
          </button>
        }
      />
    </div>
  );
}
