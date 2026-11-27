// Chaotic-but-realistic input corpus. Things impatient humans (and their cats) really type.
// Never include literal "undefined"/"NaN"/"null" here: the garbage-text detector looks for those.

export const XSS_MARKER = 'RG_XSS_7731';
// Empty src fires onerror without any network request (so the probe never causes a 404 of its own).
export const XSS_PAYLOAD = `"><img src onerror="console.log('${XSS_MARKER}')">`;

const TEXT = [
  '',
  '   ',
  '🔥👻💥🚀',
  'İıĞğŞşÇçÖöÜü',
  'مرحبا بالعالم',
  "O'Brien \"quoted\"",
  "' OR '1'='1",
  XSS_PAYLOAD,
  'A'.repeat(320),
  '%00%%25\\',
  'çok sabırsız kullanıcı!!!',
  '​​​',
  '-1',
];

const NUMBER = ['-1', '0', '99999999999999', '1e309', '3.14159265358979', 'abc', '١٢٣', '--5', ''];
const EMAIL = ['a@b', '@@', 'ü@ğ.com', 'test@example..com', ' spaced @mail.com ', 'x'.repeat(80) + '@mail.com', ''];
const TEL = ['+90 (555) 000 00 00', 'abc', '0'.repeat(30), '-1', ''];
const DATE = ['0000-01-01', '9999-12-31', '2024-02-30', ''];
const URL_IN = ['javascript:alert(1)', 'http://', 'ftp://x', 'not a url', ''];

export function pickChaosInput(field, rng) {
  const type = (field.type || 'text').toLowerCase();
  let pool = TEXT;
  if (type === 'number' || field.inputMode === 'numeric') pool = NUMBER;
  else if (type === 'email') pool = EMAIL;
  else if (type === 'tel') pool = TEL;
  else if (type === 'date' || type === 'datetime-local' || type === 'month') pool = DATE;
  else if (type === 'url') pool = URL_IN;
  return rng.pick(pool);
}

export function describeInput(value) {
  if (value === '') return 'boş değer';
  if (!value.trim()) return 'sadece boşluk';
  if (value.length > 100) return `${value.length} karakterlik uzun metin`;
  if (value.includes(XSS_MARKER)) return 'XSS denemesi';
  return `"${value}"`;
}
