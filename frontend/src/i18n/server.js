/* Translate Roman Urdu text that comes from the API (error messages, medicine labels, pharmacist
   reasons) into the active UI language. Catalog: server-strings.json, an exact copy of
   shared/server-strings.json (server.test.js checks the copy; backend/tests/test_server_strings.py
   checks every server string is listed). Logic: server-core.js. */
import catalog from './server-strings.json';
import { translateServer } from './server-core';
import { getLang } from './useT';

/** Server text in the given (default: active) language. */
export function st(text, lang = getLang()) {
  return translateServer(catalog, text, lang);
}
