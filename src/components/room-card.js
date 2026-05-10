import { html, css } from 'lit';
import { store } from '../services/store.js';
import { LocalizedElement } from './localized-element.js';
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
    transitionName: { type: String, attribute: false },
    _activeRoomBrightness: { state: true },
    _roomValueVisible: { state: true },
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
        box-shadow var(--transition-base);
    }

    .card.lights-on {
      background: var(--color-surface-elevated);
    }

    .card.detail-view {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.24);
      overflow: hidden;
    }

    .card.detail-view.lights-on {
      background: var(--color-surface-elevated);
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
      gap: var(--space-1);
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

    .title-section {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .room-name {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      letter-spacing: -0.3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0;
    }

    .lights-on .room-name {
      color: #fff;
    }

    .presence-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-family: 'Material Symbols Outlined Variable';
      font-size: 18px;
      font-weight: normal;
      font-style: normal;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
      color: var(--color-accent);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .light-status {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-dim);
      display: inline-flex;
      align-items: baseline;
      gap: var(--space-2);
      transition: color var(--transition-base);
    }

    .light-status-text {
      min-width: 0;
    }

    .light-status-value {
      flex-shrink: 0;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity var(--transition-base), transform var(--transition-base);
    }

    .light-status-value.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .status-line {
      display: flex;
      align-items: center;
      gap: calc(var(--space-4) * 2);
      min-width: 0;
      flex-wrap: wrap;
    }

    .lights-on .light-status {
      color: var(--color-accent);
    }

    .room-controls {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      flex-shrink: 0;
    }

    .room-toggle {
      appearance: none;
      -webkit-appearance: none;
      position: relative;
      width: 44px;
      height: 26px;
      padding: 0;
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
    }
  `;

  constructor() {
    super();
    this.detailView = false;
    this.transitionName = 'none';
    this._activeRoomBrightness = null;
    this._roomValueVisible = false;
    this._clearRoomValueTimer = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._clearRoomValueTimer) {
      clearTimeout(this._clearRoomValueTimer);
      this._clearRoomValueTimer = null;
    }
  }

  updated(changed) {
    if (changed.has('transitionName')) {
      const hasSharedTransition = !!this.transitionName && this.transitionName !== 'none';
      this.style.setProperty('view-transition-name', this.transitionName || 'none');
      this.style.setProperty('border-radius', hasSharedTransition ? 'var(--radius-lg)' : '');
      this.style.setProperty('overflow', hasSharedTransition ? 'clip' : '');
      this.style.setProperty('corner-shape', hasSharedTransition ? 'var(--corner-shape)' : '');
    }
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

  _onBrightnessInteraction(e) {
    e.stopPropagation();
    if (e.detail.active) {
      if (this._clearRoomValueTimer) {
        clearTimeout(this._clearRoomValueTimer);
        this._clearRoomValueTimer = null;
      }
      this._activeRoomBrightness = e.detail.value;
      this._roomValueVisible = true;
      return;
    }

    this._roomValueVisible = false;
    this._clearRoomValueTimer = setTimeout(() => {
      this._activeRoomBrightness = null;
      this._clearRoomValueTimer = null;
    }, 220);
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

  get _roomBrightnessValue() {
    const activeBrightness = this._avgBrightness;
    if (activeBrightness != null) return activeBrightness;

    const dimmableLights = this.room?.lights.filter(light => light.brightness != null) ?? [];
    if (!dimmableLights.length) return null;
    return Math.round(dimmableLights.reduce((total, light) => total + light.brightness, 0) / dimmableLights.length);
  }

  get _statusValueLabel() {
    if (this._activeRoomBrightness != null) {
      return `- ${this._activeRoomBrightness}%`;
    }
    return '';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  render() {
    const { room } = this;
    if (!room) return html``;

    const lightsOn      = this._lightsOn;
    const roomBrightnessValue = this._roomBrightnessValue;

    return html`
      <div
        class="card ${lightsOn ? 'lights-on' : ''} ${this.detailView ? 'detail-view' : ''}"
        @click=${this._onCardClick}
      >
        <div class="glow"></div>

        <div class="main">
          <div class="top-row">
            <div class="title-section">
              <div class="room-name">${room.name}</div>
              ${room.occupied
                ? html`<span class="presence-icon" aria-label=${this.t('room.occupied')}>directions_run</span>`
                : ''}
            </div>
            <div class="room-controls">
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
              <div class="status-line">
                <div class="light-status">
                  <span class="light-status-text">${this._lightStatusText}</span>
                  <span class="light-status-value ${this._activeRoomBrightness != null && this._roomValueVisible ? 'visible' : ''}">${this._statusValueLabel}</span>
                </div>
                ${room.climate
                  ? html`<climate-summary .climate=${room.climate}></climate-summary>`
                  : ''}
              </div>
            </div>
          </div>
        </div>

        ${roomBrightnessValue != null ? html`
          <div class="dim-section">
            <dimmer-slider
              .value=${roomBrightnessValue}
              ?disabled=${!lightsOn}
              @change=${this._onBrightnessChange}
              @dimmer-interaction=${this._onBrightnessInteraction}
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
