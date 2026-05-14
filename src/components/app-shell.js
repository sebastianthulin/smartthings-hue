import { LitElement, html, css } from 'lit';
import { smartthings } from '../services/smartthings.js';
import { store } from '../services/store.js';
import { toasts } from '../services/toasts.js';
import './app-toasts.js';
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
    _authPendingMode:      { state: true },
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
    this._authPendingMode      = smartthings.pendingLoginMode;
    this._pageTransitionActive = false;
  }

  _describeError(error, fallbackKey = 'tokenSetup.errors.invalid') {
    if (error?.messageDescriptor) {
      return {
        ...error.messageDescriptor,
        detail: error.messageDescriptor.detail || error.message || '',
      };
    }

    if (typeof error?.message === 'string' && error.message.trim()) {
      return {
        key: fallbackKey,
        detail: error.message,
      };
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

    this._onVisibilityChange = () => {
      if (
        document.visibilityState === 'visible'
        && this._authMode === 'oauth'
        && !this._hasToken
      ) {
        this._resumePendingOAuth();
      }
    };

    this._onWindowFocus = () => {
      if (this._authMode === 'oauth' && !this._hasToken) {
        this._resumePendingOAuth();
      }
    };

    this._onPageShow = () => {
      if (this._authMode === 'oauth' && !this._hasToken) {
        this._resumePendingOAuth();
      }
    };

    this._onAuthRelayMessage = (event) => {
      if (
        event.data?.source === 'smarthue-auth-relay'
        && this._authMode === 'oauth'
        && !this._hasToken
      ) {
        this._resumePendingOAuth();
      }
    };

    store.addEventListener('error', this._onStoreError);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    window.addEventListener('focus', this._onWindowFocus);
    window.addEventListener('pageshow', this._onPageShow);
    window.addEventListener('message', this._onAuthRelayMessage);
    this._initializeAuth();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    store.removeEventListener('error', this._onStoreError);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    window.removeEventListener('focus', this._onWindowFocus);
    window.removeEventListener('pageshow', this._onPageShow);
    window.removeEventListener('message', this._onAuthRelayMessage);
    store.stopSync();
  }

  async _boot() {
    store.rehydrate();   // render instantly from cache
    store.startSync();   // then sync in background
  }

  _showQueuedAuthToast() {
    const notice = smartthings.consumeAuthNotice();

    if (notice?.type !== 'oauth-standalone-complete') {
      return;
    }

    toasts.show({
      tone: 'success',
      titleKey: 'home.toasts.oauthLoginSuccessTitle',
      descriptionKey: 'home.toasts.oauthLoginSuccessDescription',
      duration: 7000,
    });
  }

  async _initializeAuth() {
    this._authPending = true;
    this._authMode = smartthings.authMode;
    this._authPendingMode = smartthings.pendingLoginMode;

    try {
      if (this._authMode === 'oauth') {
        await smartthings.resumePendingLogin();

        if (!smartthings.hasToken) {
          await smartthings.maybeCompleteLoginFromRedirect();
        }
      }

      this._hasToken = smartthings.hasToken;

      if (this._hasToken) {
        this._authError = false;
        this._authMessage = '';
        this._authPendingMode = '';
        await this._boot();
        this._showQueuedAuthToast();
      } else if (this._authMode === 'oauth') {
        this._authMessage = smartthings.authConfigError;
        this._authPendingMode = smartthings.pendingLoginMode;
      }
    } catch (error) {
      smartthings.clearToken();
      this._hasToken = false;
      this._authError = true;
      this._authMessage = this._describeError(error);
      this._authPendingMode = '';
    } finally {
      this._authPending = false;
    }
  }

  async _resumePendingOAuth() {
    if (!smartthings.hasPendingLogin) {
      this._authPendingMode = '';
      return;
    }

    this._authPending = true;
    this._authPendingMode = smartthings.pendingLoginMode;

    try {
      const completed = await smartthings.resumePendingLogin({ forceRestart: true });

      if (completed && smartthings.hasToken) {
        this._hasToken = true;
        this._authError = false;
        this._authMessage = '';
        this._authPendingMode = '';
        await this._boot();
        this._showQueuedAuthToast();
        return;
      }

      await this._initializeAuth();
    } catch (error) {
      smartthings.clearToken();
      this._hasToken = false;
      this._authError = true;
      this._authMessage = this._describeError(error);
      this._authPendingMode = '';
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

  async _handleLoginStart() {
    this._authError = false;
    this._authMessage = smartthings.authConfigError;
    this._authPendingMode = '';

    if (this._authMessage) {
      return;
    }

    this._authPending = true;

    try {
      const completed = await smartthings.startLogin();

      if (completed?.pending) {
        this._authPendingMode = completed.handoff === 'standalone' ? 'standalone' : 'browser';
        return;
      }

      if (completed && smartthings.hasToken) {
        this._hasToken = true;
        this._authError = false;
        this._authMessage = '';
        this._authPendingMode = '';
        await this._boot();
        this._showQueuedAuthToast();
      }
    } catch (error) {
      this._authMessage = this._describeError(error);
      this._authError = true;
      this._authPendingMode = '';
    } finally {
      this._authPending = false;
    }
  }

  _handlePendingLoginResume() {
    this._resumePendingOAuth();
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
    const page = !this._hasToken
      ? html`
          <token-setup
            .authMode=${this._authMode}
            ?auth-error=${this._authError}
            ?processing=${this._authPending}
            .pendingMode=${this._authPendingMode}
            .errorMessage=${this._authMessage}
            @oauth-login-start=${this._handleLoginStart}
            @oauth-login-resume=${this._handlePendingLoginResume}
            @token-set=${this._handleTokenSet}
          ></token-setup>
        `
      : html`<home-view></home-view>`;

    return html`
      <style>${appShellStyles.cssText}</style>
      <div class="page-shell" style=${`view-transition-name: ${this._pageTransitionActive ? 'app-page' : 'none'};`}>
        ${page}
      </div>
      <app-toasts></app-toasts>
    `;
  }
}

customElements.define('app-shell', AppShell);
