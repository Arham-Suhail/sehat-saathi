/* Pakistan emergency numbers (tap to call), "send my location" on WhatsApp, and Google Maps links
   for the nearest hospital / pharmacy. Location is read only when the elder taps the button
   (permission asked then), and goes only into the WhatsApp message they send themselves. */
import { useState } from 'react';
import { t } from '../i18n/useT';
import { hapticTap } from '../lib/native';
import Icon from './Icon';

export const NUMBERS = [
  { n: '1122', key: 'rescue' },
  { n: '115', key: 'edhi' },
  { n: '15', key: 'police' },
];

const maps = (q) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
const waNumber = (phone) => {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `92${d.slice(1)}`; // Pakistani local number -> international
  return d;
};

export function EmergencyNumbers() {
  return (
    <section aria-labelledby="em-numbers">
      <h2 id="em-numbers" className="section-label">
        {t('em.numbers')}
      </h2>
      <ul className="ios-group m-0 list-none p-0">
        {NUMBERS.map((x) => (
          <li key={x.n}>
            <a href={`tel:${x.n}`} onClick={hapticTap} className="ios-row">
              <span className="row-icon row-icon--danger">
                <Icon name="phone" size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.25rem] font-bold">{t(`em.${x.key}`)}</span>
                <span className="block text-[1.05rem] text-muted" dir="ltr">
                  {x.n}
                </span>
              </span>
              <span className="text-[1.05rem] font-bold text-danger">{t('em.call')}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShareLocation({ contact }) {
  const [state, setState] = useState('idle'); // idle | busy | denied
  if (!contact?.phone) return null;
  const share = () => {
    hapticTap();
    if (!navigator.geolocation) return setState('denied');
    setState('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: la, longitude: lo } = pos.coords;
        const text = `${t('em.loc.msg')} https://maps.google.com/?q=${la.toFixed(5)},${lo.toFixed(5)}`;
        window.open(`https://wa.me/${waNumber(contact.phone)}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
        setState('idle');
      },
      () => setState('denied'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={share} disabled={state === 'busy'} className="app-btn app-btn--secondary pressable">
        <Icon name="pin" size={22} />
        {state === 'busy' ? t('common.loading') : t('em.loc', { name: contact.name })}
      </button>
      {state === 'denied' ? <p className="m-0 text-[1rem] text-danger">{t('em.loc.denied')}</p> : null}
    </div>
  );
}

export function NearbyFinder() {
  return (
    <section aria-labelledby="em-near">
      <h2 id="em-near" className="section-label">
        {t('em.near')}
      </h2>
      <div className="ios-group">
        <a href={maps('hospital near me')} target="_blank" rel="noopener noreferrer" className="ios-row">
          <span className="row-icon row-icon--danger">
            <Icon name="pin" size={22} />
          </span>
          <span className="flex-1 text-[1.2rem] font-bold">{t('em.hospital')}</span>
          <Icon name="chevron" size={20} className="text-muted rtl:-scale-x-100" />
        </a>
        <a href={maps('pharmacy near me')} target="_blank" rel="noopener noreferrer" className="ios-row">
          <span className="row-icon row-icon--accent">
            <Icon name="pill" size={22} />
          </span>
          <span className="flex-1 text-[1.2rem] font-bold">{t('em.pharmacy')}</span>
          <Icon name="chevron" size={20} className="text-muted rtl:-scale-x-100" />
        </a>
      </div>
    </section>
  );
}

/** "Order / find" links for one medicine (dawaai.pk search and a nearby pharmacy). */
export function PharmacyLinks({ name }) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://dawaai.pk/search/index?search=${encodeURIComponent(name)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="chip-ios pressable min-h-12 px-4 no-underline"
      >
        {t('med.find.online')}
      </a>
      <a href={maps('pharmacy near me')} target="_blank" rel="noopener noreferrer" className="chip-ios pressable min-h-12 px-4 no-underline">
        {t('med.find.near')}
      </a>
    </div>
  );
}

export { waNumber };
