import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/400-italic.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/anton/400.css';
import '@fontsource/yellowtail/400.css';
// Urdu (Nastaliq, the iOS Urdu font). Only the Arabic-script subset: it downloads only when Urdu is shown.
import '@fontsource/noto-nastaliq-urdu/arabic-400.css';
import '@fontsource/noto-nastaliq-urdu/arabic-700.css';
import './styles/index.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { LangProvider } from './i18n/LangProvider';
import { applyLang, getLang } from './i18n/useT';

applyLang(getLang()); // set <html lang dir> before the first paint

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
