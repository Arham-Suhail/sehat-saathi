/* @vapi-ai/web is CommonJS (`exports.default = Vapi` + __esModule). Through a bundler's dynamic
   import(), `default` is the whole module object, so the class sits at `default.default`.
   Accept both shapes; anything else is a hard error (better than a vague "call failed"). */
export function resolveVapiClass(mod) {
  const candidates = [mod?.default, mod?.default?.default, mod?.Vapi, mod];
  const Vapi = candidates.find((c) => typeof c === 'function');
  if (!Vapi) throw new TypeError('Vapi SDK export not found');
  return Vapi;
}
