import { html, css } from 'lit';
import { store } from '../services/store.js';
import { smartthings } from '../services/smartthings.js';
import { LocalizedElement } from './localized-element.js';
import './room-card.js';

const HIDDEN_ROOMS_KEY = 'st_hidden_rooms';

export class HomeView extends LocalizedElement {
  static properties = {
    _connectionMenuOpen:    { state: true },
    _disconnectConfirmOpen: { state: true },
    _activeRoomId:          { state: true },
    _hiddenRoomIds:         { state: true },
    _rooms:                 { state: true },
    _settingsOpen:          { state: true },
    _syncing:               { state: true },
  };

  static styles = css`
    :host {
      display: block;
      min-height: 100dvh;
      background: var(--color-bg);
    }

    *, *::before, *::after {
      corner-shape: var(--corner-shape);
    }

    header {
      position: sticky;
      top: 0;
      z-index: 10;
      padding: env(safe-area-inset-top, 0) var(--space-4) 0;
      background: linear-gradient(to bottom, var(--color-bg) 70%, transparent);
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-5) 0 var(--space-4);
    }

    .header-title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex: 1;
    }

    h1 {
      margin: 0;
      font-size: var(--font-size-2xl, 34px);
      font-weight: var(--font-weight-bold);
      letter-spacing: -1px;
      color: var(--color-text-primary);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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

    .room-detail {
      padding: var(--space-2) var(--space-4) calc(var(--space-12) + env(safe-area-inset-bottom, 0));
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

    .connection-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      padding: var(--space-4);
      background: var(--color-surface-elevated);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      color: var(--color-text-primary);
      font: inherit;
      cursor: pointer;
    }

    .connection-chevron {
      color: var(--color-text-dim);
      transition: transform var(--transition-base);
    }

    .connection-chevron.open {
      transform: rotate(180deg);
    }

    .connection-panel {
      width: 100%;
      margin-top: var(--space-3);
      padding: var(--space-4);
      background: rgba(255, 107, 107, 0.08);
      border: 1px solid rgba(255, 107, 107, 0.18);
      border-radius: var(--radius-md);
      box-sizing: border-box;
    }

    .connection-panel p {
      margin: 0 0 var(--space-4);
      color: var(--color-text-secondary);
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
      backdrop-filter: blur(2px);
      overflow-y: auto;
      z-index: 20;
    }

    .settings-sheet {
      width: min(100%, 420px);
      max-height: calc(100dvh - (var(--space-4) * 2) - env(safe-area-inset-bottom, 0));
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      box-sizing: border-box;
      overflow-y: auto;
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
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-4);
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

    .confirm-backdrop {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      background: rgba(5, 6, 10, 0.82);
      z-index: 30;
    }

    .confirm-dialog {
      width: min(100%, 360px);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-xl);
      padding: var(--space-6);
      box-sizing: border-box;
    }

    .confirm-dialog h3 {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-lg);
      color: var(--color-text-primary);
    }

    .confirm-dialog p {
      margin: 0 0 var(--space-5);
      color: var(--color-text-secondary);
      line-height: 1.5;
    }

    .confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-3);
    }

    .confirm-actions .secondary-btn {
      padding: var(--space-3) 0;
    }
  `;

  constructor() {
    super();
    this._connectionMenuOpen    = false;
    this._disconnectConfirmOpen = false;
    this._activeRoomId          = null;
    this._hiddenRoomIds         = this._loadHiddenRooms();
    this._rooms                 = store.rooms;
    this._settingsOpen          = false;
    this._syncing               = false;
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
      const settingsSheet = this.renderRoot.querySelector('.settings-sheet');
      if (settingsSheet) {
        settingsSheet.focus();
      }
    }

    if (changed.has('_disconnectConfirmOpen') && this._disconnectConfirmOpen) {
      const confirmDialog = this.renderRoot.querySelector('.confirm-dialog');
      if (confirmDialog) {
        confirmDialog.focus();
      }
    }
  }

  _disconnect() {
    store.stopSync();
    store.clearCache();
    smartthings.clearToken();
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
    if (this._activeRoomId && hiddenRoomIds.includes(this._activeRoomId)) {
      this._activeRoomId = null;
    }
    try {
      localStorage.setItem(HIDDEN_ROOMS_KEY, JSON.stringify(hiddenRoomIds));
    } catch { /* storage unavailable — ignore */ }
  }

  _toggleSettings() {
    this._settingsOpen = !this._settingsOpen;
    if (!this._settingsOpen) {
      this._connectionMenuOpen = false;
      this._disconnectConfirmOpen = false;
    }
  }

  _onSettingsKeyDown(e) {
    if (e.key === 'Escape') {
      this._settingsOpen = false;
      this._connectionMenuOpen = false;
      this._disconnectConfirmOpen = false;
    }
  }

  _onDisconnectConfirmKeyDown(e) {
    if (e.key === 'Escape') {
      this._disconnectConfirmOpen = false;
    }
  }

  _toggleConnectionMenu() {
    this._connectionMenuOpen = !this._connectionMenuOpen;
  }

  _openDisconnectConfirm() {
    this._disconnectConfirmOpen = true;
  }

  _closeDisconnectConfirm() {
    this._disconnectConfirmOpen = false;
  }

  _confirmDisconnect() {
    this._disconnectConfirmOpen = false;
    this._disconnect();
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

  _openRoom(e) {
    const roomId = e.detail?.roomId;
    if (!roomId) return;
    this._activeRoomId = roomId;
  }

  _closeRoom() {
    this._activeRoomId = null;
  }

  get _visibleRooms() {
    const hidden = new Set(this._hiddenRoomIds);
    return this._rooms.filter(room => !hidden.has(room.id));
  }

  get _activeRoom() {
    return this._visibleRooms.find(room => room.id === this._activeRoomId) ?? null;
  }

  render() {
    const visibleRooms = this._visibleRooms;
    const activeRoom = this._activeRoom;
    const settingsLabel = this._settingsOpen
      ? this.t('home.closeSettings')
      : this.t('home.openSettings');

    return html`
      <header>
        <div class="header-inner">
          <div class="header-title">
            ${activeRoom ? html`
              <button class="icon-btn" @click=${this._closeRoom} aria-label=${this.t('home.backToRooms')}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            ` : ''}
            <h1>${activeRoom?.name ?? this.t('home.title')}</h1>
          </div>
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

      ${activeRoom
        ? html`
            <div class="room-detail">
              <room-card .room=${activeRoom} detail-view></room-card>
            </div>
          `
        : html`
            <div class="rooms">
              ${visibleRooms.length === 0
                ? this._renderEmpty()
                : visibleRooms.map(r => html`<room-card .room=${r} @open-room=${this._openRoom}></room-card>`)}
            </div>
          `}

      ${this._settingsOpen ? this._renderSettings() : ''}
      ${this._disconnectConfirmOpen ? this._renderDisconnectConfirm() : ''}
    `;
  }

  _renderEmpty() {
    const hasRooms = this._rooms.length > 0;
    return html`
      <div class="empty">
        <svg class="empty-icon" viewBox="0 0 64 64" fill="none">
          <path d="M32 8L8 28V56h16V40h16v16h16V28L32 8z" stroke="white" stroke-width="3" stroke-linejoin="round"/>
        </svg>
        <h2>${hasRooms ? this.t('home.allRoomsHidden') : this.t('home.setupTitle')}</h2>
        <p>${hasRooms
          ? this.t('home.allRoomsHiddenDescription')
          : this.t('home.setupDescription')}</p>
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
          aria-label=${this.t('home.settingsTitle')}
          tabindex="-1"
          @click=${e => e.stopPropagation()}
          @keydown=${this._onSettingsKeyDown}
        >
          <h2>${this.t('home.settingsTitle')}</h2>
          <p>${this.t('home.settingsDescription')}</p>

          ${this._rooms.length === 0
            ? html`<div class="settings-empty">${this.t('home.settingsEmpty')}</div>`
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

          <button class="connection-btn" @click=${this._toggleConnectionMenu} aria-expanded=${String(this._connectionMenuOpen)}>
            <span>${this.t('home.connection')}</span>
            <span class="connection-chevron ${this._connectionMenuOpen ? 'open' : ''}">⌄</span>
          </button>

          ${this._connectionMenuOpen ? html`
            <div class="connection-panel">
              <p>${this.t('home.disconnectDescription')}</p>
              <button class="disconnect-btn" @click=${this._openDisconnectConfirm}>${this.t('home.disconnectAction')}</button>
            </div>
          ` : ''}

          <div class="settings-actions">
            <button class="secondary-btn" @click=${this._toggleSettings}>${this.t('common.done')}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderDisconnectConfirm() {
    return html`
      <div class="confirm-backdrop" @click=${this._closeDisconnectConfirm}>
        <div
          class="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-label=${this.t('home.confirmDisconnectLabel')}
          tabindex="-1"
          @click=${e => e.stopPropagation()}
          @keydown=${this._onDisconnectConfirmKeyDown}
        >
          <h3>${this.t('home.confirmDisconnectTitle')}</h3>
          <p>${this.t('home.confirmDisconnectDescription')}</p>
          <div class="confirm-actions">
            <button class="secondary-btn" @click=${this._closeDisconnectConfirm}>${this.t('common.cancel')}</button>
            <button class="disconnect-btn" @click=${this._confirmDisconnect}>${this.t('home.disconnect')}</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('home-view', HomeView);
