import { LitElement, html, css } from 'lit';

const THUMB_SIZE = 20;
const SEND_DEBOUNCE_MS = 40;

/**
 * <dimmer-slider> — a touch-friendly brightness slider.
 *
 * Emits 'change' events with { value: 0–100 } during interaction.
 * Styled to feel like a real physical dimmer — warm gradient track.
 */
export class DimmerSlider extends LitElement {
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

    *, *::before, *::after {
      corner-shape: var(--corner-shape);
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
    }

    .track {
      position: relative;
      width: 100%;
      height: 6px;
      border-radius: var(--radius-full);
      background: var(--color-surface-high);
      overflow: visible;
    }

    .track-wrap.disabled .track {
      background: #2f2f2f;
    }

    .fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      border-radius: var(--radius-full);
      background: linear-gradient(
        to right,
        rgba(255, 150, 50, 0.5) 0%,
        var(--color-accent) 60%,
        var(--color-accent-bright) 100%
      );
      pointer-events: none;
      transition: width 60ms ease;
    }

    .track-wrap.disabled .fill {
      background: #6e6e6e;
    }

    .thumb {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: var(--thumb-size);
      height: var(--thumb-size);
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      transition: left 60ms ease, transform 120ms ease;
    }

    .track-wrap.disabled .thumb {
      background: #565656;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
    }

    .track-wrap:active .thumb,
    .dragging .thumb {
      transform: translateY(-50%) scale(1.2);
    }
  `;

  constructor() {
    super();
    this.value    = 50;
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
    const x    = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    return Math.max(0, Math.min(100, (x / rect.width) * 100));
  }

  _emit(value) {
    this.dispatchEvent(new CustomEvent('change', {
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

  _emitInteraction(active, value = this.value ?? 0) {
    this.dispatchEvent(new CustomEvent('dimmer-interaction', {
      detail: {
        active,
        value: Math.round(value),
      },
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
    this._emitInteraction(true, pct);
  }

  _onPointerMove(e) {
    if (this.disabled) return;
    if (!this._dragging) return;
    const pct = this._getPercent(e);
    this.value = pct;
    this._queueEmit(pct);
    this._emitInteraction(true, pct);
  }

  _onPointerUp() {
    this._flushPendingEmit();
    if (this._dragging) {
      this._emitInteraction(false);
    }
    this._dragging = false;
  }

  _thumbLeft(pct) {
    return `calc(${pct}% - ${(pct / 100) * THUMB_SIZE}px)`;
  }

  _fillWidth(pct) {
    return `calc(${pct}% + ${(1 - pct / 100) * THUMB_SIZE}px)`;
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
          <div class="fill" style=${`width: ${this._fillWidth(pct)};`}></div>
          <div class="thumb" style=${`left: ${this._thumbLeft(pct)};`}></div>
        </div>
      </div>
    `;
  }
}

customElements.define('dimmer-slider', DimmerSlider);
