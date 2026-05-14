import { LitElement, html, css } from 'lit';

const THUMB_SIZE = 20;

export class HueSlider extends LitElement {
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
        hsl(0 100% 50%) 0%,
        hsl(32 100% 50%) 16%,
        hsl(58 100% 50%) 32%,
        hsl(120 100% 42%) 48%,
        hsl(200 100% 50%) 64%,
        hsl(258 100% 58%) 82%,
        hsl(320 100% 52%) 100%
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
    this.value = 0;
    this.disabled = false;
    this._dragging = false;
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

  _onPointerDown(e) {
    if (this.disabled) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    this._dragging = true;
    const pct = this._getPercent(e);
    this.value = pct;
    this._emit(pct);
  }

  _onPointerMove(e) {
    if (this.disabled || !this._dragging) return;
    const pct = this._getPercent(e);
    this.value = pct;
    this._emit(pct);
  }

  _onPointerUp() {
    this._dragging = false;
  }

  _thumbLeft(pct) {
    return `calc(${pct}% - ${(pct / 100) * THUMB_SIZE}px)`;
  }

  _thumbBackground(pct) {
    return `hsl(${Math.round(pct * 3.6)}deg 100% 50%)`;
  }

  render() {
    const pct = Math.max(0, Math.min(100, this.value ?? 0));

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
          <div class="thumb" style=${`left: ${this._thumbLeft(pct)}; background: ${this._thumbBackground(pct)};`}></div>
        </div>
      </div>
    `;
  }
}

customElements.define('hue-slider', HueSlider);
