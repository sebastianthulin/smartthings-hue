import { LitElement, html, css } from 'lit';
import { store } from '../services/store.js';
import { smartthings } from '../services/smartthings.js';
import './room-card.js';

export class HomeView extends LitElement {
  static properties = {
    _rooms:   { state: true },
    _syncing: { state: true },
  };

  static styles = css`
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--color-bg);
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: env(safe-area-inset-top, 0) var(--space-6) 0;
      background: linear-gradient(to bottom, var(--color-bg) 70%, transparent);
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5) 0 var(--space-4);
    }

    h1 {
      margin: 0;
      font-size: var(--font-size-2xl, 34px);
      font-weight: var(--font-weight-bold);
      letter-spacing: -1px;
      color: var(--color-text-primary);
    }

    .sync-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-accent);
      opacity: 0;
      transition: opacity var(--transition-base);
    }

    .sync-dot.active {
      opacity: 1;
      animation: pulse 1.2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50%       { opacity: 1;   transform: scale(1.3); }
    }

    .rooms {
      padding: var(--space-2) var(--space-4) calc(var(--space-12) + env(safe-area-inset-bottom, 0));
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60dvh;
      gap: var(--space-4);
      padding: var(--space-6);
      text-align: center;
    }

    .empty-icon {
      width: 64px;
      height: 64px;
      opacity: 0.15;
    }

    .empty h2 {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-secondary);
    }

    .empty p {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-dim);
      max-width: 240px;
    }

    .disconnect-btn {
      position: fixed;
      bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0));
      right: var(--space-6);
      background: var(--color-surface-elevated);
      border: none;
      border-radius: var(--radius-full);
      padding: var(--space-3) var(--space-5);
      color: var(--color-text-dim);
      font-family: var(--font-family);
      font-size: var(--font-size-xs);
      cursor: pointer;
      transition: color var(--transition-base);
    }

    .disconnect-btn:active {
      color: var(--color-text-secondary);
    }
  `;

  constructor() {
    super();
    this._rooms   = store.rooms;
    this._syncing = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onUpdate   = e => { this._rooms   = [...e.detail.rooms]; };
    this._onSyncing  = ()  => { this._syncing = true; };
    this._onSynced   = ()  => { this._syncing = false; };

    store.addEventListener('update',  this._onUpdate);
    store.addEventListener('syncing', this._onSyncing);
    store.addEventListener('synced',  this._onSynced);

    // Sync current state in case store already has data
    this._rooms = [...store.rooms];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    store.removeEventListener('update',  this._onUpdate);
    store.removeEventListener('syncing', this._onSyncing);
    store.removeEventListener('synced',  this._onSynced);
  }

  _disconnect() {
    if (!confirm('Disconnect from SmartThings and clear all local data?')) return;
    store.stopSync();
    store.clearCache();
    smartthings.clearToken();
    window.location.reload();
  }

  render() {
    return html`
      <header>
        <div class="header-inner">
          <h1>Home</h1>
          <div class="sync-dot ${this._syncing ? 'active' : ''}"></div>
        </div>
      </header>

      <div class="rooms">
        ${this._rooms.length === 0
          ? this._renderEmpty()
          : this._rooms.map(r => html`<room-card .room=${r}></room-card>`)}
      </div>

      <button class="disconnect-btn" @click=${this._disconnect}>Disconnect</button>
    `;
  }

  _renderEmpty() {
    return html`
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 64 64" fill="none">
          <path d="M32 8L8 28V56h16V40h16v16h16V28L32 8z" stroke="white" stroke-width="3" stroke-linejoin="round"/>
        </svg>
        <h2>Setting up your home…</h2>
        <p>Fetching your rooms and lights from SmartThings.</p>
      </div>
    `;
  }
}

customElements.define('home-view', HomeView);
