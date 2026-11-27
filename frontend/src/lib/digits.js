/* "123 456", "123-456", "۱۲۳۴۵۶" (Urdu digits), "١٢٣" (Arabic-Indic) -> ASCII digits only.
   Used by every 6-digit code box (invite code, email codes) so pasted codes keep all digits. */
export function onlyDigits(s) {
  return String(s ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '');
}
