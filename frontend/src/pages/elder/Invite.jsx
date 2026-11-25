import { useState } from 'react';
import { api } from '../../api/client';
import { BigButton, ErrorText, Notice, TopBar, fmtDay, fmtTime } from '../../components/ui';

export default function Invite() {
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

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

  return (
    <main className="page stack">
      <TopBar back="/elder" title="Ghar walon ko jorein" />
      <h1>Ghar walon / doctor ko jorein</h1>
      <p>
        Code banayein aur apne ghar wale ya doctor ko batayein. Woh apne account mein yeh code daal kar aap ki dawaiyan
        aur hal-chaal dekh sakenge. Woh kuch badal nahi sakte.
      </p>
      {invite ? (
        <section className="card stack center" aria-live="polite">
          <p className="muted">Aap ka code</p>
          <p style={{ fontSize: '2.75rem', fontWeight: 700, letterSpacing: '0.2em', margin: 0 }}>
            {invite.code.slice(0, 3)} {invite.code.slice(3)}
          </p>
          <p className="muted small">
            {fmtDay(invite.expires_at)} {fmtTime(invite.expires_at)} tak chalega
          </p>
        </section>
      ) : null}
      <Notice kind="warning">Yeh code sirf apne bharosay ke logon ko dein.</Notice>
      <ErrorText>{err}</ErrorText>
      <BigButton onClick={make} disabled={busy}>
        {busy ? 'Ban raha hai…' : invite ? 'Naya code banayein' : 'Code banayein'}
      </BigButton>
    </main>
  );
}
