import { html, css } from 'lit';
import { LocalizedElement } from './localized-element.js';

export class TokenSetup extends LocalizedElement {
  static properties = {
    authError: { type: Boolean, attribute: 'auth-error' },
    _token:    { state: true },
    _loading:  { state: true },
    _error:    { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: var(--space-6);
      gap: var(--space-4);
    }

    *, *::before, *::after {
      corner-shape: var(--corner-shape);
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: 100%;
      max-width: 380px;
      background: var(--color-surface);
      border-radius: var(--radius-xl);
      padding: var(--space-8);
      border: 1px solid var(--color-border);
      box-sizing: border-box;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    h1 {
      margin: 0;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      letter-spacing: -0.5px;
    }

    p {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    label {
      display: block;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin: 0;
    }

    input {
      width: 100%;
      background: var(--color-surface-elevated);
      border: 1.5px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: var(--space-4) var(--space-4);
      color: var(--color-text-primary);
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      outline: none;
      transition: border-color var(--transition-base);
      margin: 0;
      box-sizing: border-box;
    }

    input:focus {
      border-color: var(--color-accent);
    }

    input::placeholder {
      color: var(--color-text-dim);
      font-family: monospace;
      font-size: var(--font-size-sm);
    }

    button {
      width: 100%;
      padding: var(--space-4);
      background: var(--color-accent);
      color: #0d0d0d;
      border: none;
      border-radius: var(--radius-md);
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: opacity var(--transition-base), transform var(--transition-fast);
      -webkit-tap-highlight-color: transparent;
    }

    button:active {
      opacity: 0.85;
      transform: scale(0.98);
    }

    button:disabled {
      opacity: 0.4;
      cursor: default;
      transform: none;
    }

    .error {
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.3);
      border-radius: var(--radius-sm);
      padding: var(--space-3) var(--space-4);
      font-size: var(--font-size-sm);
      color: #ff6b6b;
      margin: 0;
    }

    .hint {
      margin: 0;
      font-size: var(--font-size-xs);
      color: var(--color-text-dim);
      line-height: 1.6;
    }

    .hint a {
      color: var(--color-accent);
      text-decoration: none;
    }

    .preview-link {
      color: var(--color-text-dim);
      font-size: var(--font-size-xs);
      text-decoration: none;
      transition: color var(--transition-base);
    }

    .preview-link:hover,
    .preview-link:focus-visible {
      color: var(--color-text-secondary);
    }
  `;

  constructor() {
    super();
    this._token   = '';
    this._loading = false;
    this._error   = '';
  }

  updated(changed) {
    if (changed.has('authError') && this.authError) {
      this._error = this.t('tokenSetup.errors.expired');
    }
  }

  _onInput(e) {
    this._token = e.target.value;
    this._error = '';
  }

  _onKeyDown(e) {
    if (e.key === 'Enter') this._connect();
  }

  async _connect() {
    const token = this._token.trim();
    if (!token) {
      this._error = this.t('tokenSetup.errors.missing');
      return;
    }

    this._loading = true;
    this._error   = '';

    // Validate token with a quick locations call
    try {
      const testFetch = await fetch('https://api.smartthings.com/v1/locations', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (testFetch.status === 401) {
        this._error   = this.t('tokenSetup.errors.invalid');
        this._loading = false;
        return;
      }
      if (!testFetch.ok) {
        this._error   = this.t('tokenSetup.errors.connection', { status: testFetch.status });
        this._loading = false;
        return;
      }
    } catch {
      this._error   = this.t('tokenSetup.errors.unreachable');
      this._loading = false;
      return;
    }

    this._loading = false;
    this.dispatchEvent(new CustomEvent('token-set', {
      detail:  { token },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const previewHref = `${window.location.pathname}?mock=1`;

    return html`
      <div class="card">
        <h1>${this.t('tokenSetup.title')}</h1>
        <p>${this.t('tokenSetup.description')}</p>

        ${this._error ? html`<div class="error">${this._error}</div>` : ''}

        <div class="field">
          <label for="token">${this.t('tokenSetup.label')}</label>
          <input
            id="token"
            type="password"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            .value=${this._token}
            @input=${this._onInput}
            @keydown=${this._onKeyDown}
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </div>

        <button
          @click=${this._connect}
          ?disabled=${this._loading || !this._token.trim()}
        >
          ${this._loading ? this.t('tokenSetup.connecting') : this.t('tokenSetup.connect')}
        </button>

        <p class="hint">
          ${this.t('tokenSetup.hint')}
          <a href="https://account.smartthings.com/tokens" target="_blank" rel="noopener">
            ${this.t('tokenSetup.tokenUrlLabel')}
          </a>.<br/>
          ${this.t('tokenSetup.storageHint')}
        </p>
      </div>

      <a class="preview-link" href=${previewHref}>
        ${this.t('tokenSetup.preview')}
      </a>
    `;
  }
}

customElements.define('token-setup', TokenSetup);
