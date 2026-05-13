import { LitElement, html, css } from 'lit';
import { smartthings } from '../services/smartthings.js';
import { store } from '../services/store.js';
import './token-setup.js';
import './home-view.js';

const appShellStyles = css`
  app-shell {
    display: block;
    min-height: 100dvh;
    width: min(100%, 980px);
    margin: 0 auto;
    background: var(--color-bg);
    color: var(--color-text-primary);
    font-family: var(--font-family);
    box-sizing: border-box;
  }

  .page-shell {
    min-height: 100dvh;
    view-transition-name: app-page;
  }
`;

export class AppShell extends LitElement {
  static properties = {
    _hasToken:             { state: true },
    _authMode:             { state: true },
    _authError:            { state: true },
    _authMessage:          { state: true },
    _authPending:          { state: true },
    _pageTransitionActive: { state: true },
  };

  static styles = appShellStyles;

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._hasToken             = smartthings.hasToken;
    this._authMode             = smartthings.authMode;
    this._authError            = false;
    this._authMessage          = '';
    this._authPending          = true;
    this._pageTransitionActive = false;
  }

  _describeError(error, fallbackKey = 'tokenSetup.errors.invalid') {
    if (error?.messageDescriptor) {
      return error.messageDescriptor;
    }

    if (typeof error?.message === 'string' && error.message.trim()) {
      return error.message;
    }

    return { key: fallbackKey };
  }

  connectedCallback() {
    super.connectedCallback();

    this._onStoreError = (event) => {
      if (store.authError) {
        this._runAppViewTransition(() => {
          this._authError = true;
          this._authMessage = this._describeError(event.detail, 'tokenSetup.errors.expired');
          this._hasToken  = false;
        });
      }
    };

    store.addEventListener('error', this._onStoreError);
    this._initializeAuth();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    store.removeEventListener('error', this._onStoreError);
    store.stopSync();
  }

  async _boot() {
    store.rehydrate();   // render instantly from cache
    store.startSync();   // then sync in background
  }

  async _initializeAuth() {
    this._authPending = true;
    this._authMode = smartthings.authMode;

    try {
      if (this._authMode === 'oauth') {
        await smartthings.maybeCompleteLoginFromRedirect();
      }

      this._hasToken = smartthings.hasToken;

      if (this._hasToken) {
        this._authError = false;
        this._authMessage = '';
        await this._boot();
      } else if (this._authMode === 'oauth') {
        this._authMessage = smartthings.authConfigError;
      }
    } catch (error) {
      smartthings.clearToken();
      this._hasToken = false;
      this._authError = true;
      this._authMessage = this._describeError(error);
    } finally {
      this._authPending = false;
    }
  }

  async _handleTokenSet(e) {
    const { token } = e.detail;
    smartthings.setToken(token);
    await this._runAppViewTransition(() => {
      this._hasToken = true;
      this._authError = false;
      this._authMessage = '';
    });
    this._boot();
  }

  _handleLoginStart() {
    this._authError = false;
    this._authMessage = smartthings.authConfigError;

    if (this._authMessage) {
      return;
    }

    this._authPending = true;

    try {
      smartthings.startLogin();
    } catch (error) {
      this._authPending = false;
      this._authMessage = this._describeError(error);
    }
  }

  async _runAppViewTransition(update) {
    const startViewTransition = document.startViewTransition?.bind(document);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reducedMotion) {
      update();
      return;
    }

    this._pageTransitionActive = true;
    await this.updateComplete;

    const transition = startViewTransition(async () => {
      update();
      await this.updateComplete;
    });

    try {
      await transition.finished;
    } finally {
      this._pageTransitionActive = false;
    }
  }

  render() {
    if (!this._hasToken) {
      return html`
        <style>${appShellStyles.cssText}</style>
        <div class="page-shell" style=${`view-transition-name: ${this._pageTransitionActive ? 'app-page' : 'none'};`}>
          <token-setup
            .authMode=${this._authMode}
            ?auth-error=${this._authError}
            ?processing=${this._authPending}
            .errorMessage=${this._authMessage}
            @oauth-login-start=${this._handleLoginStart}
            @token-set=${this._handleTokenSet}
          ></token-setup>
        </div>
      `;
    }
    return html`
      <style>${appShellStyles.cssText}</style>
      <div class="page-shell" style=${`view-transition-name: ${this._pageTransitionActive ? 'app-page' : 'none'};`}><home-view></home-view></div>
    `;
  }
}

customElements.define('app-shell', AppShell);
