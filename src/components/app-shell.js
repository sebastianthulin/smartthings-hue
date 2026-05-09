import { LitElement, html, css } from 'lit';
import { smartthings } from '../services/smartthings.js';
import { store } from '../services/store.js';
import './token-setup.js';
import './home-view.js';

export class AppShell extends LitElement {
  static properties = {
    _hasToken:  { state: true },
    _authError: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--color-bg);
      color: var(--color-text-primary);
      font-family: var(--font-family);
    }
  `;

  constructor() {
    super();
    this._hasToken  = smartthings.hasToken;
    this._authError = false;
  }

  connectedCallback() {
    super.connectedCallback();

    store.addEventListener('error', e => {
      if (store.authError) {
        this._authError = true;
        this._hasToken  = false;
      }
    });

    if (this._hasToken) {
      this._boot();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    store.stopSync();
  }

  async _boot() {
    store.rehydrate();   // render instantly from cache
    store.startSync();   // then sync in background
  }

  _handleTokenSet(e) {
    const { token } = e.detail;
    smartthings.setToken(token);
    this._hasToken  = true;
    this._authError = false;
    this._boot();
  }

  render() {
    if (!this._hasToken) {
      return html`
        <token-setup
          ?auth-error=${this._authError}
          @token-set=${this._handleTokenSet}
        ></token-setup>
      `;
    }
    return html`<home-view></home-view>`;
  }
}

customElements.define('app-shell', AppShell);
