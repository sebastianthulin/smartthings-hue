import { LitElement, html, css } from 'lit';
import { store } from '../services/store.js';
import './presence-indicator.js';
import './climate-summary.js';
import './light-group.js';

/**
 * <room-card> — the primary UI element.
 *
 * Interactions:
 *   tap        → toggle all lights in the room
 *   long press → expand room detail with individual light controls
 *   swipe left/right → dim / brighten all lights
 */
export class RoomCard extends LitElement {
  static properties = {
    room:      { type: Object },
    _expanded: { state: true },
    _pressing: { state: true },
    _swipeDx:  { state: true },
  };

  static styles = css`
    :host {
      display: block;
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
      cursor: pointer;
      will-change: transform;
    }

    .card.lights-on {
      background: var(--color-surface-elevated);
      box-shadow: 0 0 0 1px rgba(255, 180, 80, 0.12),
                  0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .card.pressing {
      transform: scale(0.985);
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
      align-items: flex-start;
      justify-content: space-between;
      padding: var(--space-5) var(--space-5) var(--space-4);
      gap: var(--space-4);
    }

    .left {
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

    /* ── Swipe track ──────────────────────────────────────── */
    .swipe-hint {
      height: 2px;
      background: var(--color-border);
      border-radius: 1px;
      margin: 0 var(--space-5);
      position: relative;
      overflow: hidden;
    }

    .swipe-track {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: var(--color-accent);
      border-radius: 1px;
      transition: width var(--transition-fast);
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
      margin-bottom: var(--space-4);
    }

    .dim-label {
      font-size: var(--font-size-xs);
      color: var(--color-text-dim);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: var(--space-2);
    }
  `;

  constructor() {
    super();
    this._expanded  = false;
    this._pressing  = false;
    this._swipeDx   = 0;
    this._pressTimer = null;
    this._swipeStartX = null;
    this._swipeStartBrightness = null;
    this._swiping = false;
  }

  // ── Pointer / gesture handling ──────────────────────────────────────────────

  _pointerDown(e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    this._pressing     = true;
    this._swipeStartX  = e.clientX;
    this._swiping      = false;
    this._swipeDx      = 0;

    const room = this.room;
    const avgBrightness = room.lights.filter(l => l.on && l.brightness != null).length > 0
      ? room.lights.filter(l => l.on).reduce((a, l) => a + (l.brightness ?? 100), 0)
        / room.lights.filter(l => l.on).length
      : (room.lights.some(l => l.on) ? 100 : 0);
    this._swipeStartBrightness = avgBrightness;

    this._pressTimer = setTimeout(() => {
      if (!this._swiping) {
        this._expanded = !this._expanded;
        this._pressing = false;
        navigator.vibrate?.(8);
      }
    }, 450);

    e.currentTarget.setPointerCapture(e.pointerId);
  }

  _pointerMove(e) {
    if (this._swipeStartX === null) return;
    const dx = e.clientX - this._swipeStartX;

    if (Math.abs(dx) > 8) {
      this._swiping = true;
      clearTimeout(this._pressTimer);
      this._pressing = false;

      // Map swipe to brightness change (±60 px = ±60% brightness)
      const room = this.room;
      const anyHasBrightness = room.lights.some(l => l.brightness != null);
      if (anyHasBrightness) {
        const newBrightness = Math.max(0, Math.min(100,
          (this._swipeStartBrightness ?? 50) + dx * 0.8
        ));
        this._swipeDx = newBrightness;
        store.setRoomBrightness(room.id, Math.round(newBrightness));
      }
    }
  }

  _pointerUp(e) {
    clearTimeout(this._pressTimer);
    const wasSwiping = this._swiping;
    this._pressing      = false;
    this._swiping       = false;
    this._swipeStartX   = null;

    if (!wasSwiping && !this._expandedThisPress) {
      store.toggleRoom(this.room.id);
    }
    this._expandedThisPress = false;
  }

  _pointerCancel() {
    clearTimeout(this._pressTimer);
    this._pressing    = false;
    this._swiping     = false;
    this._swipeStartX = null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get _lightsOn() {
    return this.room?.lights.some(l => l.on) ?? false;
  }

  get _lightStatusText() {
    const { lights } = this.room ?? { lights: [] };
    const on = lights.filter(l => l.on).length;
    const total = lights.length;
    if (on === 0) return total === 1 ? 'Off' : `All off`;
    if (on === total) return total === 1 ? 'On' : `All on`;
    return `${on} of ${total} on`;
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

    const lightsOn     = this._lightsOn;
    const avgBrightness = this._avgBrightness;

    return html`
      <div
        class="card ${lightsOn ? 'lights-on' : ''} ${this._pressing ? 'pressing' : ''}"
        @pointerdown=${this._pointerDown}
        @pointermove=${this._pointerMove}
        @pointerup=${this._pointerUp}
        @pointercancel=${this._pointerCancel}
      >
        <div class="glow"></div>

        <div class="main">
          <div class="left">
            <div class="room-name">${room.name}</div>
            <div class="light-status">${this._lightStatusText}</div>
          </div>
          <div class="right">
            <presence-indicator ?occupied=${room.occupied}></presence-indicator>
            ${room.climate
              ? html`<climate-summary .climate=${room.climate}></climate-summary>`
              : ''}
          </div>
        </div>

        ${lightsOn && avgBrightness != null ? html`
          <div class="swipe-hint">
            <div class="swipe-track" style="width: ${avgBrightness}%"></div>
          </div>
        ` : ''}

        <div class="expand-wrapper ${this._expanded ? 'open' : ''}">
          <div class="divider"></div>
          <div class="expand-content">
            <light-group .lights=${room.lights} .roomId=${room.id}></light-group>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('room-card', RoomCard);
