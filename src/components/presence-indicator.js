import { LitElement, html, css } from 'lit';

/**
 * <presence-indicator> — ambient occupancy visualization.
 *
 * Occupancy is communicated through a soft warm glow / silhouette,
 * never through text labels or boolean states.
 */
export class PresenceIndicator extends LitElement {
  static properties = {
    occupied: { type: Boolean },
  };

  static styles = css`
    :host {
      display: block;
      width: 28px;
      height: 28px;
    }

    .wrap {
      width: 28px;
      height: 28px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* The silhouette SVG */
    .silhouette {
      width: 16px;
      height: 20px;
      position: relative;
      z-index: 1;
      opacity: 0;
      transition: opacity 600ms ease;
    }

    .silhouette.visible {
      opacity: 1;
      animation: breathe 3.5s ease-in-out infinite;
    }

    .silhouette svg {
      width: 100%;
      height: 100%;
      fill: var(--color-accent-bright);
      filter: blur(0.5px);
    }

    /* Ambient glow behind the silhouette */
    .glow {
      position: absolute;
      inset: -4px;
      border-radius: 50%;
      background: var(--color-presence-glow);
      opacity: 0;
      transition: opacity 800ms ease;
      filter: blur(4px);
    }

    .silhouette.visible ~ .glow,
    .glow.visible {
      opacity: 1;
      animation: glow-pulse 3.5s ease-in-out infinite;
    }

    @keyframes breathe {
      0%, 100% { opacity: 0.7; transform: scale(1); }
      50%       { opacity: 1;   transform: scale(1.06); }
    }

    @keyframes glow-pulse {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50%       { opacity: 1;   transform: scale(1.2); }
    }
  `;

  render() {
    return html`
      <div class="wrap">
        <div class="silhouette ${this.occupied ? 'visible' : ''}">
          <!-- Human silhouette -->
          <svg viewBox="0 0 16 20" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="4" r="3.5"/>
            <path d="M2 20c0-5 2-8 6-8s6 3 6 8H2z"/>
          </svg>
        </div>
        <div class="glow ${this.occupied ? 'visible' : ''}"></div>
      </div>
    `;
  }
}

customElements.define('presence-indicator', PresenceIndicator);
