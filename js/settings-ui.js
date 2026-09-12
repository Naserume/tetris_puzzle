// The settings dialog: rebind any action by pressing the key you want, and
// tune the auto-shift timings. Every edit is applied and saved immediately —
// there is no "cancel", so the dialog needs no draft copy of the settings.

import {
  ACTIONS, TIMING_FIELDS, keyLabel, assignKey, unassignKey, defaultSettings,
} from './settings.js';

const MAX_KEYS_PER_ACTION = 3;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const labelOf = (id) => ACTIONS.find((a) => a.id === id)?.label ?? id;

export class SettingsPanel {
  constructor(elements, settings, hooks = {}) {
    this.els = elements;
    this.settings = settings;
    this.hooks = hooks;
    this.capture = null;

    this.onCaptureKey = this.onCaptureKey.bind(this);
    this.onCapturePointer = this.onCapturePointer.bind(this);

    this.els.open.addEventListener('click', () => this.open());
    this.els.close.addEventListener('click', () => this.close());
    this.els.done.addEventListener('click', () => this.close());
    this.els.reset.addEventListener('click', () => this.resetToDefaults());

    // Clicking the backdrop — but not the sheet itself — closes the dialog.
    this.els.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.els.root) this.close();
    });

    this.renderSliders();
    this.renderKeymap();
  }

  get isOpen() {
    return !this.els.root.hidden;
  }

  open() {
    if (this.isOpen) return;
    this.setNote('');
    this.els.root.hidden = false;
    this.hooks.onOpen?.();
  }

  close() {
    if (!this.isOpen) return;
    this.cancelCapture();
    this.els.root.hidden = true;
    this.els.open.blur();
    this.hooks.onClose?.();
  }

  setNote(text) {
    this.els.note.textContent = text;
    this.els.note.hidden = !text;
  }

  commit() {
    this.hooks.onChange?.(this.settings);
  }

  /* ---------- key bindings ---------- */

  renderKeymap() {
    const rows = ACTIONS.map(({ id, label }) => {
      const row = el('div', 'keyrow');
      row.append(el('span', 'keyrow__label', label));

      const keys = el('div', 'keyrow__keys');
      const codes = this.settings.bindings[id];

      codes.forEach((code, slot) => keys.append(this.buildKeycap(id, slot, code)));
      if (codes.length === 0) keys.append(el('span', 'keyrow__empty', '지정 안 됨'));
      if (codes.length < MAX_KEYS_PER_ACTION) {
        const add = el('button', 'keycap keycap--add', '+');
        add.type = 'button';
        add.setAttribute('aria-label', `${label} 키 추가`);
        add.addEventListener('click', () => this.beginCapture(id, -1, add));
        keys.append(add);
      }

      row.append(keys);
      return row;
    });

    this.els.keymap.replaceChildren(...rows);
  }

  buildKeycap(actionId, slot, code) {
    const wrap = el('span', 'keycap');

    const key = el('button', 'keycap__key', keyLabel(code));
    key.type = 'button';
    key.setAttribute('aria-label', `${labelOf(actionId)}: ${keyLabel(code)} 변경`);
    key.addEventListener('click', () => this.beginCapture(actionId, slot, key));

    const remove = el('button', 'keycap__x', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `${keyLabel(code)} 제거`);
    remove.addEventListener('click', () => {
      unassignKey(this.settings, actionId, slot);
      this.renderKeymap();
      this.commit();
      this.setNote(`${keyLabel(code)} 를 제거했습니다.`);
    });

    wrap.append(key, remove);
    return wrap;
  }

  // Capture mode swallows the next keypress instead of letting it reach the
  // game. A click anywhere backs out, so no key is reserved for cancelling and
  // every key — Esc included — stays bindable.
  beginCapture(actionId, slot, button) {
    this.cancelCapture();
    this.capture = { actionId, slot, button, label: button.textContent };
    button.textContent = '입력…';
    button.classList.add('is-capturing');
    this.setNote('지정할 키를 누르세요. 취소하려면 아무 곳이나 클릭하세요.');

    window.addEventListener('keydown', this.onCaptureKey, true);
    // Registered on the next tick so the click that started capture does not
    // immediately cancel it.
    setTimeout(() => {
      if (this.capture) window.addEventListener('pointerdown', this.onCapturePointer, true);
    }, 0);
  }

  cancelCapture() {
    if (!this.capture) return;
    const { button, label } = this.capture;
    button.textContent = label;
    button.classList.remove('is-capturing');
    this.capture = null;
    window.removeEventListener('keydown', this.onCaptureKey, true);
    window.removeEventListener('pointerdown', this.onCapturePointer, true);
  }

  onCaptureKey(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    const { actionId, slot } = this.capture;
    const stolenFrom = assignKey(this.settings, actionId, slot, e.code);

    this.cancelCapture();
    this.renderKeymap();
    this.commit();
    this.setNote(stolenFrom
      ? `${keyLabel(e.code)} 를 "${labelOf(stolenFrom)}" 에서 가져왔습니다.`
      : `${keyLabel(e.code)} → ${labelOf(actionId)}`);
  }

  onCapturePointer(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    this.cancelCapture();
    this.setNote('취소했습니다.');
  }

  /* ---------- timing ---------- */

  renderSliders() {
    this.sliderValues = {};

    const blocks = TIMING_FIELDS.map((field) => {
      const block = el('div', 'slider');

      const head = el('div', 'slider__head');
      head.append(el('span', 'slider__label', field.label));
      const value = el('span', 'slider__value');
      this.sliderValues[field.id] = value;
      head.append(value);

      const range = el('input', 'slider__range');
      range.type = 'range';
      range.min = field.min;
      range.max = field.max;
      range.step = field.step;
      range.value = this.settings.timing[field.id];
      range.setAttribute('aria-label', field.label);
      range.addEventListener('input', () => {
        this.settings.timing[field.id] = Number(range.value);
        this.paintSliderValue(field);
        this.commit();
      });

      block.append(head, range, el('p', 'slider__hint', field.hint));
      this.paintSliderValue(field);
      return block;
    });

    this.els.sliders.replaceChildren(...blocks);
  }

  paintSliderValue(field) {
    const ms = this.settings.timing[field.id];
    this.sliderValues[field.id].textContent = ms === 0 ? '즉시' : `${ms} ms`;
  }

  syncSliders() {
    for (const field of TIMING_FIELDS) {
      const range = this.els.sliders.querySelectorAll('.slider__range')[TIMING_FIELDS.indexOf(field)];
      if (range) range.value = this.settings.timing[field.id];
      this.paintSliderValue(field);
    }
  }

  resetToDefaults() {
    const fresh = defaultSettings();
    this.settings.bindings = fresh.bindings;
    this.settings.timing = fresh.timing;
    this.cancelCapture();
    this.renderKeymap();
    this.syncSliders();
    this.commit();
    this.setNote('기본값으로 되돌렸습니다.');
  }
}
