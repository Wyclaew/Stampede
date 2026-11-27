// Turn a discovered element descriptor into a portable Playwright locator and a human label.

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const looksGenerated = (id) => /\d{3,}|^[a-f0-9-]{12,}$|^(ember|react|radix|headlessui|mui)/i.test(id);

export function playwrightLocator(el) {
  if (!el) return 'page.locator(\'body\')';
  if (el.testId) return `page.getByTestId(${q(el.testId)})`;
  if (el.elId && !looksGenerated(el.elId)) return `page.locator(${q(`#${cssEscape(el.elId)}`)})`;
  const text = stableName(el.ariaLabel || el.text || '');
  const isButton = el.tag === 'button' || el.role === 'button' || ['submit', 'button', 'reset'].includes(el.type) && el.tag === 'input';
  if (isButton && text) return `page.getByRole('button', { name: ${q(text.slice(0, 40))} }).first()`;
  if ((el.tag === 'a' || el.role === 'link') && text) return `page.getByRole('link', { name: ${q(text.slice(0, 40))} }).first()`;
  if (el.placeholder) return `page.getByPlaceholder(${q(el.placeholder)}).first()`;
  if (el.name) return `page.locator(${q(`${el.tag}[name="${el.name}"]`)}).first()`;
  if (el.ariaLabel) return `page.getByLabel(${q(el.ariaLabel)}).first()`;
  if (text) return `page.getByText(${q(text.slice(0, 40))}).first()`;
  return `page.locator(${q(el.tag)}).first()`;
}

/** Drop volatile parts of a label (counts, prices) so the locator survives the next run: "Öde ₺1.230" -> "Öde". */
export function stableName(text) {
  const cleaned = String(text).replace(/[₺$€£]?\s?\d[\d.,]*\s?[₺$€£]?/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length >= 2 ? cleaned : String(text).trim();
}

function cssEscape(s) {
  return String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

export function humanName(el) {
  if (!el) return 'sayfa';
  const text = (el.text || el.ariaLabel || el.placeholder || el.name || el.tag).trim();
  const kind =
    el.tag === 'a' ? 'linki' : el.tag === 'select' ? 'seçim kutusu' : el.editable ? 'alanı' : el.type === 'checkbox' ? 'kutucuğu' : 'butonu';
  return `‘${text.slice(0, 40)}’ ${kind}`;
}
