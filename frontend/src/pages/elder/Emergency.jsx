/* "Madad ka number": the elder saves one emergency contact (name + phone) used by the Home
   "Madad" call button. PUT/DELETE /emergency-contact (elder only; validated server-side too). */
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import Icon from '../../components/Icon';
import { BigButton, ErrorText, Field, Notice, TopBar } from '../../components/ui';
import { useEmergencyContact } from '../../hooks/useElderData';
import { t } from '../../i18n/useT';

const PHONE_RE = /^\+?[0-9][0-9 -]{5,18}[0-9]$/;

export default function Emergency() {
  const { contact, setContact } = useEmergencyContact();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setPhone(contact.phone);
    }
  }, [contact]);

  const digits = phone.replace(/\D/g, '').length;
  const valid = name.trim().length > 0 && PHONE_RE.test(phone.trim()) && digits >= 7 && digits <= 15;

  const save = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const c = await api('/emergency-contact', { method: 'PUT', json: { name: name.trim(), phone: phone.trim() } });
      setContact(c);
      setMsg(t('emergency.saved'));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api('/emergency-contact', { method: 'DELETE' });
      setContact(null);
      setName('');
      setPhone('');
      setMsg(t('emergency.removed'));
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page stack">
      <TopBar back="/elder" title={t('emergency.title')} />
      <h1 className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-bg text-danger">
          <Icon name="phone" size={28} />
        </span>
        {t('emergency.title')}
      </h1>
      <p>{t('emergency.intro')}</p>

      <form className="stack" onSubmit={save} noValidate>
        <Field id="em-name" label={t('emergency.name')} hint={t('emergency.name.hint')}>
          <input
            id="em-name"
            className="input"
            value={name}
            maxLength={40}
            autoComplete="name"
            aria-describedby="em-name-hint"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field id="em-phone" label={t('emergency.phone')} hint={t('emergency.phone.hint')}>
          <input
            id="em-phone"
            className="input"
            type="tel"
            inputMode="tel"
            value={phone}
            maxLength={20}
            autoComplete="tel"
            aria-describedby="em-phone-hint"
            aria-invalid={phone.length > 0 && !valid}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <div aria-live="polite">
          {msg ? <Notice kind="success">{msg}</Notice> : null}
          <ErrorText>{err}</ErrorText>
        </div>
        <BigButton type="submit" disabled={busy || !valid}>
          {busy ? t('common.loading') : t('common.save')}
        </BigButton>
      </form>

      {contact ? (
        <BigButton variant="secondary" onClick={remove} disabled={busy}>
          {t('emergency.remove')}
        </BigButton>
      ) : null}
      <Notice kind="info">{t('emergency.note')}</Notice>
    </main>
  );
}
