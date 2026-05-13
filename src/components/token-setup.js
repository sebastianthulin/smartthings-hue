import { html, css } from 'lit';
import { LocalizedElement } from './localized-element.js';

export class TokenSetup extends LocalizedElement {
  static properties = {
    authMode:     { type: String, attribute: 'auth-mode' },
    authError:    { type: Boolean, attribute: 'auth-error' },
    processing:   { type: Boolean },
    errorMessage: { state: true },
    _token:       { state: true },
    _error:       { state: true },
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
      view-transition-name: home-stage;
    }

    .intro {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin-bottom: var(--space-4);
    }

    h1 {
      margin: 0;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      letter-spacing: -0.5px;
      view-transition-name: page-title;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
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

    button:hover {
      transform: translateY(-1px);
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
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--space-3);
      align-items: start;
      background: color-mix(in srgb, #ff6b6b 14%, var(--color-surface));
      border: 1px solid color-mix(in srgb, #ff6b6b 35%, transparent);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      color: var(--color-text-primary);
      margin: 0;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .error-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 999px;
      background: color-mix(in srgb, #ff6b6b 22%, transparent);
      color: #ff8e8e;
      font-family: 'Material Symbols Outlined Variable';
      font-size: 1.15rem;
      font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24;
      line-height: 1;
      flex-shrink: 0;
    }

    .error-text {
      font-size: var(--font-size-sm);
      line-height: 1.5;
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
    this.authMode = 'oauth';
    this.processing = false;
    this.errorMessage = '';
    this._token = '';
    this._error = '';
  }

  _resolveErrorMessage(error) {
    if (!error) {
      return this.authError ? this.t('tokenSetup.errors.expired') : '';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error?.key) {
      return this.t(error.key, error.values);
    }

    if (typeof error?.message === 'string') {
      return error.message;
    }

    return this.t('tokenSetup.errors.invalid');
  }

  updated(changed) {
    if (changed.has('errorMessage')) {
      this._error = this._resolveErrorMessage(this.errorMessage);
      return;
    }

    if (changed.has('authError') && this.authError && !this.errorMessage) {
      this._error = this.t('tokenSetup.errors.expired');
    }
  }

  _onInput(e) {
    this._token = e.target.value;
    this._error = '';
  }

  _onKeyDown(e) {
    if (e.key === 'Enter') {
      this._connect();
    }
  }

  _connect() {
    this._error = '';

    if (this.authMode === 'token') {
      const token = this._token.trim();

      if (!token) {
        this._error = this.t('tokenSetup.errors.missing');
        return;
      }

      this.dispatchEvent(new CustomEvent('token-set', {
        detail: { token },
        bubbles: true,
        composed: true,
      }));
      return;
    }

    this.dispatchEvent(new CustomEvent('oauth-login-start', {
      bubbles: true,
      composed: true,
    }));
  }

  _description() {
    return this.authMode === 'token'
      ? this.t('tokenSetup.tokenDescription')
      : this.t('tokenSetup.oauthDescription');
  }

  _buttonLabel() {
    if (this.processing) {
      return this.t('tokenSetup.connecting');
    }

    return this.authMode === 'token'
      ? this.t('tokenSetup.connect')
      : this.t('tokenSetup.oauthConnect');
  }

  _hintTemplate() {
    if (this.authMode === 'token') {
      return html`
        ${this.t('tokenSetup.tokenHint')}
        <a href="https://account.smartthings.com/tokens" target="_blank" rel="noopener">
          ${this.t('tokenSetup.tokenUrlLabel')}
        </a>.<br/>
        ${this.t('tokenSetup.storageHint')}
      `;
    }

    return html`
      ${this.t('tokenSetup.oauthHint')}<br/>
      ${this.t('tokenSetup.storageHint')}
    `;
  }

  render() {
    const previewHref = `${window.location.pathname}?mock=1`;

    return html`
      <div class="card">
        <div class="intro">
          <h1>${this.t('tokenSetup.title')}</h1>
          <p>${this._description()}</p>
        </div>

        ${this._error ? html`
          <div class="error" role="alert" aria-live="polite">
            <span class="error-icon" aria-hidden="true">error</span>
            <span class="error-text">${this._error}</span>
          </div>
        ` : ''}

        ${this.authMode === 'token' ? html`
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
        ` : ''}

        <button
          @click=${this._connect}
          ?disabled=${this.processing || (this.authMode === 'token' && !this._token.trim())}
        >
          ${this._buttonLabel()}
        </button>

        <p class="hint">
          ${this._hintTemplate()}
        </p>
      </div>

      <a class="preview-link" href=${previewHref}>
        ${this.t('tokenSetup.preview')}
      </a>
    `;
  }
}

customElements.define('token-setup', TokenSetup);
