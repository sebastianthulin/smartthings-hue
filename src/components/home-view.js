import { html, css } from 'lit';
import { store } from '../services/store.js';
import { smartthings } from '../services/smartthings.js';
import { LocalizedElement } from './localized-element.js';
import './room-card.js';

const HIDDEN_ROOMS_KEY = 'st_hidden_rooms';
const ROUTINE_SELECTIONS_KEY = 'st_routine_selections';
const MAX_ROUTINES_PER_ROOM = 4;

export class HomeView extends LocalizedElement {
  static properties = {
    _connectionMenuOpen:    { state: true },
    _disconnectConfirmOpen: { state: true },
    _globalSceneId:         { state: true },
    _hiddenRoomIds:         { state: true },
    _rooms:                 { state: true },
    _roomSceneIds:          { state: true },
    _scenes:                { state: true },
    _settingsOpen:          { state: true },
    _syncing:               { state: true },
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

    .global-routines {
      padding-bottom: var(--space-3);
    }

    .global-routine-btn {
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-3) var(--space-4);
      border: 1px solid rgba(255, 180, 80, 0.28);
      border-radius: var(--radius-full);
      background: rgba(255, 180, 80, 0.1);
      color: var(--color-text-primary);
      font: inherit;
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .global-routine-btn:active {
      background: rgba(255, 180, 80, 0.18);
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

    .settings-section + .settings-section {
      margin-top: var(--space-6);
    }

    .settings-section-title {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .settings-section-description {
      margin: 0 0 var(--space-4);
      font-size: var(--font-size-sm);
      line-height: 1.5;
      color: var(--color-text-dim);
    }

    .settings-room-group + .settings-room-group {
      margin-top: var(--space-4);
    }

    .settings-room-group-name {
      display: block;
      margin-bottom: var(--space-3);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-primary);
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
    this._globalSceneId         = null;
    this._hiddenRoomIds         = this._loadHiddenRooms();
    this._rooms                 = store.rooms;
    this._roomSceneIds          = {};
    this._scenes                = store.scenes;
    this._settingsOpen          = false;
    this._syncing               = false;

    const routineSelections = this._loadRoutineSelections();
    this._globalSceneId = routineSelections.globalSceneId;
    this._roomSceneIds  = routineSelections.roomSceneIds;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onUpdate   = e => {
      this._rooms = [...(e.detail.rooms ?? [])];
      this._scenes = [...(e.detail.scenes ?? [])];
    };
    this._onSyncing  = ()  => { this._syncing = true; };
    this._onSynced   = ()  => { this._syncing = false; };

    store.addEventListener('update',  this._onUpdate);
    store.addEventListener('syncing', this._onSyncing);
    store.addEventListener('synced',  this._onSynced);

    // Sync current state in case store already has data
    this._rooms = [...store.rooms];
    this._scenes = [...store.scenes];
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    store.removeEventListener('update',  this._onUpdate);
    store.removeEventListener('syncing', this._onSyncing);
    store.removeEventListener('synced',  this._onSynced);
  }

  updated(changed) {
    if (changed.has('_rooms') || changed.has('_scenes')) {
      this._pruneRoutineSelections();
    }

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
    try {
      localStorage.setItem(HIDDEN_ROOMS_KEY, JSON.stringify(hiddenRoomIds));
    } catch { /* storage unavailable — ignore */ }
  }

  _loadRoutineSelections() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ROUTINE_SELECTIONS_KEY) ?? '{}');
      const roomSceneIds = Object.fromEntries(
        Object.entries(parsed.roomSceneIds ?? {})
          .filter(([, sceneIds]) => Array.isArray(sceneIds))
          .map(([roomId, sceneIds]) => [roomId, [...new Set(sceneIds)].slice(0, MAX_ROUTINES_PER_ROOM)])
      );

      return {
        globalSceneId: typeof parsed.globalSceneId === 'string' ? parsed.globalSceneId : null,
        roomSceneIds,
      };
    } catch {
      return {
        globalSceneId: null,
        roomSceneIds: {},
      };
    }
  }

  _saveRoutineSelections(globalSceneId, roomSceneIds) {
    this._globalSceneId = globalSceneId;
    this._roomSceneIds = roomSceneIds;

    try {
      localStorage.setItem(ROUTINE_SELECTIONS_KEY, JSON.stringify({
        globalSceneId,
        roomSceneIds,
      }));
    } catch { /* storage unavailable — ignore */ }
  }

  _pruneRoutineSelections() {
    const validRoomIds = new Set(this._rooms.map(room => room.id));
    const validSceneIds = new Set(this._scenes.map(scene => scene.id));
    const nextRoomSceneIds = {};

    for (const [roomId, sceneIds] of Object.entries(this._roomSceneIds)) {
      if (!validRoomIds.has(roomId)) continue;

      const nextSceneIds = [...new Set(sceneIds)]
        .filter(sceneId => validSceneIds.has(sceneId))
        .slice(0, MAX_ROUTINES_PER_ROOM);

      if (nextSceneIds.length > 0) {
        nextRoomSceneIds[roomId] = nextSceneIds;
      }
    }

    const nextGlobalSceneId = validSceneIds.has(this._globalSceneId)
      ? this._globalSceneId
      : null;

    if (
      nextGlobalSceneId !== this._globalSceneId ||
      JSON.stringify(nextRoomSceneIds) !== JSON.stringify(this._roomSceneIds)
    ) {
      this._saveRoutineSelections(nextGlobalSceneId, nextRoomSceneIds);
    }
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

  _selectGlobalScene(e) {
    const { sceneId } = e.target.dataset;
    const nextGlobalSceneId = sceneId || null;
    this._saveRoutineSelections(nextGlobalSceneId, this._roomSceneIds);
  }

  _toggleRoomScene(e) {
    const { roomId, sceneId } = e.target.dataset;
    if (!roomId || !sceneId) return;

    const nextSceneIds = [...(this._roomSceneIds[roomId] ?? [])];
    if (e.target.checked) {
      if (nextSceneIds.includes(sceneId)) {
        e.target.checked = true;
        return;
      }

      if (nextSceneIds.length >= MAX_ROUTINES_PER_ROOM) {
        e.target.checked = false;
        return;
      }

      nextSceneIds.push(sceneId);
    } else {
      const index = nextSceneIds.indexOf(sceneId);
      if (index >= 0) nextSceneIds.splice(index, 1);
    }

    const nextRoomSceneIds = { ...this._roomSceneIds };
    if (nextSceneIds.length > 0) {
      nextRoomSceneIds[roomId] = nextSceneIds;
    } else {
      delete nextRoomSceneIds[roomId];
    }

    this._saveRoutineSelections(this._globalSceneId, nextRoomSceneIds);
  }

  _executeScene(sceneId) {
    store.executeScene(sceneId);
  }

  _handleExecuteRoutine(e) {
    this._executeScene(e.detail.sceneId);
  }

  get _visibleRooms() {
    const hidden = new Set(this._hiddenRoomIds);
    return this._rooms.filter(room => !hidden.has(room.id));
  }

  get _globalScene() {
    return this._scenes.find(scene => scene.id === this._globalSceneId) ?? null;
  }

  _getRoomScenes(roomId) {
    const sceneMap = new Map(this._scenes.map(scene => [scene.id, scene]));
    return (this._roomSceneIds[roomId] ?? [])
      .map(sceneId => sceneMap.get(sceneId))
      .filter(Boolean);
  }

  render() {
    const visibleRooms = this._visibleRooms;
    const globalScene = this._globalScene;
    const settingsLabel = this._settingsOpen
      ? this.t('home.closeSettings')
      : this.t('home.openSettings');

    return html`
      <header>
        <div class="header-inner">
          <h1>${this.t('home.title')}</h1>
          <div class="header-actions">
            <div class="sync-dot ${this._syncing ? 'active' : ''}"></div>
            <button class="icon-btn" @click=${this._toggleSettings} aria-label=${settingsLabel}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8 3.5l-1.76-.57a6.86 6.86 0 00-.52-1.24l.86-1.65-1.41-1.41-1.65.86a6.86 6.86 0 00-1.24-.52L13 4h-2l-.57 1.76c-.43.11-.84.28-1.24.52l-1.65-.86-1.41 1.41.86 1.65c-.24.4-.41.81-.52 1.24L4 11v2l1.76.57c.11.43.28.84.52 1.24l-.86 1.65 1.41 1.41 1.65-.86c.4.24.81.41 1.24.52L11 20h2l.57-1.76c.43-.11.84-.28 1.24-.52l1.65.86 1.41-1.41-.86-1.65c.24-.4.41-.81.52-1.24L20 13v-2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        ${globalScene ? html`
          <div class="global-routines">
            <button
              type="button"
              class="global-routine-btn"
              @click=${() => this._executeScene(globalScene.id)}
            >
              ${globalScene.name}
            </button>
          </div>
        ` : ''}
      </header>

      <div class="rooms">
        ${visibleRooms.length === 0
          ? this._renderEmpty()
          : visibleRooms.map(r => html`
              <room-card
                .room=${r}
                .routines=${this._getRoomScenes(r.id)}
                @execute-routine=${this._handleExecuteRoutine}
              ></room-card>
            `)}
      </div>

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

          <div class="settings-section">
            <h3 class="settings-section-title">${this.t('home.roomsSectionTitle')}</h3>
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
          </div>

          <div class="settings-section">
            <h3 class="settings-section-title">${this.t('home.globalRoutineTitle')}</h3>
            <p class="settings-section-description">${this.t('home.globalRoutineDescription')}</p>

            ${this._scenes.length === 0
              ? html`<div class="settings-empty">${this.t('home.routinesEmpty')}</div>`
              : html`
                  <div class="settings-list">
                    <label class="settings-row">
                      <span>${this.t('home.doNotShow')}</span>
                      <input
                        type="radio"
                        name="global-scene"
                        .checked=${this._globalSceneId === null}
                        data-scene-id=""
                        @change=${this._selectGlobalScene}
                      />
                    </label>

                    ${this._scenes.map(scene => html`
                      <label class="settings-row">
                        <span>${scene.name}</span>
                        <input
                          type="radio"
                          name="global-scene"
                          .checked=${this._globalSceneId === scene.id}
                          data-scene-id=${scene.id}
                          @change=${this._selectGlobalScene}
                        />
                      </label>
                    `)}
                  </div>
                `}
          </div>

          <div class="settings-section">
            <h3 class="settings-section-title">${this.t('home.roomRoutinesTitle')}</h3>
            <p class="settings-section-description">${this.t('home.roomRoutinesDescription', {
              max: MAX_ROUTINES_PER_ROOM,
            })}</p>

            ${this._rooms.length === 0 || this._scenes.length === 0
              ? html`<div class="settings-empty">${this.t('home.routinesEmpty')}</div>`
              : this._rooms.map(room => {
                  const selectedSceneIds = new Set(this._roomSceneIds[room.id] ?? []);
                  return html`
                    <div class="settings-room-group">
                      <span class="settings-room-group-name">${room.name}</span>
                      <div class="settings-list">
                        ${this._scenes.map(scene => {
                          const checked = selectedSceneIds.has(scene.id);
                          const disabled = !checked && selectedSceneIds.size >= MAX_ROUTINES_PER_ROOM;
                          return html`
                            <label class="settings-row">
                              <span>${scene.name}</span>
                              <input
                                type="checkbox"
                                .checked=${checked}
                                .disabled=${disabled}
                                data-room-id=${room.id}
                                data-scene-id=${scene.id}
                                @change=${this._toggleRoomScene}
                              />
                            </label>
                          `;
                        })}
                      </div>
                    </div>
                  `;
                })}
          </div>

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
