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
      display: block;
    }

    .wrap {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 1px;
    }

    .temp {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      line-height: 1.2;
      letter-spacing: -0.3px;
    }

    .humidity {
      font-size: var(--font-size-sm);
      color: var(--color-text-dim);
      line-height: 1.2;
    }
  `;

  render() {
    if (!this.climate) return html``;

    const { temperature, humidity } = this.climate;
    return html`
      <div class="wrap">
        ${temperature != null
          ? html`<span class="temp">${temperature}°</span>`
          : ''}
        ${humidity != null
          ? html`<span class="humidity">${humidity}%</span>`
          : ''}
      </div>
    `;
  }
}

customElements.define('climate-summary', ClimateSummary);
