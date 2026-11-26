import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { BigButton, BottomBar, Disclaimer, ErrorText, Notice, TopBar } from '../../components/ui';
import { t } from '../../i18n/useT';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // raw phone photo; we shrink it before upload
const MAX_SIDE = 1600;

/** Downscale + re-encode on the device (phone photos are often > 5 MB). Returns a JPEG Blob. */
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85),
  );
}

export default function Upload() {
  const nav = useNavigate();
  const inputRef = useRef(null);
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const onPick = async (e) => {
    setErr(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) return setErr(t('upload.too_big'));
    if (file.type && !ALLOWED.includes(file.type) && !file.type.startsWith('image/')) return setErr(t('upload.bad_type'));
    try {
      const small = await shrinkImage(file);
      if (small.size > 5 * 1024 * 1024) return setErr(t('upload.too_big'));
      setBlob(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      setErr(t('upload.bad_type'));
    }
  };

  const send = async () => {
    setBusy(true);
    setErr(null);
    try {
      const result = await api('/prescriptions/extract', {
        method: 'POST',
        body: blob,
        contentType: 'image/jpeg',
        timeoutMs: 120000,
      });
      if (!result.medicines.length) {
        setErr(t('upload.not_rx'));
        return;
      }
      nav('/elder/confirm', { state: { extraction: result } });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page--with-bar stack">
      <TopBar back="/elder" title={t('upload.title')} />
      <h1>{t('upload.title')}</h1>
      <p>{t('upload.help')}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        capture="environment"
        className="visually-hidden"
        id="rx-file"
        onChange={onPick}
      />

      {preview ? (
        <img src={preview} alt="Chuni hui nuskhe ki tasveer" className="preview-img" />
      ) : (
        <button type="button" className="dropzone" onClick={() => inputRef.current?.click()}>
          <span className="dropzone__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.3-2h5.2l1.3 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" />
              <circle cx="12" cy="12.5" r="3.4" />
            </svg>
          </span>
          <span className="dropzone__title">{t('upload.pick')}</span>
          <span className="dropzone__hint">{t('upload.dropzone.hint')}</span>
        </button>
      )}

      {busy ? <Notice>{t('upload.reading')}</Notice> : null}
      <ErrorText>{err}</ErrorText>
      <Disclaimer />

      <BottomBar>
        {preview ? (
          <>
            <BigButton onClick={send} disabled={busy}>
              {busy ? t('common.loading') : t('upload.send')}
            </BigButton>
            <BigButton variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {t('upload.change')}
            </BigButton>
          </>
        ) : (
          <BigButton variant="secondary" onClick={() => nav('/elder/confirm', { state: { manual: true } })}>
            ✍ {t('upload.manual')}
          </BigButton>
        )}
      </BottomBar>
    </main>
  );
}
