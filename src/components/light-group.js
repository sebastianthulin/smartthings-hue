import { html, css } from 'lit';
import { store } from '../services/store.js';
import { LocalizedElement } from './localized-element.js';
import './dimmer-slider.js';
import './hue-slider.js';

const COLOR_PRESETS = [
  { key: 'red', hue: 0, saturation: 100 },
  { key: 'amber', hue: 10, saturation: 100 },
  { key: 'yellow', hue: 17, saturation: 100 },
  { key: 'green', hue: 33, saturation: 100 },
  { key: 'cyan', hue: 50, saturation: 100 },
  { key: 'blue', hue: 64, saturation: 100 },
  { key: 'purple', hue: 78, saturation: 100 },
  { key: 'pink', hue: 92, saturation: 100 },
];

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
    _openColorLightId: { state: true },
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

    .light-actions {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      flex-shrink: 0;
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

    .toggle:hover {
      transform: translateY(-1px);
    }

    .toggle:active {
      transform: translateY(0);
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

    .icon-action {
      appearance: none;
      -webkit-appearance: none;
      width: 34px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface-elevated);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base), color var(--transition-base), opacity var(--transition-base);
      -webkit-tap-highlight-color: transparent;
    }

    .icon-action:hover:not(:disabled) {
      transform: translateY(-1px);
      color: var(--color-text-primary);
      border-color: color-mix(in srgb, var(--color-accent) 32%, var(--color-border));
    }

    .icon-action.active {
      color: var(--color-text-primary);
      border-color: color-mix(in srgb, var(--color-accent) 42%, var(--color-border));
      background: color-mix(in srgb, var(--color-surface-elevated) 76%, rgba(255, 179, 71, 0.08));
    }

    .icon-action:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .icon-action .material-symbols {
      font-family: 'Material Symbols Outlined Variable';
      font-size: 18px;
      font-weight: normal;
      font-style: normal;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      direction: ltr;
      font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    dimmer-slider {
      width: 100%;
    }

    hue-slider {
      width: 100%;
    }

    .light-controls {
      display: grid;
      gap: var(--space-3);
    }

    .color-controls {
      --color-controls-surface: var(--color-surface-elevated);
      --color-controls-border: color-mix(in srgb, var(--color-accent) 18%, var(--color-border));
      position: relative;
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      margin-top: var(--space-2);
      border: 1px solid var(--color-controls-border);
      border-radius: var(--radius-md);
      background: var(--color-controls-surface);
    }

    .color-controls::before {
      content: '';
      position: absolute;
      top: -9px;
      right: calc(44px + var(--space-5) + 9px);
      width: 16px;
      height: 16px;
      background: var(--color-controls-surface);
      border-top: 1px solid var(--color-controls-border);
      border-left: 1px solid var(--color-controls-border);
      border-top-left-radius: 6px;
      transform: rotate(45deg);
      pointer-events: none;
      z-index: 0;
    }

    .color-controls-header {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
    }

    .color-swatch-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .color-swatch {
      appearance: none;
      -webkit-appearance: none;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      padding: 0;
      border: 2px solid transparent;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      cursor: pointer;
      transition: transform var(--transition-fast), border-color var(--transition-base), box-shadow var(--transition-base), opacity var(--transition-base);
    }

    .color-swatch:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .color-swatch.selected {
      border-color: rgba(255, 255, 255, 0.92);
      box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
    }

    .color-swatch:disabled {
      cursor: default;
      opacity: 0.4;
    }
  `;

  constructor() {
    super();
    this._activeLightId = null;
    this._activeLightBrightness = null;
    this._lightValueVisible = false;
    this._openColorLightId = null;
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

  _onColorChange(lightId, hue, saturation = 100) {
    store.setLightColor(lightId, hue, saturation);
  }

  async _toggleColorControls(lightId) {
    await this._runColorControlsTransition(() => {
      this._openColorLightId = this._openColorLightId === lightId ? null : lightId;
    });
  }

  async _runColorControlsTransition(update) {
    const startViewTransition = document.startViewTransition?.bind(document);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reducedMotion) {
      update();
      await this.updateComplete;
      return;
    }

    const transition = startViewTransition(async () => {
      update();
      await this.updateComplete;
    });

    await transition.finished;
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

  _swatchColor({ hue, saturation }) {
    return `hsl(${Math.round(hue * 3.6)}deg ${saturation}% 50%)`;
  }

  _isPresetSelected(light, preset) {
    if (!light.color) {
      return false;
    }

    return Math.abs((light.color.hue ?? 0) - preset.hue) <= 3
      && Math.abs((light.color.saturation ?? 100) - preset.saturation) <= 18;
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
              <div class="light-actions">
                ${light.color ? html`
                  <button
                    class="icon-action ${this._openColorLightId === light.id ? 'active' : ''}"
                    type="button"
                    ?disabled=${!light.on}
                    @click=${() => this._toggleColorControls(light.id)}
                    aria-label=${this._openColorLightId === light.id
                      ? this.t('room.closeLightColorControls', { name: light.name })
                      : this.t('room.openLightColorControls', { name: light.name })}
                    aria-expanded=${String(this._openColorLightId === light.id)}
                  >
                    <span class="material-symbols" aria-hidden="true">palette</span>
                  </button>
                ` : ''}
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
            </div>

            <div class="light-controls">
              ${light.color && this._openColorLightId === light.id ? html`
                <div class="color-controls">
                  <div class="color-controls-header">
                    <span>${this.t('room.lightColorControls')}</span>
                  </div>
                  <div class="color-swatch-row">
                    ${COLOR_PRESETS.map(preset => html`
                      <button
                        class="color-swatch ${this._isPresetSelected(light, preset) ? 'selected' : ''}"
                        type="button"
                        style=${`background: ${this._swatchColor(preset)};`}
                        ?disabled=${!light.on}
                        @click=${() => this._onColorChange(light.id, preset.hue, preset.saturation)}
                        aria-label=${this.t(`room.colorPreset${preset.key.charAt(0).toUpperCase()}${preset.key.slice(1)}`, { name: light.name })}
                      ></button>
                    `)}
                  </div>
                  <hue-slider
                    .value=${light.color.hue ?? 0}
                    ?disabled=${!light.on}
                    @change=${e => this._onColorChange(light.id, e.detail.value, light.color?.saturation ?? 100)}
                    aria-label=${this.t('room.adjustLightHue', { name: light.name })}
                  ></hue-slider>
                </div>
              ` : ''}

              ${light.brightness != null ? html`
                <dimmer-slider
                  .value=${light.brightness}
                  ?disabled=${!light.on}
                  @change=${e => this._onBrightnessChange(light.id, e)}
                  @dimmer-interaction=${e => this._onDimmerInteraction(light.id, e)}
                ></dimmer-slider>
              ` : ''}
            </div>
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('light-group', LightGroup);
