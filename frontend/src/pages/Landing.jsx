import { Navigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth/AuthContext';
import { BigButton } from '../components/ui';
import { t } from '../i18n/useT';

/* Stage A landing: plain. Stage B replaces this with the typographic hero. */
export default function Landing() {
  const { user, ready } = useAuth();
  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;
  return (
    <main className="page stack" style={{ minHeight: '100dvh', display: 'grid', alignContent: 'center' }}>
      <div className="stack center">
        <h1>{t('app.name')}</h1>
        <p className="big">{t('app.tagline')}</p>
        <p className="muted">Nuskhe ki tasveer se dawaiyon ki yaad dehani, rozana hal-chaal, aur ghar walon ke liye dashboard.</p>
      </div>
      <div className="stack">
        <BigButton to="/login">{t('common.login')}</BigButton>
        <BigButton to="/register" variant="secondary">
          {t('common.register')}
        </BigButton>
      </div>
      <p className="disclaimer center">Prototype — asli mareezon ka data istemal na karein.</p>
    </main>
  );
}
