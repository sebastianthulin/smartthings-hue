import { LitElement, html, css } from 'lit';

/**
 * <dimmer-slider> — a touch-friendly brightness slider.
 *
 * Emits 'change' events with { value: 0–100 } during interaction.
 * Styled to feel like a real physical dimmer — warm gradient track.
 */
export class DimmerSlider extends LitElement {
  static properties = {
    value: { type: Number },
    _dragging: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    .track-wrap {
      position: relative;
      height: 28px;
      display: flex;
      align-items: center;
      cursor: pointer;
      touch-action: none;
    }

    .track {
      position: relative;
      width: 100%;
      height: 6px;
      border-radius: var(--radius-full);
      background: var(--color-surface-high);
      overflow: visible;
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

    .thumb {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
      pointer-events: none;
      transition: left 60ms ease, transform 120ms ease;
    }

    .track-wrap:active .thumb,
    .dragging .thumb {
      transform: translate(-50%, -50%) scale(1.2);
    }
  `;

  constructor() {
    super();
    this.value    = 50;
    this._dragging = false;
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

  _onPointerDown(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    this._dragging = true;
    const pct = this._getPercent(e);
    this.value = pct;
    this._emit(pct);
  }

  _onPointerMove(e) {
    if (!this._dragging) return;
    const pct = this._getPercent(e);
    this.value = pct;
    this._emit(pct);
  }

  _onPointerUp() {
    this._dragging = false;
  }

  render() {
    const pct = Math.max(0, Math.min(100, this.value ?? 0));

    return html`
      <div
        class="track-wrap ${this._dragging ? 'dragging' : ''}"
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
      >
        <div class="track">
          <div class="fill" style="width: ${pct}%"></div>
          <div class="thumb" style="left: ${pct}%"></div>
        </div>
      </div>
    `;
  }
}

customElements.define('dimmer-slider', DimmerSlider);
