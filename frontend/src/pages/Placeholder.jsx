import { useAuth } from '../auth/AuthContext';
import { BigButton, TopBar } from '../components/ui';

export default function Placeholder({ title, back }) {
  const { logout } = useAuth();
  return (
    <main className="page stack">
      <TopBar back={back} />
      <h1>{title}</h1>
      <p className="muted">Yeh hissa abhi ban raha hai.</p>
      {!back ? (
        <BigButton variant="secondary" onClick={logout}>
          Log out
        </BigButton>
      ) : null}
    </main>
  );
}
