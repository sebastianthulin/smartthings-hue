import { LitElement, html, css } from 'lit';

/**
 * <climate-summary> — displays room temperature and humidity.
 *
 * Only aggregated room-level values. Never per-device.
 */
export class ClimateSummary extends LitElement {
  static properties = {
    climate: { type: Object },
  };

  static styles = css`
    :host {
      display: inline-flex;
      min-width: 0;
    }

    .wrap {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      min-width: 0;
    }

    .metric {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-family: 'Material Symbols Outlined';
      font-size: 15px;
      font-weight: normal;
      font-style: normal;
      line-height: 1;
      letter-spacing: normal;
      text-transform: none;
      white-space: nowrap;
      word-wrap: normal;
      direction: ltr;
      font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .temp,
    .humidity {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      line-height: 1.2;
    }

    .temp {
      letter-spacing: -0.3px;
    }
  `;

  render() {
    if (!this.climate) return html``;

    const { temperature, humidity } = this.climate;
    return html`
      <div class="wrap">
        ${temperature != null
          ? html`
              <span class="temp metric">
                <span class="icon" aria-hidden="true">thermostat</span>
                <span>${temperature}°</span>
              </span>
            `
          : ''}
        ${humidity != null
          ? html`
              <span class="humidity metric">
                <span class="icon" aria-hidden="true">water_drop</span>
                <span>${humidity}%</span>
              </span>
            `
          : ''}
      </div>
    `;
  }
}

customElements.define('climate-summary', ClimateSummary);
