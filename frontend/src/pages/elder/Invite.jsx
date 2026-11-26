import { useState } from 'react';
import { api } from '../../api/client';
import { BigButton, ErrorText, Notice, TopBar, fmtDay, fmtTime } from '../../components/ui';
import { t } from '../../i18n/useT';

export default function Invite() {
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [removed, setRemoved] = useState(null);

  const make = async () => {
    setBusy(true);
    setErr(null);
    try {
      setInvite(await api('/invites', { method: 'POST' }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Audit F2: the elder can take back access at any time; it ends on the carer's next request.
  const revokeAll = async () => {
    if (!window.confirm(t('invite.revoke.confirm'))) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await api('/invites/revoke-all', { method: 'POST' });
      setInvite(null);
      setRemoved(res.removed);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page stack">
      <TopBar back="/elder" title={t('home.invite')} />
      <h1>{t('invite.title')}</h1>
      <p>{t('invite.intro')}</p>
      {invite ? (
        <section className="glass-card card--feature stack center" aria-live="polite">
          <p className="muted" style={{ margin: 0 }}>
            {t('invite.your_code')}
          </p>
          <p className="code-display" dir="ltr">
            {invite.code.slice(0, 3)} {invite.code.slice(3)}
          </p>
          <p className="muted small">
            {t('invite.valid_until', { when: `${fmtDay(invite.expires_at)} ${fmtTime(invite.expires_at)}` })}
          </p>
        </section>
      ) : null}
      <Notice kind="warning">{t('invite.trust')}</Notice>
      {removed !== null ? (
        <Notice kind="success">{t('invite.revoked', { n: removed })}</Notice>
      ) : null}
      <ErrorText>{err}</ErrorText>
      <BigButton onClick={make} disabled={busy}>
        {busy ? t('invite.making') : invite ? t('invite.new') : t('invite.make')}
      </BigButton>
      <BigButton variant="secondary" onClick={revokeAll} disabled={busy}>
        {t('invite.revoke')}
      </BigButton>
    </main>
  );
}
