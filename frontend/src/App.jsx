import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/AuthContext';
import { ServerWakingBanner } from './components/ui';
import { Login, Register } from './pages/Auth';
import Landing from './pages/Landing';
import Placeholder from './pages/Placeholder';
import ConfirmMeds from './pages/elder/ConfirmMeds';
import ElderLayout from './pages/elder/ElderLayout';
import ElderHome from './pages/elder/Home';
import Reminders from './pages/elder/Reminders';
import Upload from './pages/elder/Upload';

export default function App() {
  return (
    <>
      <ServerWakingBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

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
          <Route path="checkin" element={<Placeholder title="Hal-chaal" back="/elder" />} />
          <Route path="vitals" element={<Placeholder title="BP / Sugar" back="/elder" />} />
          <Route path="invite" element={<Placeholder title="Ghar walon ko jorein" back="/elder" />} />
        </Route>

        <Route
          path="/carer/*"
          element={
            <RequireRole roles={['family', 'doctor']}>
              <Placeholder title="Dashboard" />
            </RequireRole>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
