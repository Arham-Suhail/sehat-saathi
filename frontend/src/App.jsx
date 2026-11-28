import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/AuthContext';
import AccountSwitchedNotice from './components/AccountSwitchedNotice';
import NativeBridge from './components/NativeBridge';
import PinLock from './components/PinLock';
import { AndroidAppBanner } from './components/GetApp';
import { ForgotPassword, Login, Register } from './pages/Auth';
import AppWelcome from './pages/AppWelcome';
import { isAppMode } from './lib/appMode';
import { homeFor, useAuth } from './auth/AuthContext';
import CarerHomeApp from './pages/carer/CarerHomeApp';
import CarerLayout from './pages/carer/CarerLayout';
import ElderLayout from './pages/elder/ElderLayout';
import ElderHome from './pages/elder/Home';
import { PageSkeleton } from './components/ui';

const Landing = lazy(() => import('./pages/Landing'));
const CarerHome = lazy(() => import('./pages/carer/CarerHome'));
const Alerts = lazy(() => import('./pages/carer/Alerts'));
const CheckIn = lazy(() => import('./pages/elder/CheckIn'));
const ConfirmMeds = lazy(() => import('./pages/elder/ConfirmMeds'));
const AlternativesPage = lazy(() => import('./pages/elder/AlternativesPage'));
const Emergency = lazy(() => import('./pages/elder/Emergency'));
const Invite = lazy(() => import('./pages/elder/Invite'));
const Progress = lazy(() => import('./pages/elder/Progress'));
const More = lazy(() => import('./pages/elder/More'));
const Reminders = lazy(() => import('./pages/elder/Reminders'));
const Upload = lazy(() => import('./pages/elder/Upload'));
const Vitals = lazy(() => import('./pages/elder/Vitals'));
const Meetings = lazy(() => import('./pages/Meetings'));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
// Charts (Recharts) only load for carers.
const Dashboard = lazy(() => import('./pages/carer/Dashboard'));
const VoiceMode = lazy(() => import('./pages/elder/VoiceMode'));
const Demo = lazy(() => import('./pages/Demo'));

// Fetch the other screens' code while the phone is idle, so the first tap on a tab is instant.
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 2500));
  idle(() => {
    import('./pages/elder/Reminders');
    import('./pages/elder/CheckIn');
    import('./pages/elder/Progress');
    import('./pages/elder/More');
    import('./pages/carer/Alerts');
    import('./pages/Meetings');
    import('./pages/elder/Upload');
  });
}

export default function App() {
  return (
    <>
      <AccountSwitchedNotice />
      <AndroidAppBanner />
      <NativeBridge />
      <PinLock />
      <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<StartScreen />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/demo" element={<Demo />} />
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
          <Route path="more" element={<More />} />
          <Route path="emergency" element={<Emergency />} />
          <Route path="alternatives" element={<AlternativesPage />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="voice" element={<VoiceMode />} />
        </Route>

        <Route
          path="/carer"
          element={
            <RequireRole roles={['family', 'doctor']}>
              <CarerLayout />
            </RequireRole>
          }
        >
          <Route index element={isAppMode() ? <CarerHomeApp /> : <CarerHome />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="more" element={<More />} />
          <Route
            path="elder/:elderId"
            element={<Dashboard />}
          />
        </Route>
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
      </Suspense>
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
