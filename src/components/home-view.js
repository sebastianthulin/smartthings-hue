import { LitElement, html, css } from 'lit';
import { store } from '../services/store.js';
import { smartthings } from '../services/smartthings.js';
import './room-card.js';

const HIDDEN_ROOMS_KEY = 'st_hidden_rooms';

export class HomeView extends LitElement {
  static properties = {
    _hiddenRoomIds: { state: true },
    _rooms:         { state: true },
    _settingsOpen:  { state: true },
    _syncing:       { state: true },
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
      gap: var(--space-3);
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

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .icon-btn {
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--color-surface);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: color var(--transition-base), border-color var(--transition-base);
      -webkit-tap-highlight-color: transparent;
    }

    .icon-btn:active {
      color: var(--color-text-primary);
      border-color: var(--color-text-dim);
    }

    .icon-btn svg {
      width: 18px;
      height: 18px;
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
      width: 100%;
      background: rgba(255, 107, 107, 0.12);
      border: 1px solid rgba(255, 107, 107, 0.28);
      border-radius: var(--radius-md);
      padding: var(--space-4);
      color: #ff8e8e;
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: background var(--transition-base);
    }

    .disconnect-btn:active {
      background: rgba(255, 107, 107, 0.18);
    }

    .settings-backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: var(--space-4);
      padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0));
      background: rgba(5, 6, 10, 0.72);
      z-index: 20;
    }

    .settings-sheet {
      width: min(100%, 420px);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      box-sizing: border-box;
    }

    .settings-sheet h2 {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-lg);
      color: var(--color-text-primary);
    }

    .settings-sheet p {
      margin: 0 0 var(--space-5);
      font-size: var(--font-size-sm);
      line-height: 1.5;
      color: var(--color-text-secondary);
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin-bottom: var(--space-5);
    }

    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4);
      background: var(--color-surface-elevated);
      border-radius: var(--radius-md);
      color: var(--color-text-primary);
    }

    .settings-row span {
      flex: 1;
      min-width: 0;
    }

    .settings-row input {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--color-accent);
    }

    .settings-empty {
      padding: var(--space-4);
      margin-bottom: var(--space-5);
      background: var(--color-surface-elevated);
      border-radius: var(--radius-md);
      color: var(--color-text-dim);
      font-size: var(--font-size-sm);
    }

    .settings-actions {
      display: flex;
      justify-content: flex-end;
      margin-top: var(--space-4);
    }

    .secondary-btn {
      background: transparent;
      color: var(--color-text-secondary);
      border: none;
      padding: var(--space-2) 0;
      font: inherit;
      cursor: pointer;
    }
  `;

  constructor() {
    super();
    this._hiddenRoomIds = this._loadHiddenRooms();
    this._rooms         = store.rooms;
    this._settingsOpen  = false;
    this._syncing       = false;
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

  updated(changed) {
    if (changed.has('_settingsOpen') && this._settingsOpen) {
      this.renderRoot.querySelector('.settings-sheet')?.focus();
    }
  }

  _disconnect() {
    if (!confirm('Disconnect from SmartThings and clear all local data?')) return;
    store.stopSync();
    store.clearCache();
    smartthings.clearToken();
    this._saveHiddenRooms([]);
    window.location.reload();
  }

  _loadHiddenRooms() {
    try {
      const hiddenRoomIds = JSON.parse(localStorage.getItem(HIDDEN_ROOMS_KEY) ?? '[]');
      return Array.isArray(hiddenRoomIds) ? hiddenRoomIds : [];
    } catch {
      return [];
    }
  }

  _saveHiddenRooms(hiddenRoomIds) {
    this._hiddenRoomIds = hiddenRoomIds;
    try {
      localStorage.setItem(HIDDEN_ROOMS_KEY, JSON.stringify(hiddenRoomIds));
    } catch { /* storage unavailable — ignore */ }
  }

  _toggleSettings() {
    this._settingsOpen = !this._settingsOpen;
  }

  _onSettingsKeyDown(e) {
    if (e.key === 'Escape') {
      this._settingsOpen = false;
    }
  }

  _toggleRoomVisibility(e) {
    const { roomId } = e.target.dataset;
    if (!roomId) return;

    const hidden = new Set(this._hiddenRoomIds);
    if (e.target.checked) {
      hidden.delete(roomId);
    } else {
      hidden.add(roomId);
    }

    this._saveHiddenRooms([...hidden]);
  }

  get _visibleRooms() {
    const hidden = new Set(this._hiddenRoomIds);
    return this._rooms.filter(room => !hidden.has(room.id));
  }

  render() {
    const visibleRooms = this._visibleRooms;
    const settingsLabel = this._settingsOpen ? 'Close settings' : 'Open settings';

    return html`
      <header>
        <div class="header-inner">
          <h1>Home</h1>
          <div class="header-actions">
            <div class="sync-dot ${this._syncing ? 'active' : ''}"></div>
            <button class="icon-btn" @click=${this._toggleSettings} aria-label=${settingsLabel}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8 3.5l-1.76-.57a6.86 6.86 0 00-.52-1.24l.86-1.65-1.41-1.41-1.65.86a6.86 6.86 0 00-1.24-.52L13 4h-2l-.57 1.76c-.43.11-.84.28-1.24.52l-1.65-.86-1.41 1.41.86 1.65c-.24.4-.41.81-.52 1.24L4 11v2l1.76.57c.11.43.28.84.52 1.24l-.86 1.65 1.41 1.41 1.65-.86c.4.24.81.41 1.24.52L11 20h2l.57-1.76c.43-.11.84-.28 1.24-.52l1.65.86 1.41-1.41-.86-1.65c.24-.4.41-.81.52-1.24L20 13v-2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div class="rooms">
        ${visibleRooms.length === 0
          ? this._renderEmpty()
          : visibleRooms.map(r => html`<room-card .room=${r}></room-card>`)}
      </div>

      ${this._settingsOpen ? this._renderSettings() : ''}
    `;
  }

  _renderEmpty() {
    const hasRooms = this._rooms.length > 0;
    return html`
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 64 64" fill="none">
          <path d="M32 8L8 28V56h16V40h16v16h16V28L32 8z" stroke="white" stroke-width="3" stroke-linejoin="round"/>
        </svg>
        <h2>${hasRooms ? 'All rooms are hidden' : 'Setting up your home…'}</h2>
        <p>${hasRooms
          ? 'Open settings to choose which rooms should be shown on this device.'
          : 'Fetching your rooms and lights from SmartThings.'}</p>
      </div>
    `;
  }

  _renderSettings() {
    return html`
      <div class="settings-backdrop" @click=${this._toggleSettings}>
        <div
          class="settings-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          tabindex="-1"
          @click=${e => e.stopPropagation()}
          @keydown=${this._onSettingsKeyDown}
        >
          <h2>Settings</h2>
          <p>Choose which rooms should be visible on this device.</p>

          ${this._rooms.length === 0
            ? html`<div class="settings-empty">Rooms will appear here after your home finishes syncing.</div>`
            : html`
                <div class="settings-list">
                  ${this._rooms.map(room => {
                    const visible = !this._hiddenRoomIds.includes(room.id);
                    return html`
                      <label class="settings-row">
                        <span>${room.name}</span>
                        <input
                          type="checkbox"
                          .checked=${visible}
                          data-room-id=${room.id}
                          @change=${this._toggleRoomVisibility}
                        />
                      </label>
                    `;
                  })}
                </div>
              `}

          <button class="disconnect-btn" @click=${this._disconnect}>Disconnect</button>

          <div class="settings-actions">
            <button class="secondary-btn" @click=${this._toggleSettings}>Done</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('home-view', HomeView);
