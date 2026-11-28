import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/AuthContext';
import AccountSwitchedNotice from './components/AccountSwitchedNotice';
import { ForgotPassword, Login, Register } from './pages/Auth';
import VerifyEmail from './pages/VerifyEmail';
import Landing from './pages/Landing';
import AppWelcome from './pages/AppWelcome';
import { isAppMode } from './lib/appMode';
import { homeFor, useAuth } from './auth/AuthContext';
import DeleteAccount from './pages/DeleteAccount';
import CarerHome from './pages/carer/CarerHome';
import CheckIn from './pages/elder/CheckIn';
import ConfirmMeds from './pages/elder/ConfirmMeds';
import ElderLayout from './pages/elder/ElderLayout';
import AlternativesPage from './pages/elder/AlternativesPage';
import Emergency from './pages/elder/Emergency';
import ElderHome from './pages/elder/Home';
import Invite from './pages/elder/Invite';
import Progress from './pages/elder/Progress';
import Reminders from './pages/elder/Reminders';
import Upload from './pages/elder/Upload';
import Vitals from './pages/elder/Vitals';
import { t } from './i18n/useT';

// Charts (Recharts) only load for carers.
const Dashboard = lazy(() => import('./pages/carer/Dashboard'));

export default function App() {
  return (
    <>
      <AccountSwitchedNotice />
      <Routes>
        <Route path="/" element={<StartScreen />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route
          path="/account/verify"
          element={
            <RequireRole roles={['elder', 'family', 'doctor']}>
              <VerifyEmail />
            </RequireRole>
          }
        />

        <Route
          path="/elder"
          element={
            <RequireRole roles={['elder']}>
              <ElderLayout />
            </RequireRole>
          }
        >
          <Route index element={<ElderHome />} />
          <Route path="upload" element={<Upload />} />
          <Route path="confirm" element={<ConfirmMeds />} />
          <Route path="reminders" element={<Reminders />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="vitals" element={<Vitals />} />
          <Route path="invite" element={<Invite />} />
          <Route path="progress" element={<Progress />} />
          <Route path="emergency" element={<Emergency />} />
          <Route path="alternatives" element={<AlternativesPage />} />
        </Route>

        <Route
          path="/carer"
          element={
            <RequireRole roles={['family', 'doctor']}>
              <CarerHome />
            </RequireRole>
          }
        />
        <Route
          path="/carer/elder/:elderId"
          element={
            <RequireRole roles={['family', 'doctor']}>
              <Suspense fallback={<p className="page muted">{t('common.loading')}</p>}>
                <Dashboard />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/account/delete"
          element={
            <RequireRole roles={['elder', 'family', 'doctor']}>
              <DeleteAccount />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

/** "/" : the app gets a one-screen welcome; the website keeps its scrolling landing page. */
function StartScreen() {
  const { user, ready } = useAuth();
  if (!isAppMode()) return <Landing />;
  if (ready && user) return <Navigate to={homeFor(user.role)} replace />;
  return <AppWelcome />;
}
