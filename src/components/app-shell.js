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
    _hasToken:  { state: true },
    _authError: { state: true },
  };

  static styles = appShellStyles;

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._hasToken  = smartthings.hasToken;
    this._authError = false;
  }

  connectedCallback() {
    super.connectedCallback();

    this._onStoreError = () => {
      if (store.authError) {
        this._runAppViewTransition(() => {
          this._authError = true;
          this._hasToken  = false;
        });
      }
    };

    store.addEventListener('error', this._onStoreError);

    if (this._hasToken) {
      this._boot();
    }
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

  async _handleTokenSet(e) {
    const { token } = e.detail;
    smartthings.setToken(token);
    await this._runAppViewTransition(() => {
      this._hasToken  = true;
      this._authError = false;
    });
    this._boot();
  }

  async _runAppViewTransition(update) {
    const startViewTransition = document.startViewTransition?.bind(document);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reducedMotion) {
      update();
      return;
    }

    const transition = startViewTransition(async () => {
      update();
      await this.updateComplete;
    });

    await transition.finished;
  }

  render() {
    if (!this._hasToken) {
      return html`
        <style>${appShellStyles.cssText}</style>
        <div class="page-shell">
          <token-setup
            ?auth-error=${this._authError}
            @token-set=${this._handleTokenSet}
          ></token-setup>
        </div>
      `;
    }
    return html`
      <style>${appShellStyles.cssText}</style>
      <div class="page-shell"><home-view></home-view></div>
    `;
  }
}

customElements.define('app-shell', AppShell);
