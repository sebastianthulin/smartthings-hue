import { html, css } from 'lit';
import { LocalizedElement } from './localized-element.js';
import { toasts } from '../services/toasts.js';

export class AppToasts extends LocalizedElement {
  static properties = {
    _items: { state: true },
  };

  static styles = css`
    :host {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 100;
    }

    .stack {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0) + var(--space-4));
      left: 50%;
      transform: translateX(-50%);
      width: min(calc(100vw - (var(--space-4) * 2)), 460px);
      display: grid;
      gap: var(--space-3);
      pointer-events: none;
    }

    .toast {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--space-3);
      align-items: start;
      padding: var(--space-4);
      border-radius: calc(var(--radius-lg) + 4px);
      border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
      background: color-mix(in srgb, var(--color-surface) 86%, rgba(10, 14, 18, 0.88));
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.26);
      backdrop-filter: blur(16px);
      pointer-events: auto;
    }

    .toast.success {
      border-color: color-mix(in srgb, #49c16d 30%, transparent);
      background: color-mix(in srgb, #49c16d 12%, var(--color-surface));
    }

    .toast.error {
      border-color: color-mix(in srgb, #ff7a6b 32%, transparent);
      background: color-mix(in srgb, #ff7a6b 12%, var(--color-surface));
    }

    .toast.info {
      border-color: color-mix(in srgb, #5bc0ff 28%, transparent);
      background: color-mix(in srgb, #5bc0ff 12%, var(--color-surface));
    }

    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--color-text-primary);
      font-family: 'Material Symbols Outlined Variable';
      font-size: 1.15rem;
      line-height: 1;
      font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24;
      flex-shrink: 0;
    }

    .copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .title {
      color: var(--color-text-primary);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      line-height: 1.35;
    }

    .description {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      line-height: 1.5;
    }

    .dismiss {
      width: 2rem;
      height: 2rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--color-text-dim);
      cursor: pointer;
      transition: background var(--transition-base), color var(--transition-base), transform var(--transition-fast);
      -webkit-tap-highlight-color: transparent;
    }

    .dismiss:hover,
    .dismiss:focus-visible {
      background: rgba(255, 255, 255, 0.08);
      color: var(--color-text-primary);
    }

    .dismiss:active {
      transform: scale(0.96);
    }

    .dismiss-icon {
      font-family: 'Material Symbols Outlined Variable';
      font-size: 1rem;
      line-height: 1;
      font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20;
    }
  `;

  constructor() {
    super();
    this._items = toasts.items;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onChange = (event) => {
      this._items = event.detail.items;
    };
    toasts.addEventListener('change', this._onChange);
  }

  disconnectedCallback() {
    toasts.removeEventListener('change', this._onChange);
    super.disconnectedCallback();
  }

  _resolveText(item, field) {
    const key = item?.[`${field}Key`];

    if (key) {
      return this.t(key, item?.[`${field}Values`]);
    }

    return item?.[field] ?? '';
  }

  _iconForTone(tone) {
    switch (tone) {
      case 'success':
        return 'check_circle';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  }

  _dismissToast(id) {
    toasts.dismiss(id);
  }

  render() {
    if (!this._items.length) {
      return html``;
    }

    return html`
      <div class="stack" aria-live="polite" aria-atomic="false">
        ${this._items.map((item) => {
          const title = this._resolveText(item, 'title');
          const description = this._resolveText(item, 'description');
          const tone = item.tone ?? 'info';

          return html`
            <section class=${`toast ${tone}`} role=${tone === 'error' ? 'alert' : 'status'}>
              <span class="icon" aria-hidden="true">${this._iconForTone(tone)}</span>
              <div class="copy">
                ${title ? html`<span class="title">${title}</span>` : ''}
                ${description ? html`<span class="description">${description}</span>` : ''}
              </div>
              <button
                class="dismiss"
                type="button"
                @click=${() => this._dismissToast(item.id)}
                aria-label=${this.t('common.close')}
                title=${this.t('common.close')}
              >
                <span class="dismiss-icon" aria-hidden="true">close</span>
              </button>
            </section>
          `;
        })}
      </div>
    `;
  }
}

customElements.define('app-toasts', AppToasts);