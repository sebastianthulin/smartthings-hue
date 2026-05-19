import { html, css } from 'lit';
import { LocalizedElement } from './localized-element.js';
import { toasts } from '../services/toasts.ts';

const IOS_INSTALL_HINT_DISMISSED_KEY = 'smarthue:ios-install-hint-dismissed';
const IOS_INSTALL_TOAST_ID = 'ios-install-hint';

function isIosSafariInstallable() {
  const userAgent = window.navigator.userAgent ?? '';
  const isIos = /iPhone|iPad|iPod/i.test(userAgent);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;
  const isSafari = /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS/i.test(userAgent);

  return isIos && isSafari && !isStandalone;
}

function readInstallHintDismissed() {
  try {
    return localStorage.getItem(IOS_INSTALL_HINT_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeInstallHintDismissed() {
  try {
    localStorage.setItem(IOS_INSTALL_HINT_DISMISSED_KEY, '1');
  } catch {
    // Ignore browsers that block localStorage.
  }
}

export class TokenSetup extends LocalizedElement {
  static properties = {
    authMode:     { type: String, attribute: 'auth-mode' },
    authError:    { type: Boolean, attribute: 'auth-error' },
    processing:   { type: Boolean },
    pendingMode:  { type: String, attribute: 'pending-mode' },
    errorMessage: { state: true },
    _token:       { state: true },
    _error:       { state: true },
    _errorDetail: { state: true },
    _showErrorDetail: { state: true },
  };

  static styles = css`
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      padding: var(--space-6);
      gap: var(--space-4);
      overflow: hidden;
      isolation: isolate;
    }

    :host::before,
    :host::after {
      content: '';
      position: absolute;
      inset: auto;
      width: 46vh;
      height: 46vh;
      border-radius: 999px;
      filter: blur(48px);
      opacity: 0.2;
      z-index: -1;
      pointer-events: none;
    }

    :host::before {
      top: -16vh;
      left: -12vh;
      background: color-mix(in srgb, var(--color-accent) 60%, transparent);
    }

    :host::after {
      right: -18vh;
      bottom: -16vh;
      background: color-mix(in srgb, #5bc0ff 50%, transparent);
    }

    *, *::before, *::after {
      corner-shape: var(--corner-shape);
    }

    .card {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      width: 100%;
      max-width: 430px;
      background: color-mix(in srgb, var(--color-surface) 88%, rgba(255, 255, 255, 0.02));
      border-radius: calc(var(--radius-xl) + 8px);
      padding: var(--space-8);
      border: 1px solid var(--color-border);
      box-sizing: border-box;
      view-transition-name: home-stage;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.24);
      backdrop-filter: blur(18px);
    }

    .intro {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 2.45rem);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      line-height: 1.02;
      letter-spacing: -0.05em;
      view-transition-name: page-title;
    }

    .field {
      display: flex;
      flex-direction: column;
      line-height: 1.6;
    }

    .status-card {
      display: grid;
      gap: var(--space-4);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, #5bc0ff 10%, var(--color-surface));
      border: 1px solid color-mix(in srgb, #5bc0ff 24%, transparent);
    }

    .status-card.is-processing {
      background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface));
      border-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
    }

    .status-copy {
      display: grid;
      gap: var(--space-1);
    }

    .status-title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .status-description {
      color: var(--color-text-secondary);
      font-size: var(--font-size-sm);
      line-height: 1.55;
    }
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
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
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

    .button-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      height: 1.25rem;
      font-family: 'Material Symbols Outlined Variable';
      font-size: 1.1rem;
      line-height: 1;
      font-variation-settings: 'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 20;
    }

    .button-icon.spinning {
      animation: spin 1s linear infinite;
    }

    .secondary-button {
      background: transparent;
      color: var(--color-text-primary);
      border: 1px solid color-mix(in srgb, var(--color-border) 80%, transparent);
      justify-content: center;
    }

    .secondary-button:hover,
    .secondary-button:focus-visible {
      background: color-mix(in srgb, var(--color-surface-elevated) 92%, transparent);
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

    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }

    .error {
      display: grid;
      grid-template-columns: auto 1fr auto;
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

    .error-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
      padding: 0;
      transition: background var(--transition-base), transform var(--transition-fast);
      -webkit-tap-highlight-color: transparent;
    }

    .error-toggle:hover,
    .error-toggle:focus-visible {
      background: rgba(255, 255, 255, 0.06);
      color: var(--color-text-primary);
    }

    .error-toggle:active {
      transform: scale(0.96);
    }

    .error-toggle-icon {
      font-family: 'Material Symbols Outlined Variable';
      font-size: var(--font-size-sm);
      font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 20;
      line-height: 1;
    }

    .error-detail {
      grid-column: 2 / -1;
      margin-top: var(--space-1);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: rgba(0, 0, 0, 0.16);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .error-detail-label {
      display: block;
      margin-bottom: var(--space-2);
      font-size: var(--font-size-xs);
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .error-detail-code {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: monospace;
      font-size: 0.78rem;
      line-height: 1.5;
      color: #ffd7d7;
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
    this.pendingMode = '';
    this.errorMessage = '';
    this._token = '';
    this._error = '';
    this._errorDetail = '';
    this._showErrorDetail = false;
    this._iosInstallToastVisible = false;
  }

  firstUpdated() {
    if (!isIosSafariInstallable() || readInstallHintDismissed()) {
      return;
    }

    if (toasts.items.some((item) => item.id === IOS_INSTALL_TOAST_ID)) {
      this._iosInstallToastVisible = true;
      return;
    }

    const description = [
      this.t('tokenSetup.installIosDescription'),
      this.t('tokenSetup.installIosStepShare'),
      this.t('tokenSetup.installIosStepAdd'),
      this.t('tokenSetup.installIosStepLaunch'),
    ].join(' ');

    toasts.show({
      id: IOS_INSTALL_TOAST_ID,
      tone: 'info',
      duration: 0,
      title: this.t('tokenSetup.installIosTitle'),
      description,
      onDismiss: (reason) => {
        this._iosInstallToastVisible = false;

        if (reason === 'dismiss') {
          writeInstallHintDismissed();
        }
      },
    });

    this._iosInstallToastVisible = true;
  }

  disconnectedCallback() {
    if (this._iosInstallToastVisible) {
      toasts.dismiss(IOS_INSTALL_TOAST_ID, 'context-change');
      this._iosInstallToastVisible = false;
    }

    super.disconnectedCallback();
  }

  _resolveErrorNotice(error) {
    if (!error) {
      return {
        message: this.authError ? this.t('tokenSetup.errors.expired') : '',
        detail: '',
      };
    }

    if (typeof error === 'string') {
      return {
        message: error,
        detail: '',
      };
    }

    if (error?.key) {
      return {
        message: this.t(error.key, error.values),
        detail: error.detail ?? '',
      };
    }

    if (typeof error?.message === 'string') {
      return {
        message: error.message,
        detail: '',
      };
    }

    return {
      message: this.t('tokenSetup.errors.invalid'),
      detail: '',
    };
  }

  updated(changed) {
    if (changed.has('errorMessage')) {
      const notice = this._resolveErrorNotice(this.errorMessage);
      this._error = notice.message;
      this._errorDetail = notice.detail;
      this._showErrorDetail = false;
      return;
    }

    if (changed.has('authError') && this.authError && !this.errorMessage) {
      this._error = this.t('tokenSetup.errors.expired');
      this._errorDetail = '';
      this._showErrorDetail = false;
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

  _toggleErrorDetail() {
    this._showErrorDetail = !this._showErrorDetail;
  }

  _resumeOauthLogin() {
    this.dispatchEvent(new CustomEvent('oauth-login-resume', {
      bubbles: true,
      composed: true,
    }));
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

  _buttonIcon() {
    if (this.processing) {
      return 'progress_activity';
    }

    return this.authMode === 'token' ? 'key' : 'arrow_forward';
  }

  _statusTemplate() {
    if (this.authMode !== 'oauth') {
      return '';
    }

    if (!this.processing && this.pendingMode !== 'standalone') {
      return '';
    }

    const title = this.processing
      ? this.t('tokenSetup.status.checkingTitle')
      : this.t('tokenSetup.status.standaloneTitle');
    const description = this.processing
      ? this.t('tokenSetup.status.checkingDescription')
      : this.t('tokenSetup.status.standaloneDescription');

    return html`
      <section class=${`status-card ${this.processing ? 'is-processing' : ''}`}>
        <div class="status-copy">
          <span class="status-title">${title}</span>
          <span class="status-description">${description}</span>
        </div>
        ${!this.processing && this.pendingMode === 'standalone' ? html`
          <button class="secondary-button" type="button" @click=${this._resumeOauthLogin}>
            <span>${this.t('tokenSetup.status.checkAction')}</span>
          </button>
        ` : ''}
      </section>
    `;
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
        ${this._statusTemplate()}

        ${this._error ? html`
          <div class="error" role="alert" aria-live="polite">
            <span class="error-icon" aria-hidden="true">error</span>
            <span class="error-text">${this._error}</span>
            ${this._errorDetail ? html`
              <button
                class="error-toggle"
                type="button"
                @click=${this._toggleErrorDetail}
                aria-expanded=${this._showErrorDetail ? 'true' : 'false'}
                aria-label=${this._showErrorDetail
                  ? this.t('tokenSetup.hideErrorDetails')
                  : this.t('tokenSetup.showErrorDetails')}
                title=${this._showErrorDetail
                  ? this.t('tokenSetup.hideErrorDetails')
                  : this.t('tokenSetup.showErrorDetails')}
              >
                <span class="error-toggle-icon" aria-hidden="true">${this._showErrorDetail ? 'code_off' : 'code'}</span>
              </button>
            ` : ''}
            ${this._errorDetail && this._showErrorDetail ? html`
              <div class="error-detail">
                <span class="error-detail-label">${this.t('tokenSetup.errorDetailsLabel')}</span>
                <pre class="error-detail-code">${this._errorDetail}</pre>
              </div>
            ` : ''}
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
          <span>${this._buttonLabel()}</span>
          <span class=${`button-icon ${this.processing ? 'spinning' : ''}`} aria-hidden="true">${this._buttonIcon()}</span>
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
