/* "Extra alternatives": other products of the SAME salt and strength (LLM-suggested names only, always
   labelled "needs doctor verification"), listed under the medicine the elder already takes so they
   can be compared. Prices are never generated: every row has "Check price" links that open a pharmacy
   search (dawaai.pk) or a Google price search in a new tab, built by the server from fixed hosts. */
import { useState } from 'react';
import { api } from '../api/client';
import { st } from '../i18n/server';
import { t } from '../i18n/useT';
import Icon from './Icon';
import { BigButton, Disclaimer, ErrorText } from './ui';

// Defence in depth: only ever open https links on the two hosts the server uses.
const SAFE = /^https:\/\/(dawaai\.pk|www\.google\.com)\//;

// Same fixed hosts as the server (routers/alternatives.py), for answers without links.
const linksFor = (name) => {
  const q = encodeURIComponent(String(name).slice(0, 100)).replace(/%20/g, '+');
  return { dawaai: `https://dawaai.pk/search?search=${q}`, google: `https://www.google.com/search?q=${q}+price+Pakistan` };
};

/* Accept the current answer shape AND the older one ({alternatives: [names]}) from a backend that
   hasn't been redeployed yet, so a mismatch can never blank the screen. */
function normalise(d, medicine) {
  const own = `${medicine.name || ''} ${medicine.strength_text || ''}`.trim();
  const current = d?.current?.name ? d.current : { name: own };
  const raw = Array.isArray(d?.products) ? d.products : Array.isArray(d?.alternatives) ? d.alternatives : [];
  const products = raw
    .map((p) => (typeof p === 'string' ? { name: p } : p))
    .filter((p) => p && typeof p.name === 'string' && p.name.trim())
    .slice(0, 6);
  const withLinks = (p) => ({ ...p, links: p.links && SAFE.test(p.links.dawaai || '') ? p.links : linksFor(p.name) });
  return {
    label: typeof d?.label === 'string' ? d.label : 'Needs doctor verification / doctor se tasdeeq zaroori',
    disclaimer: typeof d?.disclaimer === 'string' ? d.disclaimer : undefined,
    generic_name: typeof d?.generic_name === 'string' ? d.generic_name : 'unknown',
    current: withLinks(current),
    products: products.map(withLinks),
  };
}

function PriceLinks({ links, name }) {
  const out = [
    ['dawaai', 'Dawaai.pk'],
    ['google', 'Google'],
  ].filter(([k]) => SAFE.test(links?.[k] || ''));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[1.25rem] font-bold text-muted">{t('alt.price')}:</span>
      {out.map(([k, label]) => (
        <a
          key={k}
          href={links[k]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('alt.price.aria', { name, site: label })}
          className="inline-flex min-h-12 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-[1.25rem] font-bold text-accent no-underline"
          dir="ltr"
        >
          {label}
          <Icon name="external" size={18} className="rtl:-scale-x-100" />
        </a>
      ))}
    </div>
  );
}

function Row({ product, current }) {
  return (
    <li className={`flex flex-col gap-2 rounded-2xl border p-3 ${current ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
      <p className="m-0 text-[1.25rem]">
        {current ? <span className="me-2 font-bold text-accent">{t('alt.yours')}:</span> : null}
        <strong dir="auto">{product.name}</strong>
        {product.company ? <span className="text-muted" dir="auto"> · {product.company}</span> : null}
      </p>
      <PriceLinks links={product.links} name={product.name} />
    </li>
  );
}

export default function Alternatives({ medicine }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setBusy(true);
    setErr(null);
    try {
      setData(normalise(await api(`/medicines/${medicine.id}/alternatives`, { timeoutMs: 60000 }), medicine));
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
          {busy ? t('alt.searching') : `⇄ ${t('alt.ask')}`}
        </BigButton>
        <ErrorText>{err}</ErrorText>
      </>
    );

  return (
    <div className="notice notice--warning stack" role="region" aria-label={t('alt.region', { name: medicine.name })}>
      <strong>⚠ {st(data.label)}</strong>
      <p style={{ margin: 0 }}>
        {t('alt.generic')} <strong dir="auto">{data.generic_name === 'unknown' ? t('alt.unknown') : data.generic_name}</strong>
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        <Row product={data.current} current />
        {data.products.map((p) => (
          <Row key={p.name} product={p} />
        ))}
      </ul>
      {data.products.length ? null : <p style={{ margin: 0 }}>{t('alt.none')}</p>}
      <p className="m-0 text-[1.25rem]">{t('alt.price_note')}</p>
      <Disclaimer text={data.disclaimer ? st(data.disclaimer) : undefined} />
    </div>
  );
}
