import { html, css } from 'lit';
import { store } from '../services/store.js';
import { LocalizedElement } from './localized-element.js';
import './dimmer-slider.js';
import './hue-slider.js';
import './saturation-slider.js';
import './temperature-slider.js';

const LIGHT_PRESETS = [
  { key: 'coolWhite', kelvin: 4000, hue: 58, saturation: 8 },
  { key: 'warmWhite', kelvin: 2700, hue: 12, saturation: 18 },
  { key: 'warmGlow', kelvin: 2200, hue: 10, saturation: 34 },
  { key: 'candlelight', kelvin: 1780, hue: 8, saturation: 48 },
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
    _colorPreviews: { state: true },
    _temperaturePreviews: { state: true },
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

    saturation-slider {
      width: 100%;
    }

    temperature-slider {
      width: 100%;
    }

    .light-controls {
      display: grid;
      gap: var(--space-3);
    }

    .color-controls-shell {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      transition: grid-template-rows var(--transition-base), opacity var(--transition-base);
    }

    .color-controls-shell.open {
      grid-template-rows: 1fr;
      opacity: 1;
    }

    .color-controls-shell-inner {
      min-height: 0;
      overflow: hidden;
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
      opacity: 0;
      transform: translateY(-6px);
      transition: opacity var(--transition-base), transform var(--transition-base);
    }

    .color-controls-shell.open .color-controls {
      opacity: 1;
      transform: translateY(0);
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

    .color-control-group {
      display: grid;
      gap: var(--space-2);
      position: relative;
      z-index: 1;
    }

    .color-control-group-title {
      color: var(--color-text-dim);
      font-size: var(--font-size-xs, 11px);
      text-transform: uppercase;
      letter-spacing: 0.08em;
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
    this._colorPreviews = {};
    this._temperaturePreviews = {};
    this._lightValueVisible = false;
    this._openColorLightId = null;
    this._clearLightValueTimer = null;
  }

  updated(changedProperties) {
    super.updated?.(changedProperties);

    if (changedProperties.has('lights')) {
      this._pruneColorPreviews();
      this._pruneTemperaturePreviews();
    }
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
    this._setColorPreview(lightId, { hue, saturation });
    store.setLightColor(lightId, hue, saturation);
  }

  _onColorTemperatureChange(lightId, kelvin) {
    this._setTemperaturePreview(lightId, kelvin);
    store.setLightColorTemperature(lightId, kelvin);
  }

  _supportsPreset(light, preset) {
    return (light.color && preset.hue != null)
      || (light.colorTemp != null && preset.kelvin != null);
  }

  _applyPreset(light, preset) {
    if (light.color && preset.hue != null) {
      this._onColorChange(light.id, preset.hue, preset.saturation ?? 100);
    }

    if (light.colorTemp != null && preset.kelvin != null) {
      this._onColorTemperatureChange(light.id, preset.kelvin);
    }
  }

  _toggleColorControls(lightId) {
    this._openColorLightId = this._openColorLightId === lightId ? null : lightId;
  }

  _setColorPreview(lightId, patch) {
    this._colorPreviews = {
      ...this._colorPreviews,
      [lightId]: {
        ...(this._colorPreviews[lightId] ?? {}),
        ...patch,
      },
    };
  }

  _setTemperaturePreview(lightId, kelvin) {
    this._temperaturePreviews = {
      ...this._temperaturePreviews,
      [lightId]: kelvin,
    };
  }

  _pruneColorPreviews() {
    if (!Object.keys(this._colorPreviews).length) {
      return;
    }

    const nextPreviews = { ...this._colorPreviews };
    let changed = false;

    for (const [lightId, preview] of Object.entries(this._colorPreviews)) {
      const light = this.lights?.find(candidate => candidate.id === lightId);
      if (!light?.color) {
        delete nextPreviews[lightId];
        changed = true;
        continue;
      }

      const previewHue = preview.hue ?? light.color.hue ?? 0;
      const previewSaturation = preview.saturation ?? light.color.saturation ?? 100;
      const lightHue = light.color.hue ?? 0;
      const lightSaturation = light.color.saturation ?? 100;

      if (Math.abs(previewHue - lightHue) <= 0.5 && Math.abs(previewSaturation - lightSaturation) <= 0.5) {
        delete nextPreviews[lightId];
        changed = true;
      }
    }

    if (changed) {
      this._colorPreviews = nextPreviews;
    }
  }

  _pruneTemperaturePreviews() {
    if (!Object.keys(this._temperaturePreviews).length) {
      return;
    }

    const nextPreviews = { ...this._temperaturePreviews };
    let changed = false;

    for (const [lightId, previewKelvin] of Object.entries(this._temperaturePreviews)) {
      const light = this.lights?.find(candidate => candidate.id === lightId);
      if (light?.colorTemp == null) {
        delete nextPreviews[lightId];
        changed = true;
        continue;
      }

      if (Math.abs(Number(previewKelvin) - Number(light.colorTemp)) <= 8) {
        delete nextPreviews[lightId];
        changed = true;
      }
    }

    if (changed) {
      this._temperaturePreviews = nextPreviews;
    }
  }

  _getDisplayColor(light) {
    if (!light.color) {
      return null;
    }

    const preview = this._colorPreviews[light.id];
    return {
      ...light.color,
      ...preview,
    };
  }

  _getDisplayTemperature(light) {
    if (light.colorTemp == null) {
      return null;
    }

    return this._temperaturePreviews[light.id] ?? light.colorTemp;
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
    const displayColor = this._getDisplayColor(light);
    if (!displayColor) {
      return false;
    }

    return Math.abs((displayColor.hue ?? 0) - preset.hue) <= 3
      && Math.abs((displayColor.saturation ?? 100) - preset.saturation) <= 18;
  }

  _isTemperaturePresetSelected(light, preset) {
    const displayTemperature = this._getDisplayTemperature(light);
    if (displayTemperature == null) {
      return false;
    }

    return Math.abs(displayTemperature - preset.kelvin) <= 180;
  }

  _isUnifiedPresetSelected(light, preset) {
    if (!this._supportsPreset(light, preset)) {
      return false;
    }

    if (light.color && light.colorTemp != null && preset.hue != null && preset.kelvin != null) {
      return this._isPresetSelected(light, preset) && this._isTemperaturePresetSelected(light, preset);
    }

    if (light.color && preset.hue != null) {
      return this._isPresetSelected(light, preset);
    }

    if (light.colorTemp != null && preset.kelvin != null) {
      return this._isTemperaturePresetSelected(light, preset);
    }

    return false;
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
          ${(() => {
            const hasColorControls = Boolean(light.color || light.colorTemp != null);
            const showTemperatureSlider = light.colorTemp != null && !light.color;
            const displayColor = this._getDisplayColor(light);
            const displayTemperature = this._getDisplayTemperature(light);
            return html`
          <div class="light-item">
            <div class="light-row">
              <span class="light-name ${light.on ? '' : 'off'}">
                <span class="light-name-text">${light.name}</span>
                <span class="light-value ${this._activeLightId === light.id && this._activeLightBrightness != null && this._lightValueVisible ? 'visible' : ''}">${this._lightValueLabel(light)}</span>
              </span>
              <div class="light-actions">
                ${hasColorControls ? html`
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
              ${hasColorControls ? html`
                <div class="color-controls-shell ${this._openColorLightId === light.id ? 'open' : ''}" aria-hidden=${String(this._openColorLightId !== light.id)}>
                  <div class="color-controls-shell-inner">
                    <div class="color-controls">
                      <div class="color-controls-header">
                        <span>${this.t('room.lightColorControls')}</span>
                      </div>
                      <div class="color-control-group">
                        <span class="color-control-group-title">${this.t('room.lightPresetSection')}</span>
                        <div class="color-swatch-row">
                          ${LIGHT_PRESETS.filter(preset => this._supportsPreset(light, preset)).map(preset => html`
                            <button
                              class="color-swatch ${this._isUnifiedPresetSelected(light, preset) ? 'selected' : ''}"
                              type="button"
                              style=${`background: ${this._swatchColor({ hue: preset.hue ?? 10, saturation: preset.saturation ?? 0 })};`}
                              ?disabled=${!light.on || this._openColorLightId !== light.id}
                              @click=${() => this._applyPreset(light, preset)}
                              aria-label=${this.t(`room.${preset.kelvin != null ? 'temperaturePreset' : 'colorPreset'}${preset.key.charAt(0).toUpperCase()}${preset.key.slice(1)}`, { name: light.name })}
                              title=${this.t(`room.${preset.kelvin != null ? 'whitePreset' : 'colorName'}${preset.key.charAt(0).toUpperCase()}${preset.key.slice(1)}`)}
                            ></button>
                          `)}
                        </div>
                      </div>

                      ${light.color ? html`
                        <div class="color-control-group">
                          <span class="color-control-group-title">${this.t('room.lightColorSection')}</span>
                          <hue-slider
                            .value=${displayColor?.hue ?? light.color.hue ?? 0}
                            ?disabled=${!light.on || this._openColorLightId !== light.id}
                            @preview=${e => this._setColorPreview(light.id, { hue: e.detail.value })}
                            @change=${e => this._onColorChange(light.id, e.detail.value, this._getDisplayColor(light)?.saturation ?? light.color?.saturation ?? 100)}
                            aria-label=${this.t('room.adjustLightHue', { name: light.name })}
                          ></hue-slider>
                          <saturation-slider
                            .value=${displayColor?.saturation ?? light.color.saturation ?? 100}
                            .hue=${displayColor?.hue ?? light.color.hue ?? 0}
                            ?disabled=${!light.on || this._openColorLightId !== light.id}
                            @preview=${e => this._setColorPreview(light.id, { saturation: e.detail.value })}
                            @change=${e => this._onColorChange(light.id, this._getDisplayColor(light)?.hue ?? light.color?.hue ?? 0, e.detail.value)}
                            aria-label=${this.t('room.adjustLightSaturation', { name: light.name })}
                          ></saturation-slider>
                        </div>
                      ` : ''}

                      ${showTemperatureSlider ? html`
                        <div class="color-control-group">
                          <span class="color-control-group-title">${this.t('room.lightWhiteSection')}</span>
                          <temperature-slider
                            .value=${displayTemperature ?? light.colorTemp ?? 2700}
                            ?disabled=${!light.on || this._openColorLightId !== light.id}
                            @preview=${e => this._setTemperaturePreview(light.id, e.detail.value)}
                            @change=${e => this._onColorTemperatureChange(light.id, e.detail.value)}
                            aria-label=${this.t('room.adjustLightTemperature', { name: light.name })}
                          ></temperature-slider>
                        </div>
                      ` : ''}
                    </div>
                  </div>
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
            `;
          })()}
        `)}
      </div>
    `;
  }
}

customElements.define('light-group', LightGroup);
