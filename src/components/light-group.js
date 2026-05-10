import { html, css } from 'lit';
import { store } from '../services/store.js';
import { LocalizedElement } from './localized-element.js';
import './dimmer-slider.js';

/**
 * <light-group> — light controls inside the dedicated room detail view.
 * Shows individual lights with toggle and brightness control.
 */
export class LightGroup extends LocalizedElement {
  static properties = {
    lights: { type: Array },
    roomId: { type: String },
    _activeLightId: { state: true },
    _activeLightBrightness: { state: true },
    _lightValueVisible: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    *, *::before, *::after {
      corner-shape: var(--corner-shape);
    }

    .light-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .light-item {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .light-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }

    .light-name {
      font-size: var(--font-size-base);
      color: var(--color-text-primary);
      display: inline-flex;
      align-items: baseline;
      gap: var(--space-2);
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color var(--transition-base);
    }

    .light-name.off {
      color: var(--color-text-dim);
    }

    .light-name-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .light-value {
      flex-shrink: 0;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity var(--transition-base), transform var(--transition-base);
      pointer-events: none;
    }

    .light-value.visible {
      opacity: 1;
      transform: translateY(0);
    }

    /* Toggle pill */
    .toggle {
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

    .toggle.on {
      background: var(--color-accent);
    }

    .toggle-thumb {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      transition: transform var(--transition-base);
    }

    .toggle.on .toggle-thumb {
      transform: translateX(18px);
    }

    dimmer-slider {
      width: 100%;
    }
  `;

  constructor() {
    super();
    this._activeLightId = null;
    this._activeLightBrightness = null;
    this._lightValueVisible = false;
    this._clearLightValueTimer = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._clearLightValueTimer) {
      clearTimeout(this._clearLightValueTimer);
      this._clearLightValueTimer = null;
    }
  }

  _toggle(lightId) {
    store.toggleLight(lightId);
  }

  _onBrightnessChange(lightId, e) {
    store.setLightBrightness(lightId, e.detail.value);
  }

  _onDimmerInteraction(lightId, e) {
    if (e.detail.active) {
      if (this._clearLightValueTimer) {
        clearTimeout(this._clearLightValueTimer);
        this._clearLightValueTimer = null;
      }
      this._activeLightId = lightId;
      this._activeLightBrightness = e.detail.value;
      this._lightValueVisible = true;
      return;
    }

    this._lightValueVisible = false;
    this._clearLightValueTimer = setTimeout(() => {
      this._activeLightId = null;
      this._activeLightBrightness = null;
      this._clearLightValueTimer = null;
    }, 220);
  }

  _stopPropagation(e) {
    e.stopPropagation();
  }

  _lightValueLabel(light) {
    if (this._activeLightId === light.id && this._activeLightBrightness != null) {
      return `- ${this._activeLightBrightness}%`;
    }
    return '';
  }

  get _sortedLights() {
    return [...(this.lights ?? [])].sort((left, right) => {
      const leftHasDimmer = left.brightness != null;
      const rightHasDimmer = right.brightness != null;
      if (leftHasDimmer !== rightHasDimmer) {
        return leftHasDimmer ? -1 : 1;
      }

      return (left.name ?? '').localeCompare(right.name ?? '', undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    });
  }

  render() {
    if (!this.lights?.length) return html``;

    return html`
      <div
        class="light-list"
        @click=${this._stopPropagation}
        @pointerdown=${this._stopPropagation}
        @pointermove=${this._stopPropagation}
        @pointerup=${this._stopPropagation}
        @pointercancel=${this._stopPropagation}
      >
        ${this._sortedLights.map(light => html`
          <div class="light-item">
            <div class="light-row">
              <span class="light-name ${light.on ? '' : 'off'}">
                <span class="light-name-text">${light.name}</span>
                <span class="light-value ${this._activeLightId === light.id && this._activeLightBrightness != null && this._lightValueVisible ? 'visible' : ''}">${this._lightValueLabel(light)}</span>
              </span>
              <button
                class="toggle ${light.on ? 'on' : ''}"
                @click=${() => this._toggle(light.id)}
                aria-label=${light.on
                  ? this.t('room.turnOffLight', { name: light.name })
                  : this.t('room.turnOnLight', { name: light.name })}
              >
                <span class="toggle-thumb"></span>
              </button>
            </div>

            ${light.brightness != null ? html`
              <dimmer-slider
                .value=${light.brightness}
                ?disabled=${!light.on}
                @change=${e => this._onBrightnessChange(light.id, e)}
                @dimmer-interaction=${e => this._onDimmerInteraction(light.id, e)}
              ></dimmer-slider>
            ` : ''}
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('light-group', LightGroup);
