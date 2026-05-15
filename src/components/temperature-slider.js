import { LitElement, html, css } from 'lit';

const THUMB_SIZE = 20;
const SEND_DEBOUNCE_MS = 40;
const MIN_KELVIN = 1500;
const MAX_KELVIN = 6500;

export class TemperatureSlider extends LitElement {
  static properties = {
    value: { type: Number },
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
      background: linear-gradient(
        90deg,
        hsl(26 100% 58%) 0%,
        hsl(34 100% 62%) 22%,
        hsl(42 100% 76%) 48%,
        hsl(48 32% 92%) 72%,
        hsl(204 62% 88%) 100%
      );
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
    this.value = 2700;
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
    return Math.max(0, Math.min(1, x / rect.width));
  }

  _clampKelvin(value) {
    return Math.max(MIN_KELVIN, Math.min(MAX_KELVIN, Math.round(Number(value) || MIN_KELVIN)));
  }

  _kelvinFromPercent(percent) {
    return this._clampKelvin(MIN_KELVIN + (MAX_KELVIN - MIN_KELVIN) * percent);
  }

  _percentFromKelvin(kelvin) {
    return (this._clampKelvin(kelvin) - MIN_KELVIN) / (MAX_KELVIN - MIN_KELVIN);
  }

  _emit(type, value) {
    this.dispatchEvent(new CustomEvent(type, {
      detail: { value: this._clampKelvin(value) },
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
      this._emit('change', nextValue);
    }, SEND_DEBOUNCE_MS);
  }

  _flushPendingEmit() {
    if (this._pendingValue == null) {
      return;
    }

    const nextValue = this._pendingValue;
    this._clearPendingEmit();
    this._emit('change', nextValue);
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
    const kelvin = this._kelvinFromPercent(this._getPercent(e));
    this.value = kelvin;
    this._emit('preview', kelvin);
    this._emit('change', kelvin);
  }

  _onPointerMove(e) {
    if (this.disabled || !this._dragging) return;
    const kelvin = this._kelvinFromPercent(this._getPercent(e));
    this.value = kelvin;
    this._emit('preview', kelvin);
    this._queueEmit(kelvin);
  }

  _onPointerUp() {
    this._flushPendingEmit();
    this._dragging = false;
  }

  _thumbLeft(kelvin) {
    const percent = this._percentFromKelvin(kelvin);
    return `calc(${percent * 100}% - ${percent * THUMB_SIZE}px)`;
  }

  _thumbBackground(kelvin) {
    const percent = this._percentFromKelvin(kelvin);
    const hue = 26 + percent * 178;
    const saturation = 100 - percent * 52;
    const lightness = 58 + percent * 24;
    return `hsl(${Math.round(hue)}deg ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
  }

  render() {
    const kelvin = this._clampKelvin(this.value ?? 2700);

    return html`
      <div
        class="track-wrap ${this._dragging ? 'dragging' : ''} ${this.disabled ? 'disabled' : ''}"
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        aria-disabled=${this.disabled ? 'true' : 'false'}
      >
        <div class="track">
          <div class="thumb" style=${`left: ${this._thumbLeft(kelvin)}; background: ${this._thumbBackground(kelvin)};`}></div>
        </div>
      </div>
    `;
  }
}

customElements.define('temperature-slider', TemperatureSlider);
