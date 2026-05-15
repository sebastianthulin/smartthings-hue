import { LitElement, html, css } from 'lit';

const THUMB_SIZE = 20;
const SEND_DEBOUNCE_MS = 40;

export class SaturationSlider extends LitElement {
  static properties = {
    value: { type: Number },
    hue: { type: Number },
    disabled: { type: Boolean, reflect: true },
    _dragging: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      --thumb-size: 20px;
    }

    .track-wrap {
      position: relative;
      height: 28px;
      display: flex;
      align-items: center;
      cursor: pointer;
      touch-action: none;
    }

    .track-wrap.disabled {
      cursor: default;
      touch-action: auto;
      opacity: 0.5;
    }

    .track {
      position: relative;
      width: 100%;
      height: 6px;
      border-radius: var(--radius-full);
      overflow: visible;
    }

    .thumb {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: var(--thumb-size);
      height: var(--thumb-size);
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.95);
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.45);
      pointer-events: none;
      transition: left 60ms ease, transform 120ms ease, background 60ms ease;
    }

    .track-wrap:active .thumb,
    .dragging .thumb {
      transform: translateY(-50%) scale(1.2);
    }
  `;

  constructor() {
    super();
    this.value = 100;
    this.hue = 0;
    this.disabled = false;
    this._dragging = false;
    this._sendTimer = null;
    this._pendingValue = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearPendingEmit();
  }

  _getPercent(e) {
    const rect = this.shadowRoot.querySelector('.track').getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  _emit(value) {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { value: Math.round(value) },
      bubbles: false,
    }));
  }

  _emitPreview(value) {
    this.dispatchEvent(new CustomEvent('preview', {
      detail: { value: Math.round(value) },
      bubbles: false,
    }));
  }

  _queueEmit(value) {
    this._pendingValue = value;
    if (this._sendTimer) {
      clearTimeout(this._sendTimer);
    }

    this._sendTimer = setTimeout(() => {
      const nextValue = this._pendingValue;
      this._clearPendingEmit();
      this._emit(nextValue);
    }, SEND_DEBOUNCE_MS);
  }

  _flushPendingEmit() {
    if (this._pendingValue == null) {
      return;
    }

    const nextValue = this._pendingValue;
    this._clearPendingEmit();
    this._emit(nextValue);
  }

  _clearPendingEmit() {
    if (this._sendTimer) {
      clearTimeout(this._sendTimer);
      this._sendTimer = null;
    }

    this._pendingValue = null;
  }

  _onPointerDown(e) {
    if (this.disabled) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    this._dragging = true;
    const pct = this._getPercent(e);
    this.value = pct;
    this._emitPreview(pct);
    this._emit(pct);
  }

  _onPointerMove(e) {
    if (this.disabled || !this._dragging) return;
    const pct = this._getPercent(e);
    this.value = pct;
    this._emitPreview(pct);
    this._queueEmit(pct);
  }

  _onPointerUp() {
    this._flushPendingEmit();
    this._dragging = false;
  }

  _thumbLeft(pct) {
    return `calc(${pct}% - ${(pct / 100) * THUMB_SIZE}px)`;
  }

  _trackBackground(hue) {
    return `linear-gradient(90deg, hsl(${Math.round(hue * 3.6)}deg 0% 92%) 0%, hsl(${Math.round(hue * 3.6)}deg 100% 50%) 100%)`;
  }

  _thumbBackground(hue, saturation) {
    return `hsl(${Math.round(hue * 3.6)}deg ${Math.round(saturation)}% 50%)`;
  }

  render() {
    const pct = Math.max(0, Math.min(100, this.value ?? 0));
    const hue = Math.max(0, Math.min(100, this.hue ?? 0));

    return html`
      <div
        class="track-wrap ${this._dragging ? 'dragging' : ''} ${this.disabled ? 'disabled' : ''}"
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        aria-disabled=${this.disabled ? 'true' : 'false'}
      >
        <div class="track" style=${`background: ${this._trackBackground(hue)};`}>
          <div class="thumb" style=${`left: ${this._thumbLeft(pct)}; background: ${this._thumbBackground(hue, pct)};`}></div>
        </div>
      </div>
    `;
  }
}

customElements.define('saturation-slider', SaturationSlider);
