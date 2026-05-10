import { html, css } from 'lit';
import { store } from '../services/store.js';
import { LocalizedElement } from './localized-element.js';
import './presence-indicator.js';
import './climate-summary.js';
import './dimmer-slider.js';
import './light-group.js';

/**
 * <room-card> — the primary UI element.
 *
 * Interactions:
 *   tap        → open the dedicated room detail view
 *   room toggle → turn all lights in the room on/off
 *   room dimmer → adjust brightness for all lights
 */
export class RoomCard extends LocalizedElement {
  static properties = {
    room:       { type: Object },
    detailView: { type: Boolean, attribute: 'detail-view' },
    _pressing:  { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    *, *::before, *::after {
      corner-shape: var(--corner-shape);
    }

    /* ── Card ─────────────────────────────────────────────── */
    .card {
      position: relative;
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      overflow: hidden;
      touch-action: pan-y;
      user-select: none;
      -webkit-user-select: none;
      transition:
        background var(--transition-base),
        box-shadow var(--transition-base),
        transform var(--transition-fast);
      will-change: transform;
    }

    .card.lights-on {
      background: var(--color-surface-elevated);
    }

    .card.pressing {
      transform: scale(0.985);
    }

    .card.detail-view {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
      overflow: hidden;
    }

    .card.detail-view.lights-on {
      background: var(--color-surface-elevated);
      box-shadow: 0 0 0 1px rgba(255, 180, 80, 0.12),
                  0 18px 42px rgba(0, 0, 0, 0.28);
    }

    .card.detail-view.pressing {
      transform: none;
    }

    /* Warm glow overlay when lights are on */
    .glow {
      position: absolute;
      inset: 0;
      background: radial-gradient(
        ellipse at 20% 30%,
        var(--color-on-glow) 0%,
        transparent 70%
      );
      opacity: 0;
      transition: opacity var(--transition-slow);
      pointer-events: none;
    }

    .lights-on .glow {
      opacity: 1;
    }

    /* ── Main row ─────────────────────────────────────────── */
    .main {
      display: flex;
      flex-direction: column;
      padding: var(--space-5) var(--space-5) var(--space-4);
      gap: var(--space-3);
    }

    .top-row,
    .bottom-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .title-section,
    .status-section {
      flex: 1;
      min-width: 0;
    }

    .room-name {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      letter-spacing: -0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: var(--space-1);
    }

    .lights-on .room-name {
      color: #fff;
    }

    .light-status {
      font-size: var(--font-size-sm);
      color: var(--color-text-dim);
      transition: color var(--transition-base);
    }

    .lights-on .light-status {
      color: var(--color-accent);
    }

    .right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .room-controls {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .room-toggle-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-dim);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      line-height: 1;
    }

    .room-toggle {
      position: relative;
      width: 44px;
      height: 26px;
      border-radius: var(--radius-full);
      background: var(--color-surface-high);
      border: none;
      cursor: pointer;
      transition: background var(--transition-base);
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .room-toggle.on {
      background: var(--color-accent);
    }

    .room-toggle-thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-text-primary);
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      transition: transform var(--transition-base);
    }

    .room-toggle.on .room-toggle-thumb {
      transform: translateX(18px);
    }

    /* ── Expand section ───────────────────────────────────── */
    .expand-wrapper {
      overflow: hidden;
      max-height: 0;
      transition: max-height var(--transition-slow);
    }

    .expand-wrapper.open {
      max-height: 800px;
    }

    .divider {
      height: 1px;
      background: var(--color-border-subtle);
      margin: 0 var(--space-5);
    }

    .expand-content {
      padding: var(--space-4) var(--space-5) var(--space-5);
    }

    /* ── Dim track ─────────────────────────────────────────── */
    .dim-section {
      padding: 0 var(--space-5) var(--space-4);
      margin-bottom: var(--space-4);
    }
  `;

  constructor() {
    super();
    this.detailView = false;
    this._pressing  = false;
  }

  // ── Pointer / gesture handling ──────────────────────────────────────────────

  _pointerDown(e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    this._pressing = true;
  }

  _pointerUp() {
    this._pressing = false;
  }

  _pointerCancel() {
    this._pressing = false;
  }

  _onCardClick() {
    if (this.detailView || !this.room?.id) return;

    this.dispatchEvent(new CustomEvent('open-room', {
      detail: { roomId: this.room.id },
      bubbles: true,
      composed: true,
    }));
  }

  _toggleRoom(e) {
    e.stopPropagation();
    store.toggleRoom(this.room.id);
  }

  _onBrightnessChange(e) {
    e.stopPropagation();
    store.setRoomBrightness(this.room.id, e.detail.value);
  }

  _stopPropagation(e) {
    e.stopPropagation();
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get _lightsOn() {
    return this.room?.lights.some(l => l.on) ?? false;
  }

  get _lightStatusText() {
    const { lights } = this.room ?? { lights: [] };
    const on = lights.filter(l => l.on).length;
    const total = lights.length;
    if (on === 0) return total === 1 ? this.t('room.off') : this.t('room.allOff');
    if (on === total) return total === 1 ? this.t('room.on') : this.t('room.allOn');
    return this.t('room.lightsOnCount', { on, total });
  }

  get _avgBrightness() {
    const lights = this.room?.lights.filter(l => l.on && l.brightness != null) ?? [];
    if (!lights.length) return null;
    return Math.round(lights.reduce((a, l) => a + l.brightness, 0) / lights.length);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  render() {
    const { room } = this;
    if (!room) return html``;

    const lightsOn      = this._lightsOn;
    const avgBrightness = this._avgBrightness;

    return html`
      <div
        class="card ${lightsOn ? 'lights-on' : ''} ${this._pressing ? 'pressing' : ''} ${this.detailView ? 'detail-view' : ''}"
        @pointerdown=${this._pointerDown}
        @pointerup=${this._pointerUp}
        @pointercancel=${this._pointerCancel}
        @click=${this._onCardClick}
      >
        <div class="glow"></div>

        <div class="main">
          <div class="top-row">
            <div class="title-section">
              <div class="room-name">${room.name}</div>
            </div>
            <div class="room-controls">
              <div class="room-toggle-label">${this.t('room.lights')}</div>
              <button
                type="button"
                class="room-toggle ${lightsOn ? 'on' : ''}"
                @pointerdown=${e => e.stopPropagation()}
                @pointerup=${e => e.stopPropagation()}
                @click=${this._toggleRoom}
                aria-label=${lightsOn
                  ? this.t('room.turnOffRoomLights', { name: room.name })
                  : this.t('room.turnOnRoomLights', { name: room.name })}
              >
                <span class="room-toggle-thumb"></span>
              </button>
            </div>
          </div>

          <div class="bottom-row">
            <div class="status-section">
              <div class="light-status">${this._lightStatusText}</div>
            </div>
            <div class="right">
              <presence-indicator ?occupied=${room.occupied}></presence-indicator>
              ${room.climate
                ? html`<climate-summary .climate=${room.climate}></climate-summary>`
                : ''}
            </div>
          </div>
        </div>

        ${lightsOn && avgBrightness != null ? html`
          <div class="dim-section">
            <dimmer-slider
              .value=${avgBrightness}
              @change=${this._onBrightnessChange}
              @click=${this._stopPropagation}
              aria-label=${this.t('room.adjustRoomBrightness', { name: room.name })}
            ></dimmer-slider>
          </div>
        ` : ''}

        ${this.detailView ? html`
          <div class="expand-wrapper open">
            <div class="divider"></div>
            <div class="expand-content">
              <light-group .lights=${room.lights} .roomId=${room.id}></light-group>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('room-card', RoomCard);
