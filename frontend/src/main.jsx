import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter/index.css';
// Urdu (Nastaliq, the iOS Urdu font). Only the Arabic-script subset: it downloads only when Urdu is shown.
import '@fontsource/noto-nastaliq-urdu/arabic-400.css';
import '@fontsource/noto-nastaliq-urdu/arabic-700.css';
import './styles/index.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { LangProvider } from './i18n/LangProvider';
import { applyLang, getLang } from './i18n/useT';
import { applyAppMode } from './lib/appMode';
import { applyTheme, watchSystemTheme } from './lib/theme';
import { handOverSplash, setupNativeChrome } from './lib/native';
import { applyTextSize } from './lib/textSize';
import { applyPrefs } from './lib/prefs';

applyLang(getLang()); // set <html lang dir> before the first paint
applyTheme(); // light / dark, before the first paint (no flash)
watchSystemTheme();
applyPrefs(); // high contrast
applyTextSize(); // Normal / Large / Extra large (More)
applyAppMode(); // html.is-app inside the Android app / installed PWA
setupNativeChrome(); // Android app: status bar follows light/dark

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

handOverSplash(); // Android: hide the splash after the first real frame (fallback timer inside)
