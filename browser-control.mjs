import { randomUUID } from 'node:crypto';

const interactiveSelector = [
  'a[href]', 'button', 'input:not([type="hidden"])', 'textarea', 'select',
  '[contenteditable="true"]', '[role="button"]', '[role="link"]',
  '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const allowedKeys = new Map([
  ['enter', 'Enter'], ['tab', 'Tab'], ['escape', 'Escape'], ['space', 'Space'],
  ['arrowup', 'ArrowUp'], ['arrowdown', 'ArrowDown'], ['arrowleft', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'], ['backspace', 'Backspace'], ['delete', 'Delete'],
  ['home', 'Home'], ['end', 'End'], ['pageup', 'PageUp'], ['pagedown', 'PageDown']
]);

const allowedModifiers = new Set(['alt', 'control', 'meta', 'shift']);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function inspectDocument(refEpoch, maxElements, selector) {
  const normalize = (value, limit = 180) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  document.querySelectorAll('[data-atlas-agent-ref]').forEach((element) => element.removeAttribute('data-atlas-agent-ref'));
  const elements = [];
  const candidates = [...document.querySelectorAll(selector)];
  for (const element of candidates) {
    if (elements.length >= maxElements) break;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    if (!visible || element.closest('[aria-hidden="true"]')) continue;
    const ref = `${refEpoch}-${elements.length + 1}`;
    element.setAttribute('data-atlas-agent-ref', ref);
    const tag = element.tagName.toLowerCase();
    const inputType = tag === 'input' ? String(element.type || 'text').toLowerCase() : '';
    const label = normalize(element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.closest('label')?.innerText || element.getAttribute('alt') || element.getAttribute('title') || element.getAttribute('placeholder'));
    const text = normalize(element.innerText || element.textContent || (inputType === 'button' || inputType === 'submit' ? element.value : ''));
    const rawValue = 'value' in element ? String(element.value || '') : '';
    const value = inputType === 'password' ? (rawValue ? '••••••••' : '') : normalize(rawValue, 120);
    elements.push({
      ref,
      tag,
      role: normalize(element.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'input' ? inputType || 'input' : tag), 40),
      name: label || text || value,
      text,
      value,
      placeholder: normalize(element.getAttribute('placeholder'), 100),
      href: tag === 'a' ? String(element.href || '').slice(0, 1000) : '',
      disabled: Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true'),
      checked: 'checked' in element ? Boolean(element.checked) : undefined,
      editable: tag === 'textarea' || tag === 'select' || element.isContentEditable || (tag === 'input' && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'color', 'range', 'date', 'time', 'datetime-local', 'month', 'week'].includes(inputType)),
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    });
  }
  return {
    title: document.title,
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY) },
    elements,
    totalCandidates: candidates.length,
    truncated: elements.length >= maxElements && candidates.length > elements.length,
    iframeCount: document.querySelectorAll('iframe').length
  };
}

function prepareTarget(ref, operation) {
  const element = document.querySelector(`[data-atlas-agent-ref="${ref}"]`);
  if (!element) return { error: 'Element reference is stale or was not found. Inspect the page again.' };
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') return { error: 'The target element is disabled.' };
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  element.focus({ preventScroll: true });
  const rect = element.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return { error: 'The target element is not visible.' };
  const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
  const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
  if (operation === 'click') {
    const topElement = document.elementFromPoint(x, y);
    if (topElement && topElement !== element && !element.contains(topElement)) {
      return { error: `The target is covered by ${topElement.tagName.toLowerCase()}${topElement.id ? `#${topElement.id}` : ''}. Inspect the page again after dismissing the overlay.` };
    }
  }
  return { x: Math.round(x), y: Math.round(y), tag: element.tagName.toLowerCase(), editable: Boolean(element.isContentEditable || ['input', 'textarea', 'select'].includes(element.tagName.toLowerCase())) };
}

function prepareTextEntry(ref, text, replace) {
  const element = document.querySelector(`[data-atlas-agent-ref="${ref}"]`);
  if (!element) return { error: 'Element reference is stale or was not found. Inspect the page again.' };
  const tag = element.tagName.toLowerCase();
  const type = tag === 'input' ? String(element.type || 'text').toLowerCase() : '';
  if (tag === 'input' && type === 'file') return { error: 'File inputs cannot be controlled by the text-entry tool.' };
  if (tag === 'input' && ['button', 'submit', 'reset', 'checkbox', 'radio', 'image', 'color', 'range', 'date', 'time', 'datetime-local', 'month', 'week'].includes(type)) return { error: 'That input type does not accept free-form text.' };
  if (tag === 'select') {
    const wanted = String(text).trim().toLowerCase();
    const option = [...element.options].find((entry) => String(entry.value).toLowerCase() === wanted || String(entry.textContent).trim().toLowerCase() === wanted);
    if (!option) return { error: 'No select option matched that value or label.' };
    element.value = option.value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { selected: option.value, completed: true };
  }
  if (!(tag === 'input' || tag === 'textarea' || element.isContentEditable)) return { error: 'The target does not accept text.' };
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  element.focus({ preventScroll: true });
  if (replace) {
    if (typeof element.select === 'function') element.select();
    else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } else if (typeof element.setSelectionRange === 'function') {
    const end = String(element.value || '').length;
    element.setSelectionRange(end, end);
  }
  return { completed: false, password: type === 'password' };
}

function readTargetValue(ref) {
  const element = document.querySelector(`[data-atlas-agent-ref="${ref}"]`);
  if (!element) return { stale: true };
  const type = element.tagName.toLowerCase() === 'input' ? String(element.type || '').toLowerCase() : '';
  const rawValue = element.isContentEditable ? element.innerText : ('value' in element ? element.value : '');
  return type === 'password' ? { hasValue: Boolean(rawValue), password: true } : { value: String(rawValue || '').slice(0, 1000) };
}

function scrollDocument(deltaX, deltaY) {
  window.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' });
  return { url: location.href, scrollX: Math.round(scrollX), scrollY: Math.round(scrollY), viewportWidth: innerWidth, viewportHeight: innerHeight, documentHeight: Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0) };
}

export class BrowserController {
  constructor(getWebContents, getBrowserWindow = () => null) {
    this.getWebContents = getWebContents;
    this.getBrowserWindow = getBrowserWindow;
    this.refEpoch = '';
  }

  #contents() {
    const contents = this.getWebContents?.();
    if (!contents || contents.isDestroyed?.()) throw new Error('No active website is available.');
    return contents;
  }

  #validRef(ref) {
    const normalized = String(ref || '');
    if (!this.refEpoch || !normalized.startsWith(`${this.refEpoch}-`) || !/^[a-z0-9-]+$/i.test(normalized)) throw new Error('Element reference is stale or invalid. Inspect the page again.');
    return normalized;
  }

  #focus(contents) {
    const window = this.getBrowserWindow?.();
    if (window && !window.isDestroyed?.()) {
      if (window.isMinimized?.()) window.restore();
      window.show?.();
      window.focus?.();
    }
    contents.focus();
  }

  async inspect({ maxElements = 80 } = {}) {
    const contents = this.#contents();
    const limit = Math.min(200, Math.max(1, Number(maxElements) || 80));
    this.refEpoch = randomUUID().replaceAll('-', '').slice(0, 12);
    return contents.executeJavaScript(`(${inspectDocument.toString()})(${JSON.stringify(this.refEpoch)}, ${limit}, ${JSON.stringify(interactiveSelector)})`, true);
  }

  async click({ ref, doubleClick = false } = {}) {
    const contents = this.#contents();
    const validRef = this.#validRef(ref);
    const target = await contents.executeJavaScript(`(${prepareTarget.toString()})(${JSON.stringify(validRef)}, 'click')`, true);
    if (target.error) throw new Error(target.error);
    this.#focus(contents);
    contents.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
    contents.sendInputEvent({ type: 'mouseDown', x: target.x, y: target.y, button: 'left', clickCount: doubleClick ? 2 : 1 });
    contents.sendInputEvent({ type: 'mouseUp', x: target.x, y: target.y, button: 'left', clickCount: doubleClick ? 2 : 1 });
    await delay(180);
    return { success: true, ref: validRef, doubleClick: Boolean(doubleClick), url: contents.getURL() };
  }

  async type({ ref, text = '', replace = true } = {}) {
    const contents = this.#contents();
    const validRef = this.#validRef(ref);
    const value = String(text);
    if (value.length > 20000) throw new Error('Text entry is limited to 20,000 characters per action.');
    const prepared = await contents.executeJavaScript(`(${prepareTextEntry.toString()})(${JSON.stringify(validRef)}, ${JSON.stringify(value)}, ${Boolean(replace)})`, true);
    if (prepared.error) throw new Error(prepared.error);
    if (!prepared.completed) {
      this.#focus(contents);
      await contents.insertText(value);
    }
    await delay(100);
    let result = { stale: true };
    try { result = await contents.executeJavaScript(`(${readTargetValue.toString()})(${JSON.stringify(validRef)})`, true); } catch {}
    return { success: true, ref: validRef, ...(prepared.selected !== undefined ? { selected: prepared.selected } : {}), ...result, url: contents.getURL() };
  }

  async pressKey({ ref = '', key, modifiers = [] } = {}) {
    const contents = this.#contents();
    const normalizedKey = allowedKeys.get(String(key || '').toLowerCase());
    if (!normalizedKey) throw new Error(`Unsupported key. Use one of: ${[...allowedKeys.values()].join(', ')}.`);
    const normalizedModifiers = [...new Set((Array.isArray(modifiers) ? modifiers : []).map((modifier) => String(modifier).toLowerCase()))];
    if (normalizedModifiers.some((modifier) => !allowedModifiers.has(modifier))) throw new Error('Unsupported key modifier.');
    if (ref) {
      const validRef = this.#validRef(ref);
      const target = await contents.executeJavaScript(`(${prepareTarget.toString()})(${JSON.stringify(validRef)}, 'focus')`, true);
      if (target.error) throw new Error(target.error);
    }
    this.#focus(contents);
    contents.sendInputEvent({ type: 'keyDown', keyCode: normalizedKey, modifiers: normalizedModifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode: normalizedKey, modifiers: normalizedModifiers });
    await delay(180);
    return { success: true, key: normalizedKey, modifiers: normalizedModifiers, url: contents.getURL() };
  }

  async scroll({ deltaX = 0, deltaY = 600 } = {}) {
    const contents = this.#contents();
    const x = Math.min(5000, Math.max(-5000, Number(deltaX) || 0));
    const y = Math.min(5000, Math.max(-5000, Number(deltaY) || 0));
    return contents.executeJavaScript(`(${scrollDocument.toString()})(${x}, ${y})`, true);
  }
}

export const browserControlInternals = { allowedKeys, inspectDocument, prepareTarget, prepareTextEntry, readTargetValue, scrollDocument };
