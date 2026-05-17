import { html, css } from 'lit';
import { store } from '../services/store.js';
import { smartthings } from '../services/smartthings.js';
import { toasts } from '../services/toasts.js';
import { LocalizedElement } from './localized-element.js';
import './room-card.js';

const HIDDEN_ROOMS_KEY = 'st_hidden_rooms';
const SETTINGS_PASSWORD_KEY = 'st_settings_password';
const SETTINGS_PIN_PATTERN = /^\d{4}$/;
const SWIPE_BACK_EDGE_PX = 32;
const SWIPE_BACK_TRIGGER_PX = 72;
const SWIPE_BACK_LOCK_RATIO = 1.2;
const settingsPasswordEncoder = new TextEncoder();

function createMainRoutineDraft(homeConfig = null) {
  return {
    turnOnSceneId: homeConfig?.mainRoutines?.turnOnSceneId ?? null,
    turnOffSceneId: homeConfig?.mainRoutines?.turnOffSceneId ?? null,
  };
}

function normalizeStringIds(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [...new Set(
    values
      .filter(value => typeof value === 'string')
      .map(value => value.trim())
      .filter(Boolean)
  )];
}

function normalizeRoomIds(roomIds) {
  return normalizeStringIds(roomIds);
}

function normalizeSettingsPin(value = '') {
  return value.replace(/\D+/g, '').slice(0, 4);
}

function createSharedHiddenRoomDraft(homeConfig = null) {
  return normalizeRoomIds(homeConfig?.hiddenRoomIds ?? []);
}

function createRoomSettingsDraft(homeConfig = null, roomId = null) {
  const roomSettings = roomId ? homeConfig?.roomSettings?.[roomId] : null;

  return {
    hiddenLightIds: normalizeStringIds(roomSettings?.hiddenLightIds ?? []),
    routineSceneIds: normalizeStringIds(roomSettings?.routineSceneIds ?? []),
  };
}

function roomIdListsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((roomId, index) => roomId === right[index]);
}

function readSettingsPasswordRecord() {
  try {
    const value = localStorage.getItem(SETTINGS_PASSWORD_KEY);
    if (!value) {
      return null;
    }

    const record = JSON.parse(value);
    return typeof record?.hash === 'string' && record.hash
      ? { hash: record.hash }
      : null;
  } catch {
    return null;
  }
}

function writeSettingsPasswordRecord(record) {
  try {
    if (record?.hash) {
      localStorage.setItem(SETTINGS_PASSWORD_KEY, JSON.stringify(record));
    } else {
      localStorage.removeItem(SETTINGS_PASSWORD_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

async function hashSettingsPassword(password) {
  const value = typeof password === 'string' ? password : '';

  if (!window.crypto?.subtle) {
    return value;
  }

  const digest = await window.crypto.subtle.digest('SHA-256', settingsPasswordEncoder.encode(value));
  return [...new Uint8Array(digest)]
    .map(part => part.toString(16).padStart(2, '0'))
    .join('');
}

const homeViewStyles = css`
  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes rise-in {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes drift-glow {
    0%, 100% {
      transform: translate3d(0, 0, 0) scale(1);
    }
    50% {
      transform: translate3d(0, -10px, 0) scale(1.04);
    }
  }

  home-view {
    display: block;
    min-height: 100dvh;
    background: var(--color-bg);
  }

  home-view *, home-view *::before, home-view *::after {
    corner-shape: var(--corner-shape);
  }

  home-view header {
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
    flex: 1;
  }

  .header-nav-slot {
    width: 0;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    flex-wrap: nowrap;
    overflow: hidden;
    opacity: 0;
    transition: width var(--transition-base), opacity var(--transition-base);
  }

  .header-title.room-active {
    gap: var(--space-3);
    flex-wrap: nowrap;
  }

  .header-title.room-active .header-nav-slot {
    width: 40px;
    opacity: 1;
  }

  .header-title h1 {
    transform: translateX(0);
    transition: transform var(--transition-base);
  }

  .header-title.room-active h1 {
    transform: translateX(var(--space-3));
  }

  .header-nav-slot .icon-btn {
    opacity: 0;
    transition: opacity var(--transition-base);
  }

  .header-title.room-active .header-nav-slot .icon-btn {
    opacity: 1;
  }

  home-view h1 {
    margin: 0;
    font-size: var(--font-size-2xl, 34px);
    font-weight: var(--font-weight-bold);
    line-height: 1;
    letter-spacing: -1px;
    color: var(--color-text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    view-transition-name: page-title;
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
    flex-shrink: 0;
    flex-wrap: nowrap;
  }

  .header-main-routines {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .material-symbols {
    width: 1em;
    height: 1em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: 'Material Symbols Outlined Variable';
    font-weight: normal;
    font-style: normal;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .icon-btn {
    appearance: none;
    -webkit-appearance: none;
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
    transition: color var(--transition-base), border-color var(--transition-base), transform var(--transition-fast), background var(--transition-base);
    -webkit-tap-highlight-color: transparent;
  }

  .icon-btn:hover {
    transform: translateY(-1px);
    background: var(--color-surface-elevated);
  }

  .icon-btn:active {
    color: var(--color-text-primary);
    border-color: var(--color-text-dim);
  }

  .icon-btn .material-symbols {
    width: 18px;
    height: 18px;
    font-family: 'Material Symbols Outlined Variable';
    font-size: 18px;
    font-weight: normal;
    font-style: normal;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
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
    view-transition-name: home-stage;
  }

  .main-routine-btn {
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--color-surface-elevated);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border));
    border-radius: var(--radius-full);
    text-align: left;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base);
  }

  .main-routine-btn:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
    background: color-mix(in srgb, var(--color-surface-elevated) 76%, rgba(255, 179, 71, 0.08));
  }

  .main-routine-btn:active {
    transform: translateY(0);
  }

  .main-routine-btn .material-symbols {
    width: 18px;
    height: 18px;
    font-family: 'Material Symbols Outlined Variable';
    font-size: 18px;
    font-weight: normal;
    font-style: normal;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .room-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0 0 var(--space-4);
  }

  .room-action {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 40px;
    max-width: 100%;
    padding: 0 14px;
    background: var(--color-surface-elevated);
    border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border));
    border-radius: var(--radius-full);
    color: var(--color-text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base);
  }

  .room-action:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
    background: color-mix(in srgb, var(--color-surface-elevated) 76%, rgba(255, 179, 71, 0.08));
  }

  .room-action:active {
    transform: translateY(0);
  }

  .room-action .material-symbols {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }

  .room-action-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .header-inner {
      align-items: center;
    }

    .header-actions {
      gap: var(--space-2);
    }

    .header-main-routines {
      max-width: min(46vw, 240px);
    }
  }

  .room-detail {
    padding: var(--space-2) var(--space-4) calc(var(--space-12) + env(safe-area-inset-bottom, 0));
    view-transition-name: home-stage;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    font-family: 'Material Symbols Outlined Variable';
    font-size: 64px;
    font-weight: normal;
    font-style: normal;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 48;
    opacity: 0.15;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    animation: drift-glow var(--motion-duration-slow) ease-in-out infinite;
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
    transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base);
  }

  .connection-btn:hover {
    transform: translateY(-1px);
    background: rgba(255, 255, 255, 0.05);
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
    animation: rise-in var(--motion-duration-base) var(--motion-ease-soft) both;
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
    transition: background var(--transition-base), transform var(--transition-fast);
  }

  .disconnect-btn:hover {
    transform: translateY(-1px);
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
    view-transition-name: settings-backdrop;
  }

  .settings-sheet {
    width: min(100%, 760px);
    max-height: calc(100dvh - (var(--space-4) * 2) - env(safe-area-inset-bottom, 0));
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    box-sizing: border-box;
    overflow-y: auto;
    view-transition-name: settings-sheet;
  }

  ::view-transition-group(settings-backdrop) {
    animation-duration: var(--motion-duration-fast);
    animation-timing-function: var(--motion-ease-out);
  }

  ::view-transition-group(settings-sheet) {
    animation-duration: var(--motion-duration-base);
    animation-timing-function: var(--motion-ease-soft);
  }

  ::view-transition-old(settings-backdrop),
  ::view-transition-new(settings-backdrop) {
    mix-blend-mode: normal;
  }

  ::view-transition-old(settings-sheet),
  ::view-transition-new(settings-sheet) {
    mix-blend-mode: normal;
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

  .settings-tabs {
    display: flex;
    gap: var(--space-2);
    margin: 0 0 var(--space-5);
    padding: 4px;
    background: color-mix(in srgb, var(--color-surface-elevated) 88%, transparent);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    overflow-x: auto;
  }

  .settings-tab {
    appearance: none;
    -webkit-appearance: none;
    min-height: 36px;
    padding: 0 14px;
    border: none;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-dim);
    font: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--transition-base), color var(--transition-base), transform var(--transition-fast);
  }

  .settings-tab:hover {
    color: var(--color-text-primary);
  }

  .settings-tab.active {
    background: linear-gradient(180deg, color-mix(in srgb, var(--color-accent-bright) 90%, white 10%) 0%, var(--color-accent) 100%);
    color: #0d0d0d;
  }

  .settings-panel {
    min-height: 0;
    display: grid;
    gap: var(--space-7);
  }

  .settings-group {
    display: grid;
    gap: var(--space-5);
  }

  .settings-group-body {
    display: grid;
    gap: var(--space-4);
  }

  .settings-section-copy {
    display: grid;
    gap: 6px;
    margin-bottom: 0;
  }

  .settings-section-copy h3 {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .settings-section-copy p {
    margin: 0;
    color: var(--color-text-dim);
    font-size: var(--font-size-sm);
  }

  .settings-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: 0;
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

  .settings-field {
    display: grid;
    gap: var(--space-2);
    align-items: stretch;
  }

  .settings-field-label {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .settings-row input {
    appearance: none;
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    margin: 0;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    background: #202020;
    display: inline-grid;
    place-items: center;
    cursor: pointer;
    transition: background var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-fast);
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px 12px;
  }

  .settings-row input:hover {
    border-color: rgba(255, 255, 255, 0.22);
    transform: translateY(-1px);
  }

  .settings-row input:checked {
    background-color: var(--color-accent);
    border-color: rgba(255, 179, 71, 0.9);
    box-shadow: 0 0 0 4px rgba(255, 179, 71, 0.12);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%230d0d0d' d='M6.34 11.2 3.2 8.06l-1.06 1.06 4.2 4.2L13.86 5.8 12.8 4.74z'/%3E%3C/svg%3E");
  }

  .settings-row input:focus-visible {
    outline: 2px solid rgba(255, 179, 71, 0.75);
    outline-offset: 3px;
  }

  .settings-select {
    width: min(180px, 100%);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-surface) 90%, rgba(255, 255, 255, 0.02));
    color: var(--color-text-primary);
    font: inherit;
    padding: 10px 12px;
  }

  .settings-select:disabled {
    opacity: 0.7;
    cursor: progress;
  }

  .settings-field .settings-select {
    width: 100%;
  }

  .settings-empty {
    padding: var(--space-4);
    margin-bottom: 0;
    background: var(--color-surface-elevated);
    border-radius: var(--radius-md);
    color: var(--color-text-dim);
    font-size: var(--font-size-sm);
  }

  .settings-empty.compact {
    margin-bottom: var(--space-3);
    padding: var(--space-3);
  }

  .settings-empty-action {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-dim);
    text-align: center;
  }

  .settings-empty-action p {
    margin: 0;
  }

  .settings-empty-action-btn {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-primary);
    font: inherit;
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base);
  }

  .settings-empty-action-btn:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-accent) 35%, var(--color-border));
    background: color-mix(in srgb, var(--color-surface-elevated) 82%, rgba(255, 179, 71, 0.08));
  }

  .settings-empty-action-btn .material-symbols {
    font-size: 18px;
  }

  .settings-subsection + .settings-subsection {
    margin-top: 0;
  }

  .settings-subsection {
    display: grid;
    gap: var(--space-4);
  }

  .settings-pill-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: 0;
  }

  .settings-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    min-height: 36px;
    padding: 6px 8px 6px 12px;
    background: var(--color-surface-elevated);
    border: none;
    border-radius: var(--radius-full);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .settings-pill span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-pill button {
    appearance: none;
    -webkit-appearance: none;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text-secondary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .settings-pill button:hover {
    background: rgba(255, 255, 255, 0.14);
    color: var(--color-text-primary);
  }

  .settings-pill button .material-symbols {
    font-size: 16px;
    line-height: 1;
  }

  .settings-picker {
    display: grid;
    gap: var(--space-2);
  }

  .settings-select-shell {
    display: grid;
    gap: 0;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .settings-select-shell.open {
    border-color: color-mix(in srgb, var(--color-accent) 28%, var(--color-border));
  }

  .settings-select-surface {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
    padding: var(--space-2);
    background: color-mix(in srgb, var(--color-surface) 92%, rgba(255, 255, 255, 0.02));
  }

  .settings-select-values {
    min-height: 40px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    align-content: center;
  }

  .settings-select-placeholder {
    color: var(--color-text-dim);
    font-size: var(--font-size-sm);
    padding: 0 2px;
  }

  .settings-select-toggle {
    appearance: none;
    -webkit-appearance: none;
    width: 40px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--transition-base), color var(--transition-base), transform var(--transition-fast);
  }

  .settings-select-toggle:hover:not(:disabled) {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--color-surface-elevated) 68%, rgba(255, 179, 71, 0.08));
    color: var(--color-text-primary);
  }

  .settings-select-toggle:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .settings-select-tag {
    background: color-mix(in srgb, var(--color-surface-elevated) 74%, rgba(255, 179, 71, 0.08));
  }

  .settings-add-row {
    display: grid;
    gap: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    border-top: 1px solid var(--color-border);
  }

  .settings-search-row {
    position: relative;
    background: color-mix(in srgb, var(--color-surface) 90%, rgba(255, 255, 255, 0.02));
  }

  .settings-search-row .material-symbols {
    position: absolute;
    top: 50%;
    left: 12px;
    transform: translateY(-50%);
    font-size: 18px;
    color: var(--color-text-dim);
    pointer-events: none;
  }

  .settings-search {
    width: 100%;
    border: none;
    border-radius: 0;
    background: transparent;
    color: var(--color-text-primary);
    font: inherit;
    min-height: 40px;
    padding: 9px 12px 9px 40px;
    box-sizing: border-box;
  }

  .settings-search:disabled {
    opacity: 0.7;
    cursor: progress;
  }

  .settings-search-results {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    max-height: 184px;
    overflow-y: auto;
    padding: var(--space-2);
    background: color-mix(in srgb, var(--color-surface-elevated) 72%, transparent);
    align-content: flex-start;
  }

  .settings-search-result {
    appearance: none;
    -webkit-appearance: none;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 36px;
    padding: 6px 8px 6px 12px;
    border: none;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-surface-elevated) 84%, transparent);
    color: var(--color-text-primary);
    text-align: left;
    font: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base);
  }

  .settings-search-result-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-search-result:hover {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--color-surface-elevated) 82%, rgba(255, 179, 71, 0.08));
  }

  .settings-search-result-action {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-full);
    background: rgba(255, 255, 255, 0.08);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .settings-search-result .material-symbols {
    font-size: 16px;
    color: currentColor;
    flex-shrink: 0;
  }

  .settings-no-results {
    width: 100%;
    padding: 10px 12px;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-dim);
    font-size: var(--font-size-sm);
  }

  .settings-actions {
    display: flex;
    align-items: center;
    justify-content: stretch;
    gap: var(--space-4);
    margin-top: var(--space-6);
  }

  .secondary-btn {
    background: transparent;
    color: var(--color-text-secondary);
    border: none;
    padding: var(--space-2) 0;
    font: inherit;
    cursor: pointer;
  }

  .settings-lock-status {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-elevated) 82%, transparent);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .settings-lock-form {
    display: grid;
    gap: var(--space-2);
  }

  .settings-lock-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: var(--space-3);
  }

  .settings-lock-field {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .settings-lock-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .settings-lock-input {
    width: 100%;
    min-height: 40px;
    padding: 10px 12px;
    box-sizing: border-box;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface-elevated);
    color: var(--color-text-primary);
    font: inherit;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
    text-align: center;
    outline: none;
    transition: border-color var(--transition-base);
  }

  .settings-lock-input:focus {
    border-color: color-mix(in srgb, var(--color-accent) 70%, transparent);
  }

  .settings-lock-input::placeholder {
    color: var(--color-text-dim);
  }

  .settings-lock-hidden-user {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .settings-lock-error {
    margin: 0;
    color: #ff9b9b;
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .settings-lock-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .settings-lock-action-btn {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-elevated) 82%, transparent);
    color: var(--color-text-primary);
  }

  .settings-lock-action-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .primary-btn {
    width: 100%;
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--color-accent) 32%, transparent);
    border-radius: var(--radius-md);
    padding: 12px 18px;
    background: var(--color-accent);
    color: #0d0d0d;
    font: inherit;
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    box-shadow: none;
    transition: transform var(--transition-fast), border-color var(--transition-base), background var(--transition-base), color var(--transition-base);
  }

  .primary-btn:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--color-accent-bright) 42%, transparent);
    background: color-mix(in srgb, var(--color-accent) 88%, white 12%);
  }

  .primary-btn:active {
    transform: translateY(0);
    background: color-mix(in srgb, var(--color-accent) 94%, black 6%);
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
    animation: fade-in var(--motion-duration-fast) var(--motion-ease-out);
  }

  .confirm-dialog {
    width: min(100%, 360px);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    box-sizing: border-box;
    animation: rise-in var(--motion-duration-base) var(--motion-ease-soft) both;
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

  .confirm-actions .primary-btn {
    width: auto;
  }

  @media (min-width: 768px) {
    .settings-backdrop {
      align-items: center;
    }

    .settings-sheet {
      padding: var(--space-7);
    }
  }
`;

export class HomeView extends LocalizedElement {
  static properties = {
    _connectionMenuOpen:    { state: true },
    _disconnectConfirmOpen: { state: true },
    _activeRoomId:          { state: true },
    _draftActiveRoomSettings: { state: true },
    _draftMainRoutines:     { state: true },
    _mainTurnOffPickerOpen: { state: true },
    _mainTurnOffSearch:     { state: true },
    _mainTurnOnPickerOpen:  { state: true },
    _mainTurnOnSearch:      { state: true },
    _draftSharedHiddenRoomIds: { state: true },
    _hiddenRoomIds:         { state: true },
    _homeConfig:            { state: true },
    _roomHiddenDevicePickerOpen: { state: true },
    _roomHiddenDeviceSearch: { state: true },
    _roomRoutinePickerOpen: { state: true },
    _roomRoutineSearch:     { state: true },
    _localHiddenRoomPickerOpen: { state: true },
    _localRoomSearch:       { state: true },
    _rooms:                 { state: true },
    _savingSharedSettings:  { state: true },
    _settingsTab:           { state: true },
    _scenes:                { state: true },
    _settingsOpen:          { state: true },
    _settingsPasswordConfigured: { state: true },
    _settingsPasswordDraft: { state: true },
    _settingsPasswordConfirmDraft: { state: true },
    _settingsPasswordError: { state: true },
    _settingsPasswordPromptOpen: { state: true },
    _settingsPasswordPromptValue: { state: true },
    _settingsPasswordPromptError: { state: true },
    _settingsPasswordSaving: { state: true },
    _sharedHiddenRoomPickerOpen: { state: true },
    _sharedRoomSearch:      { state: true },
    _sharedConfigEnabled:   { state: true },
    _syncing:               { state: true },
    _transitionRoomId:      { state: true },
  };

  static styles = homeViewStyles;

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this._authMode              = smartthings.authMode;
    this._connectionMenuOpen    = false;
    this._disconnectConfirmOpen = false;
    this._activeRoomId          = null;
    this._draftActiveRoomSettings = createRoomSettingsDraft(store.homeConfig);
    this._draftMainRoutines     = createMainRoutineDraft(store.homeConfig);
    this._mainTurnOffPickerOpen = false;
    this._mainTurnOffSearch     = '';
    this._mainTurnOnPickerOpen  = false;
    this._mainTurnOnSearch      = '';
    this._draftSharedHiddenRoomIds = createSharedHiddenRoomDraft(store.homeConfig);
    this._hiddenRoomIds         = this._loadHiddenRooms();
    this._homeConfig            = store.homeConfig;
    this._roomHiddenDevicePickerOpen = false;
    this._roomHiddenDeviceSearch = '';
    this._roomRoutinePickerOpen = false;
    this._roomRoutineSearch     = '';
    this._localHiddenRoomPickerOpen = false;
    this._localRoomSearch       = '';
    this._rooms                 = store.rooms;
    this._savingSharedSettings  = false;
    this._settingsTab           = 'device';
    this._scenes                = store.scenes;
    this._settingsOpen          = false;
    this._settingsPasswordConfigured = Boolean(readSettingsPasswordRecord());
    this._settingsPasswordDraft = '';
    this._settingsPasswordConfirmDraft = '';
    this._settingsPasswordError = '';
    this._settingsPasswordPromptOpen = false;
    this._settingsPasswordPromptValue = '';
    this._settingsPasswordPromptError = '';
    this._settingsPasswordSaving = false;
    this._sharedHiddenRoomPickerOpen = false;
    this._sharedRoomSearch      = '';
    this._sharedConfigEnabled   = store.sharedConfigEnabled;
    this._syncing               = false;
    this._transitionRoomId      = null;
    this._listScrollTop         = 0;
    this._swipeBackPointerId    = null;
    this._swipeBackStartX       = 0;
    this._swipeBackStartY       = 0;
    this._swipeBackLocked       = false;
    this._swipeBackActive       = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onUpdate   = (e) => {
      this._rooms = [...e.detail.rooms];
      this._homeConfig = e.detail.homeConfig;
      this._scenes = [...e.detail.scenes];
      this._sharedConfigEnabled = Boolean(e.detail.sharedConfigEnabled);
      this._syncLocalHiddenRoomsWithGlobal();

      if (!this._settingsOpen || !this._hasSharedSettingsChanges()) {
        this._draftMainRoutines = createMainRoutineDraft(e.detail.homeConfig);
        this._draftSharedHiddenRoomIds = createSharedHiddenRoomDraft(e.detail.homeConfig);
      }

      if (!this._settingsOpen || !this._hasActiveRoomSettingsChanges()) {
        this._draftActiveRoomSettings = createRoomSettingsDraft(e.detail.homeConfig, this._activeRoomId);
      }
    };
    this._onSyncing  = ()  => { this._syncing = true; };
    this._onSynced   = ()  => { this._syncing = false; };

    store.addEventListener('update',  this._onUpdate);
    store.addEventListener('syncing', this._onSyncing);
    store.addEventListener('synced',  this._onSynced);

    // Sync current state in case store already has data
    this._rooms = [...store.rooms];
    this._homeConfig = store.homeConfig;
    this._scenes = store.scenes;
    this._sharedConfigEnabled = store.sharedConfigEnabled;
    this._draftActiveRoomSettings = createRoomSettingsDraft(store.homeConfig, this._activeRoomId);
    this._draftMainRoutines = createMainRoutineDraft(store.homeConfig);
    this._draftSharedHiddenRoomIds = createSharedHiddenRoomDraft(store.homeConfig);
    this._syncLocalHiddenRoomsWithGlobal();
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

    if (changed.has('_settingsPasswordPromptOpen') && this._settingsPasswordPromptOpen) {
      const passwordInput = this.renderRoot.querySelector('.settings-lock-dialog .settings-lock-input');
      if (passwordInput) {
        passwordInput.focus();
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
      return normalizeRoomIds(hiddenRoomIds);
    } catch {
      return [];
    }
  }

  _saveHiddenRooms(hiddenRoomIds) {
    const nextHiddenRoomIds = this._sanitizeLocalHiddenRoomIds(hiddenRoomIds);
    this._hiddenRoomIds = nextHiddenRoomIds;
    if (this._activeRoomId && this._effectiveHiddenRoomIds.has(this._activeRoomId)) {
      this._activeRoomId = null;
    }
    try {
      localStorage.setItem(HIDDEN_ROOMS_KEY, JSON.stringify(nextHiddenRoomIds));
    } catch { /* storage unavailable — ignore */ }
  }

  async _toggleSettings() {
    if (this._settingsOpen) {
      void this._closeSettings();
      return;
    }

    if (this._settingsPasswordPromptOpen) {
      this._closeSettingsPasswordPrompt();
      return;
    }

    if (this._settingsPasswordConfigured) {
      this._settingsPasswordPromptValue = '';
      this._settingsPasswordPromptError = '';
      this._settingsPasswordPromptOpen = true;
      return;
    }

    await this._openSettings();
  }

  async _openSettings() {
    this._settingsPasswordDraft = '';
    this._settingsPasswordConfirmDraft = '';
    this._settingsPasswordError = '';

    this._draftActiveRoomSettings = createRoomSettingsDraft(this._homeConfig, this._activeRoomId);
    this._draftMainRoutines = createMainRoutineDraft(this._homeConfig);
    this._mainTurnOnPickerOpen = false;
    this._mainTurnOnSearch = '';
    this._mainTurnOffPickerOpen = false;
    this._mainTurnOffSearch = '';
    this._draftSharedHiddenRoomIds = createSharedHiddenRoomDraft(this._homeConfig);
    this._roomHiddenDevicePickerOpen = false;
    this._roomHiddenDeviceSearch = '';
    this._roomRoutinePickerOpen = false;
    this._roomRoutineSearch = '';
    this._localHiddenRoomPickerOpen = false;
    this._localRoomSearch = '';
    this._sharedHiddenRoomPickerOpen = false;
    this._sharedRoomSearch = '';
    this._settingsTab = this._activeRoomId && this._sharedConfigEnabled ? 'shared' : 'device';

    await this._runSettingsViewTransition(() => {
      this._settingsOpen = true;
    });

    if (this._sharedConfigEnabled) {
      try {
        await store.ensureSharedHomeData();
      } catch {
        // Keep the settings sheet open even if the refresh fails.
      }
    }
  }

  _closeSettingsPasswordPrompt() {
    this._settingsPasswordPromptOpen = false;
    this._settingsPasswordPromptValue = '';
    this._settingsPasswordPromptError = '';
  }

  _onSettingsPasswordDraftInput(e) {
    this._settingsPasswordDraft = normalizeSettingsPin(e.target.value);
    e.target.value = this._settingsPasswordDraft;
    this._settingsPasswordError = '';
  }

  _onSettingsPasswordConfirmDraftInput(e) {
    this._settingsPasswordConfirmDraft = normalizeSettingsPin(e.target.value);
    e.target.value = this._settingsPasswordConfirmDraft;
    this._settingsPasswordError = '';
  }

  _onSettingsPasswordPromptInput(e) {
    this._settingsPasswordPromptValue = normalizeSettingsPin(e.target.value);
    e.target.value = this._settingsPasswordPromptValue;
    this._settingsPasswordPromptError = '';
  }

  _onSettingsPasswordPromptKeyDown(e) {
    if (e.key === 'Escape') {
      this._closeSettingsPasswordPrompt();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      void this._unlockSettings();
    }
  }

  _onSettingsPasswordSubmit(e) {
    e.preventDefault();
    void this._saveSettingsPassword();
  }

  _onSettingsPasswordPromptSubmit(e) {
    e.preventDefault();
    void this._unlockSettings();
  }

  async _unlockSettings() {
    const record = readSettingsPasswordRecord();
    if (!record) {
      this._settingsPasswordConfigured = false;
      this._closeSettingsPasswordPrompt();
      await this._openSettings();
      return;
    }

    if (!SETTINGS_PIN_PATTERN.test(this._settingsPasswordPromptValue)) {
      this._settingsPasswordPromptError = this.t('home.settingsLockErrors.format');
      return;
    }

    const matches = record.hash === await hashSettingsPassword(this._settingsPasswordPromptValue);
    if (!matches) {
      this._settingsPasswordPromptError = this.t('home.settingsLockErrors.invalid');
      return;
    }

    this._closeSettingsPasswordPrompt();
    await this._openSettings();
  }

  async _saveSettingsPassword() {
    const password = this._settingsPasswordDraft;
    const confirmation = this._settingsPasswordConfirmDraft;

    if (!password || !confirmation) {
      this._settingsPasswordError = this.t('home.settingsLockErrors.missing');
      return;
    }

    if (!SETTINGS_PIN_PATTERN.test(password) || !SETTINGS_PIN_PATTERN.test(confirmation)) {
      this._settingsPasswordError = this.t('home.settingsLockErrors.format');
      return;
    }

    if (password !== confirmation) {
      this._settingsPasswordError = this.t('home.settingsLockErrors.mismatch');
      return;
    }

    this._settingsPasswordSaving = true;
    this._settingsPasswordError = '';

    try {
      const success = writeSettingsPasswordRecord({
        hash: await hashSettingsPassword(password),
      });

      if (!success) {
        this._settingsPasswordError = this.t('home.settingsLockErrors.unavailable');
        return;
      }

      this._settingsPasswordConfigured = true;
      this._settingsPasswordDraft = '';
      this._settingsPasswordConfirmDraft = '';
    } finally {
      this._settingsPasswordSaving = false;
    }
  }

  _removeSettingsPassword() {
    const success = writeSettingsPasswordRecord(null);
    if (!success) {
      this._settingsPasswordError = this.t('home.settingsLockErrors.unavailable');
      return;
    }

    this._settingsPasswordConfigured = false;
    this._settingsPasswordDraft = '';
    this._settingsPasswordConfirmDraft = '';
    this._settingsPasswordError = '';
  }

  _onSettingsKeyDown(e) {
    if (e.key === 'Escape') {
      void this._closeSettings();
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

  _sanitizeLocalHiddenRoomIds(hiddenRoomIds) {
    const globalHiddenRoomIds = new Set(this._globalHiddenRoomIds);
    return normalizeRoomIds(hiddenRoomIds).filter(roomId => !globalHiddenRoomIds.has(roomId));
  }

  _syncLocalHiddenRoomsWithGlobal() {
    const nextHiddenRoomIds = this._sanitizeLocalHiddenRoomIds(this._hiddenRoomIds);
    if (!roomIdListsEqual(nextHiddenRoomIds, this._hiddenRoomIds)) {
      this._saveHiddenRooms(nextHiddenRoomIds);
    }
  }

  _onAddLocalHiddenRoom(e) {
    const roomId = e.currentTarget.dataset.itemId;
    const room = this._availableLocalHiddenRooms.find(candidate => candidate.id === roomId) ?? null;
    if (!room) {
      return;
    }

    this._saveHiddenRooms([...this._hiddenRoomIds, room.id]);
    this._localHiddenRoomPickerOpen = false;
    this._localRoomSearch = '';
  }

  _onRemoveLocalHiddenRoom(roomId) {
    this._saveHiddenRooms(this._hiddenRoomIds.filter(hiddenRoomId => hiddenRoomId !== roomId));
  }

  _onAddSharedHiddenRoom(e) {
    const roomId = e.currentTarget.dataset.itemId;
    const room = this._availableSharedHiddenRooms.find(candidate => candidate.id === roomId) ?? null;
    if (!room) {
      return;
    }

    this._draftSharedHiddenRoomIds = normalizeRoomIds([...this._draftSharedHiddenRoomIds, room.id]);
    this._saveHiddenRooms(this._hiddenRoomIds.filter(hiddenRoomId => hiddenRoomId !== room.id));
    this._sharedHiddenRoomPickerOpen = false;
    this._sharedRoomSearch = '';
  }

  _onRemoveSharedHiddenRoom(roomId) {
    this._draftSharedHiddenRoomIds = this._draftSharedHiddenRoomIds.filter(hiddenRoomId => hiddenRoomId !== roomId);
  }

  _onLocalRoomSearchInput(e) {
    this._localRoomSearch = e.target.value;
  }

  _onSharedRoomSearchInput(e) {
    this._sharedRoomSearch = e.target.value;
  }

  _onMainTurnOnSearchInput(e) {
    this._mainTurnOnSearch = e.target.value;
  }

  _onMainTurnOffSearchInput(e) {
    this._mainTurnOffSearch = e.target.value;
  }

  _onAddMainTurnOnRoutine(e) {
    const sceneId = e.currentTarget.dataset.itemId;
    if (!this._scenes.some(scene => scene.sceneId === sceneId)) {
      return;
    }

    this._draftMainRoutines = {
      ...this._draftMainRoutines,
      turnOnSceneId: sceneId,
    };
    this._mainTurnOnPickerOpen = false;
    this._mainTurnOnSearch = '';
  }

  _onAddMainTurnOffRoutine(e) {
    const sceneId = e.currentTarget.dataset.itemId;
    if (!this._scenes.some(scene => scene.sceneId === sceneId)) {
      return;
    }

    this._draftMainRoutines = {
      ...this._draftMainRoutines,
      turnOffSceneId: sceneId,
    };
    this._mainTurnOffPickerOpen = false;
    this._mainTurnOffSearch = '';
  }

  _onRemoveMainTurnOnRoutine() {
    this._draftMainRoutines = {
      ...this._draftMainRoutines,
      turnOnSceneId: null,
    };
  }

  _onRemoveMainTurnOffRoutine() {
    this._draftMainRoutines = {
      ...this._draftMainRoutines,
      turnOffSceneId: null,
    };
  }

  _onAddRoomHiddenDevice(e) {
    const lightId = e.currentTarget.dataset.itemId;
    const light = this._availableActiveRoomLights.find(candidate => candidate.id === lightId) ?? null;
    if (!light) {
      return;
    }

    this._draftActiveRoomSettings = {
      ...this._draftActiveRoomSettings,
      hiddenLightIds: normalizeStringIds([...this._draftActiveRoomSettings.hiddenLightIds, light.id]),
    };
    this._roomHiddenDevicePickerOpen = false;
    this._roomHiddenDeviceSearch = '';
  }

  _onRemoveRoomHiddenDevice(lightId) {
    this._draftActiveRoomSettings = {
      ...this._draftActiveRoomSettings,
      hiddenLightIds: this._draftActiveRoomSettings.hiddenLightIds.filter(hiddenLightId => hiddenLightId !== lightId),
    };
  }

  _onAddRoomRoutine(e) {
    const sceneId = e.currentTarget.dataset.itemId;
    const scene = this._availableActiveRoomRoutines.find(candidate => candidate.id === sceneId) ?? null;
    if (!scene) {
      return;
    }

    this._draftActiveRoomSettings = {
      ...this._draftActiveRoomSettings,
      routineSceneIds: normalizeStringIds([...this._draftActiveRoomSettings.routineSceneIds, scene.id]),
    };
    this._roomRoutinePickerOpen = false;
    this._roomRoutineSearch = '';
  }

  _onRemoveRoomRoutine(sceneId) {
    this._draftActiveRoomSettings = {
      ...this._draftActiveRoomSettings,
      routineSceneIds: this._draftActiveRoomSettings.routineSceneIds.filter(routineSceneId => routineSceneId !== sceneId),
    };
  }

  _onRoomHiddenDeviceSearchInput(e) {
    this._roomHiddenDeviceSearch = e.target.value;
  }

  _onRoomRoutineSearchInput(e) {
    this._roomRoutineSearch = e.target.value;
  }

  _toggleSharedHiddenRoomPicker() {
    this._sharedHiddenRoomPickerOpen = !this._sharedHiddenRoomPickerOpen;
    if (!this._sharedHiddenRoomPickerOpen) {
      this._sharedRoomSearch = '';
    }
  }

  _toggleLocalHiddenRoomPicker() {
    this._localHiddenRoomPickerOpen = !this._localHiddenRoomPickerOpen;
    if (!this._localHiddenRoomPickerOpen) {
      this._localRoomSearch = '';
    }
  }

  _toggleRoomHiddenDevicePicker() {
    this._roomHiddenDevicePickerOpen = !this._roomHiddenDevicePickerOpen;
    if (!this._roomHiddenDevicePickerOpen) {
      this._roomHiddenDeviceSearch = '';
    }
  }

  _toggleRoomRoutinePicker() {
    this._roomRoutinePickerOpen = !this._roomRoutinePickerOpen;
    if (!this._roomRoutinePickerOpen) {
      this._roomRoutineSearch = '';
    }
  }

  _toggleMainTurnOnPicker() {
    this._mainTurnOnPickerOpen = !this._mainTurnOnPickerOpen;
    if (!this._mainTurnOnPickerOpen) {
      this._mainTurnOnSearch = '';
    }
  }

  _toggleMainTurnOffPicker() {
    this._mainTurnOffPickerOpen = !this._mainTurnOffPickerOpen;
    if (!this._mainTurnOffPickerOpen) {
      this._mainTurnOffSearch = '';
    }
  }

  _filterRoomsBySearch(rooms, query) {
    const normalizedQuery = typeof query === 'string' ? query.trim().toLocaleLowerCase() : '';
    if (!normalizedQuery) {
      return rooms.slice(0, 8);
    }

    return rooms
      .filter(room => room.name.toLocaleLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }

  async _runSettingsViewTransition(update) {
    const startViewTransition = document.startViewTransition?.bind(document);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reducedMotion) {
      update();
      await this.updateComplete;
      return;
    }

    const transition = startViewTransition(async () => {
      update();
      await this.updateComplete;
    });

    await transition.finished;
  }

  _setSettingsTab(tab) {
    if (this._settingsTab === tab) {
      return;
    }

    void this._runSettingsViewTransition(() => {
      this._settingsTab = tab;
    });
  }

  _renderSettingsTabs() {
    const tabs = [
      { id: 'device', label: this.t('home.settingsTabDevice') },
      ...(this._sharedConfigEnabled ? [{ id: 'shared', label: this.t('home.settingsTabShared') }] : []),
      { id: 'connection', label: this.t('home.settingsTabConnection') },
    ];

    return html`
      <div class="settings-tabs" role="tablist" aria-label=${this.t('home.settingsTabsLabel')}>
        ${tabs.map(tab => html`
          <button
            class="settings-tab ${this._settingsTab === tab.id ? 'active' : ''}"
            type="button"
            role="tab"
            aria-selected=${String(this._settingsTab === tab.id)}
            @click=${() => this._setSettingsTab(tab.id)}
          >
            ${tab.label}
          </button>
        `)}
      </div>
    `;
  }

  _renderSettingsPicker({
    label,
    placeholder,
    selectedItems,
    emptyText,
    query,
    items,
    open,
    onToggle,
    onInput,
    onPick,
    onRemove,
    emptyKey,
    disabled = false,
    removeLabel,
  }) {
    const showSearch = items.length > 8;
    const filteredItems = showSearch ? this._filterRoomsBySearch(items, query) : items;
    const canExpand = items.length > 0;

    return html`
      <div class="settings-picker">
        <div class="settings-select-shell ${open ? 'open' : ''}">
          <div class="settings-select-surface">
            <div class="settings-select-values">
              ${selectedItems.length > 0
                ? selectedItems.map(item => html`
                    <div class="settings-pill settings-select-tag">
                      <span>${item.name}</span>
                      <button
                        type="button"
                        ?disabled=${disabled}
                        @click=${() => onRemove(item.id)}
                        aria-label=${removeLabel(item)}
                      >
                        <span class="material-symbols" aria-hidden="true">close</span>
                      </button>
                    </div>
                  `)
                : html`<span class="settings-select-placeholder">${emptyText}</span>`}
            </div>
            <button
              class="settings-select-toggle"
              type="button"
              aria-label=${label}
              aria-expanded=${String(open)}
              ?disabled=${disabled || !canExpand}
              @click=${onToggle}
            >
              <span class="material-symbols" aria-hidden="true">${open ? 'expand_less' : 'expand_more'}</span>
            </button>
          </div>

        ${open && canExpand ? html`
          <div class="settings-add-row">
            ${showSearch ? html`
              <div class="settings-search-row">
                <span class="material-symbols" aria-hidden="true">search</span>
                <input
                  class="settings-search"
                  .value=${query}
                  placeholder=${placeholder}
                  aria-label=${label}
                  autocomplete="off"
                  @input=${onInput}
                />
              </div>
            ` : ''}

            <div class="settings-search-results">
              ${filteredItems.length > 0
                ? filteredItems.map(item => html`
                    <button
                      class="settings-search-result"
                      type="button"
                      ?disabled=${disabled}
                      data-item-id=${item.id}
                      @click=${onPick}
                    >
                      <span class="settings-search-result-label">${item.name}</span>
                      <span class="settings-search-result-action" aria-hidden="true">
                        <span class="material-symbols">add</span>
                      </span>
                    </button>
                  `)
                : html`<div class="settings-no-results">${this.t(emptyKey)}</div>`}
            </div>
          </div>
        ` : ''}
        </div>
      </div>
    `;
  }

  _hasSharedSettingsChanges() {
    const current = createMainRoutineDraft(this._homeConfig);
    return current.turnOnSceneId !== this._draftMainRoutines.turnOnSceneId
      || current.turnOffSceneId !== this._draftMainRoutines.turnOffSceneId
      || !roomIdListsEqual(this._globalHiddenRoomIds, this._draftSharedHiddenRoomIds);
  }

  _hasActiveRoomSettingsChanges() {
    if (!this._activeRoomId) {
      return false;
    }

    const current = createRoomSettingsDraft(this._homeConfig, this._activeRoomId);
    return !roomIdListsEqual(current.hiddenLightIds, this._draftActiveRoomSettings.hiddenLightIds)
      || !roomIdListsEqual(current.routineSceneIds, this._draftActiveRoomSettings.routineSceneIds);
  }

  async _closeSettings() {
    await this._runSettingsViewTransition(() => {
      this._settingsOpen = false;
      this._connectionMenuOpen = false;
      this._disconnectConfirmOpen = false;
      this._mainTurnOnPickerOpen = false;
      this._mainTurnOffPickerOpen = false;
      this._roomHiddenDevicePickerOpen = false;
      this._roomRoutinePickerOpen = false;
      this._localHiddenRoomPickerOpen = false;
      this._sharedHiddenRoomPickerOpen = false;
    });

    if (this._activeRoomId) {
      await this._persistActiveRoomSettingsIfNeeded();
      return;
    }

    await this._persistSharedSettingsIfNeeded();
  }

  async _persistActiveRoomSettingsIfNeeded() {
    if (!this._sharedConfigEnabled || !this._activeRoomId || !this._hasActiveRoomSettingsChanges()) {
      return;
    }

    this._savingSharedSettings = true;

    try {
      await store.updateRoomSettings(this._activeRoomId, this._draftActiveRoomSettings);
    } catch {
      this._draftActiveRoomSettings = createRoomSettingsDraft(this._homeConfig, this._activeRoomId);
      toasts.show({
        tone: 'error',
        titleKey: 'home.toasts.roomSettingsErrorTitle',
        descriptionKey: 'home.toasts.roomSettingsErrorDescription',
      });
    } finally {
      this._savingSharedSettings = false;
    }
  }

  async _persistSharedSettingsIfNeeded() {
    if (!this._sharedConfigEnabled || !this._hasSharedSettingsChanges()) {
      return;
    }

    this._savingSharedSettings = true;

    try {
      await store.updateSharedSettings({
        mainRoutines: this._draftMainRoutines,
        hiddenRoomIds: this._draftSharedHiddenRoomIds,
      });
    } catch {
      this._draftMainRoutines = createMainRoutineDraft(this._homeConfig);
      this._draftSharedHiddenRoomIds = createSharedHiddenRoomDraft(this._homeConfig);
      toasts.show({
        tone: 'error',
        titleKey: 'home.toasts.sharedConfigErrorTitle',
        descriptionKey: 'home.toasts.sharedConfigErrorDescription',
      });
    } finally {
      this._savingSharedSettings = false;
    }
  }

  _onMainRoutineChange(e) {
    const field = e.target.name;

    if (!['turnOnSceneId', 'turnOffSceneId'].includes(field)) {
      return;
    }

    this._draftMainRoutines = {
      ...this._draftMainRoutines,
      [field]: e.target.value || null,
    };
  }

  _selectedScene(sceneId) {
    return this._scenes.find(scene => scene.sceneId === sceneId) ?? null;
  }

  async _executeMainRoutine(type) {
    try {
      await store.executeMainRoutine(type);
    } catch {
      toasts.show({
        tone: 'error',
        titleKey: 'home.toasts.mainRoutineErrorTitle',
        descriptionKey: 'home.toasts.mainRoutineErrorDescription',
      });
    }
  }

  async _executeRoomRoutine(sceneId) {
    try {
      await store.executeRoomRoutine(sceneId);
    } catch {
      toasts.show({
        tone: 'error',
        titleKey: 'home.toasts.mainRoutineErrorTitle',
        descriptionKey: 'home.toasts.mainRoutineErrorDescription',
      });
    }
  }

  _roomSettings(roomId) {
    return createRoomSettingsDraft(this._homeConfig, roomId);
  }

  async _openRoom(e) {
    const roomId = e.detail?.roomId;
    if (!roomId) return;

    this._listScrollTop = window.scrollY;

    await this._runRoomViewTransition(roomId, () => {
      this._activeRoomId = roomId;
    }, 0);
  }

  async _closeRoom() {
    const roomId = this._activeRoomId;
    if (!roomId) return;

    const restoreScrollTop = this._listScrollTop;

    await this._runRoomViewTransition(roomId, () => {
      this._activeRoomId = null;
    }, restoreScrollTop);
  }

  _resetSwipeBackGesture() {
    this._swipeBackPointerId = null;
    this._swipeBackStartX = 0;
    this._swipeBackStartY = 0;
    this._swipeBackLocked = false;
    this._swipeBackActive = false;
  }

  _onRoomDetailPointerDown(e) {
    if (!this._activeRoomId || this._settingsOpen || e.button !== 0 || this._swipeBackPointerId !== null) {
      return;
    }

    if (e.clientX > SWIPE_BACK_EDGE_PX) {
      return;
    }

    const path = e.composedPath();
    const startedFromInteractiveControl = path.some(target => {
      if (!(target instanceof Element)) {
        return false;
      }

      const tagName = target.tagName?.toLowerCase();
      return tagName === 'button'
        || tagName === 'input'
        || tagName === 'select'
        || tagName === 'textarea'
        || tagName === 'dimmer-slider';
    });

    if (startedFromInteractiveControl) {
      return;
    }

    this._swipeBackPointerId = e.pointerId;
    this._swipeBackStartX = e.clientX;
    this._swipeBackStartY = e.clientY;
    this._swipeBackLocked = false;
    this._swipeBackActive = false;
  }

  _onRoomDetailPointerMove(e) {
    if (this._swipeBackPointerId !== e.pointerId || this._swipeBackLocked) {
      return;
    }

    const deltaX = e.clientX - this._swipeBackStartX;
    const deltaY = Math.abs(e.clientY - this._swipeBackStartY);

    if (deltaX <= 0) {
      if (deltaY > SWIPE_BACK_EDGE_PX) {
        this._swipeBackLocked = true;
      }
      return;
    }

    if (deltaX > deltaY * SWIPE_BACK_LOCK_RATIO) {
      this._swipeBackActive = true;
      return;
    }

    if (deltaY > deltaX) {
      this._swipeBackLocked = true;
    }
  }

  async _onRoomDetailPointerEnd(e) {
    if (this._swipeBackPointerId !== e.pointerId) {
      return;
    }

    const deltaX = e.clientX - this._swipeBackStartX;
    const shouldClose = this._swipeBackActive && deltaX >= SWIPE_BACK_TRIGGER_PX;
    this._resetSwipeBackGesture();

    if (shouldClose) {
      await this._closeRoom();
    }
  }

  async _runRoomViewTransition(roomId, update, scrollTop) {
    const startViewTransition = document.startViewTransition?.bind(document);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!startViewTransition || reducedMotion) {
      update();
      await this.updateComplete;
      await this._awaitRoomCardUpdates();
      this._setScrollTop(scrollTop);
      return;
    }

    this._transitionRoomId = roomId;
    await this.updateComplete;
    await this._awaitRoomCardUpdates();

    const transition = startViewTransition(async () => {
      update();
      await this.updateComplete;
      await this._awaitRoomCardUpdates();
      this._setScrollTop(scrollTop);
    });

    try {
      await transition.finished;
    } finally {
      this._transitionRoomId = null;
    }
  }

  _setScrollTop(scrollTop) {
    window.scrollTo(0, scrollTop);
  }

  async _awaitRoomCardUpdates() {
    const roomCards = [...this.renderRoot.querySelectorAll('room-card')];
    await Promise.all(roomCards.map(card => card.updateComplete ?? Promise.resolve()));
  }

  _roomTransitionName(roomId) {
    return this._transitionRoomId === roomId ? 'active-room-card' : 'none';
  }

  _titleTransitionName() {
    return this._transitionRoomId ? 'none' : 'page-title';
  }

  _headerTransitionName() {
    return this._transitionRoomId ? 'home-header' : 'none';
  }

  get _globalHiddenRoomIds() {
    return normalizeRoomIds(this._homeConfig?.hiddenRoomIds ?? []);
  }

  get _effectiveHiddenRoomIds() {
    return new Set([...this._globalHiddenRoomIds, ...this._hiddenRoomIds]);
  }

  get _availableLocalHiddenRooms() {
    const unavailableRoomIds = this._effectiveHiddenRoomIds;
    return this._rooms.filter(room => !unavailableRoomIds.has(room.id));
  }

  get _availableSharedHiddenRooms() {
    const unavailableRoomIds = new Set(this._draftSharedHiddenRoomIds);
    return this._rooms.filter(room => !unavailableRoomIds.has(room.id));
  }

  get _visibleRooms() {
    const hidden = this._effectiveHiddenRoomIds;
    return this._rooms.filter(room => !hidden.has(room.id));
  }

  _roomWithVisibleLights(room) {
    if (!room) {
      return null;
    }

    const hiddenLightIds = new Set(this._roomSettings(room.id).hiddenLightIds);
    return {
      ...room,
      lights: room.lights.filter(light => !hiddenLightIds.has(light.id)),
    };
  }

  get _activeRoom() {
    const room = this._visibleRooms.find(candidate => candidate.id === this._activeRoomId) ?? null;
    return this._roomWithVisibleLights(room);
  }

  get _activeRoomSource() {
    return this._visibleRooms.find(room => room.id === this._activeRoomId) ?? null;
  }

  get _availableActiveRoomLights() {
    const room = this._activeRoomSource;
    if (!room) {
      return [];
    }

    const hiddenLightIds = new Set(this._draftActiveRoomSettings.hiddenLightIds);
    return room.lights.filter(light => !hiddenLightIds.has(light.id));
  }

  get _availableActiveRoomRoutines() {
    const selectedRoutineIds = new Set(this._draftActiveRoomSettings.routineSceneIds);
    return this._scenes
      .filter(scene => !selectedRoutineIds.has(scene.sceneId))
      .map(scene => ({ id: scene.sceneId, name: scene.sceneName }));
  }

  _connectionCopyKey(baseKey) {
    return this._authMode === 'oauth'
      ? `home.oauth${baseKey}`
      : `home.${baseKey.charAt(0).toLowerCase()}${baseKey.slice(1)}`;
  }

  render() {
    const visibleRooms = this._visibleRooms;
    const activeRoom = this._activeRoom;
    const settingsLabel = this._settingsOpen
      ? this.t('home.closeSettings')
      : this.t('home.openSettings');

    return html`
      <style>${homeViewStyles.cssText}</style>
      <header style=${`view-transition-name: ${this._headerTransitionName()};`}>
        <div class="header-inner">
          <div class="header-title ${activeRoom ? 'room-active' : ''}">
            <div class="header-nav-slot">
              ${activeRoom ? html`
                <button class="icon-btn" @click=${this._closeRoom} aria-label=${this.t('home.backToRooms')}>
                  <span class="material-symbols" aria-hidden="true">arrow_back_ios_new</span>
                </button>
              ` : ''}
            </div>
            <h1 style=${`view-transition-name: ${this._titleTransitionName()};`}>${activeRoom?.name ?? this.t('home.title')}</h1>
          </div>
          <div class="header-actions">
            ${!activeRoom ? this._renderMainRoutines() : ''}
            <div class="sync-dot ${this._syncing ? 'active' : ''}"></div>
            <button class="icon-btn" @click=${this._toggleSettings} aria-label=${settingsLabel}>
              <span class="material-symbols" aria-hidden="true">settings</span>
            </button>
          </div>
        </div>
      </header>

      ${activeRoom
        ? html`
            <div
              class="room-detail"
              @pointerdown=${this._onRoomDetailPointerDown}
              @pointermove=${this._onRoomDetailPointerMove}
              @pointerup=${this._onRoomDetailPointerEnd}
              @pointercancel=${this._onRoomDetailPointerEnd}
            >
              ${this._renderActiveRoomActions(activeRoom)}
              <room-card
                .room=${activeRoom}
                detail-view
                .transitionName=${this._roomTransitionName(activeRoom.id)}
              ></room-card>
            </div>
          `
        : visibleRooms.length > 0
          ? html`
                <div class="rooms">
                  ${visibleRooms.map(room => html`
                    <room-card
                      .room=${this._roomWithVisibleLights(room)}
                      .transitionName=${this._roomTransitionName(room.id)}
                      @open-room=${this._openRoom}
                    ></room-card>
                  `)}
                </div>
            `
          : this._renderEmpty()}

      ${this._settingsOpen ? this._renderSettings() : ''}
      ${this._settingsPasswordPromptOpen ? this._renderSettingsPasswordPrompt() : ''}
      ${this._disconnectConfirmOpen ? this._renderDisconnectConfirm() : ''}
    `;
  }

  _renderMainRoutines() {
    const turnOnScene = this._selectedScene(this._homeConfig?.mainRoutines?.turnOnSceneId);
    const turnOffScene = this._selectedScene(this._homeConfig?.mainRoutines?.turnOffSceneId);

    if (!turnOnScene && !turnOffScene) {
      return html``;
    }

    return html`
      <div class="header-main-routines">
        ${turnOnScene ? html`
          <button
            class="main-routine-btn"
            type="button"
            @click=${() => this._executeMainRoutine('turnOn')}
            aria-label=${`${this.t('home.mainTurnOnAction')}: ${turnOnScene.sceneName}`}
            title=${turnOnScene.sceneName}
          >
            <span class="material-symbols" aria-hidden="true">lightbulb</span>
          </button>
        ` : ''}
        ${turnOffScene ? html`
          <button
            class="main-routine-btn"
            type="button"
            @click=${() => this._executeMainRoutine('turnOff')}
            aria-label=${`${this.t('home.mainTurnOffAction')}: ${turnOffScene.sceneName}`}
            title=${turnOffScene.sceneName}
          >
            <span class="material-symbols" aria-hidden="true">light_off</span>
          </button>
        ` : ''}
      </div>
    `;
  }

  _renderActiveRoomActions(room) {
    const sourceRoom = this._activeRoomSource;
    const roomSettings = this._roomSettings(room.id);
    const routineScenes = roomSettings.routineSceneIds
      .map(sceneId => this._selectedScene(sceneId))
      .filter(Boolean);

    if (!sourceRoom) {
      return html``;
    }

    const actions = routineScenes.map(scene => ({
        id: scene.sceneId,
        icon: 'auto_awesome',
        label: scene.sceneName,
        onClick: () => this._executeRoomRoutine(scene.sceneId),
      }));

    if (!actions.length) {
      return html``;
    }

    return html`
      <div class="room-actions" aria-label=${this.t('home.roomActionsLabel', { name: room.name })}>
        ${actions.map(action => html`
          <button class="room-action" type="button" @click=${action.onClick} aria-label=${action.label}>
            <span class="material-symbols" aria-hidden="true">${action.icon}</span>
            <span class="room-action-label">${action.label}</span>
          </button>
        `)}
      </div>
    `;
  }

  _renderEmpty() {
    const hasRooms = this._rooms.length > 0;
    return html`
      <div class="empty">
        <span class="empty-icon" aria-hidden="true">home</span>
        <h2>${hasRooms ? this.t('home.allRoomsHidden') : this.t('home.setupTitle')}</h2>
        <p>${hasRooms
          ? this.t('home.allRoomsHiddenDescription')
          : this.t('home.setupDescription')}</p>
      </div>
    `;
  }

  _renderSettings() {
    if (this._activeRoom && this._sharedConfigEnabled) {
      return this._renderActiveRoomSettings();
    }

    const turnOnScene = this._selectedScene(this._draftMainRoutines.turnOnSceneId);
    const turnOffScene = this._selectedScene(this._draftMainRoutines.turnOffSceneId);
    const localHiddenRooms = this._rooms.filter(room => this._hiddenRoomIds.includes(room.id));
    const sharedHiddenRooms = this._rooms.filter(room => this._draftSharedHiddenRoomIds.includes(room.id));
    const availableLocalHiddenRooms = this._availableLocalHiddenRooms;
    const availableSharedHiddenRooms = this._availableSharedHiddenRooms;

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
          ${this._renderSettingsTabs()}

          ${this._settingsTab === 'device' ? html`
            <section class="settings-panel">
              <div class="settings-group">
                <div class="settings-group-body">
                  <div class="settings-subsection">
                    <div class="settings-section-copy">
                      <h3>${this.t('home.settingsLockTitle')}</h3>
                      <p>${this.t('home.settingsLockDescription')}</p>
                    </div>

                    <form class="settings-lock-form" @submit=${this._onSettingsPasswordSubmit}>
                      <input
                        class="settings-lock-hidden-user"
                        type="text"
                        tabindex="-1"
                        autocomplete="username"
                        .value=${this.t('app.title')}
                        aria-hidden="true"
                      />
                      <p class="settings-lock-status">
                        ${this.t(this._settingsPasswordConfigured
                          ? 'home.settingsLockEnabled'
                          : 'home.settingsLockDisabled')}
                      </p>

                      <div class="settings-lock-fields">
                        <label class="settings-lock-field">
                          <span class="settings-lock-label">${this.t('home.settingsLockPasswordLabel')}</span>
                          <input
                            class="settings-lock-input"
                            type="password"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            maxlength="4"
                            placeholder="0000"
                            .value=${this._settingsPasswordDraft}
                            autocomplete="new-password"
                            @input=${this._onSettingsPasswordDraftInput}
                          />
                        </label>

                        <label class="settings-lock-field">
                          <span class="settings-lock-label">${this.t('home.settingsLockConfirmLabel')}</span>
                          <input
                            class="settings-lock-input"
                            type="password"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            maxlength="4"
                            placeholder="0000"
                            .value=${this._settingsPasswordConfirmDraft}
                            autocomplete="new-password"
                            @input=${this._onSettingsPasswordConfirmDraftInput}
                          />
                        </label>
                      </div>

                      ${this._settingsPasswordError ? html`
                        <p class="settings-lock-error" role="alert">${this._settingsPasswordError}</p>
                      ` : ''}

                      <div class="settings-lock-actions">
                        ${this._settingsPasswordConfigured ? html`
                          <button
                            class="secondary-btn settings-lock-action-btn"
                            type="button"
                            ?disabled=${this._settingsPasswordSaving}
                            @click=${this._removeSettingsPassword}
                          >
                            ${this.t('home.settingsLockRemoveAction')}
                          </button>
                        ` : ''}
                        <button
                          class="secondary-btn settings-lock-action-btn"
                          type="submit"
                          ?disabled=${this._settingsPasswordSaving}
                        >
                          ${this.t(this._settingsPasswordConfigured
                            ? 'home.settingsLockUpdateAction'
                            : 'home.settingsLockSaveAction')}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>

              <div class="settings-group">
                ${this._rooms.length === 0
                  ? html`<div class="settings-empty">${this.t('home.settingsEmpty')}</div>`
                  : html`
                      <div class="settings-group-body">
                        <div class="settings-subsection">
                          <div class="settings-section-copy">
                            <h3>${this.t('home.localHiddenRoomsTitle')}</h3>
                            <p>${this.t('home.localHiddenRoomsDescription')}</p>
                          </div>

                          ${this._renderSettingsPicker({
                            label: this.t('home.addHiddenRoom'),
                            placeholder: this.t('home.searchHiddenRoomPlaceholder'),
                            selectedItems: localHiddenRooms,
                            emptyText: this.t('home.localHiddenRoomsEmpty'),
                            query: this._localRoomSearch,
                            open: this._localHiddenRoomPickerOpen,
                            items: availableLocalHiddenRooms,
                            onToggle: this._toggleLocalHiddenRoomPicker,
                            onInput: this._onLocalRoomSearchInput,
                            onPick: this._onAddLocalHiddenRoom,
                            onRemove: roomId => this._onRemoveLocalHiddenRoom(roomId),
                            emptyKey: 'home.hiddenRoomSearchEmpty',
                            removeLabel: room => this.t('home.removeHiddenRoom', { name: room.name }),
                          })}
                        </div>
                      </div>
                    `}
              </div>
            </section>
          ` : ''}

          ${this._settingsTab === 'shared' && this._sharedConfigEnabled ? html`
            <section class="settings-panel">
              <div class="settings-group">
                <div class="settings-section-copy">
                  <h3>${this.t('home.sharedSettingsTitle')}</h3>
                  <p>${this.t('home.sharedSettingsDescription')}</p>
                </div>

                <div class="settings-group-body">
                  ${this._scenes.length === 0
                    ? html`<div class="settings-empty">${this.t('home.sharedSettingsEmpty')}</div>`
                    : html`
                        <div class="settings-list">
                          <div class="settings-subsection">
                            <div class="settings-section-copy">
                              <h3>${this.t('home.mainTurnOnLabel')}</h3>
                            </div>
                            ${this._renderSettingsPicker({
                              label: this.t('home.mainTurnOnLabel'),
                              placeholder: this.t('home.searchRoomRoutinePlaceholder'),
                              selectedItems: turnOnScene ? [{ id: turnOnScene.sceneId, name: turnOnScene.sceneName }] : [],
                              emptyText: this.t('home.unassignedRoutine'),
                              query: this._mainTurnOnSearch,
                              open: this._mainTurnOnPickerOpen,
                              items: this._scenes
                                .filter(scene => scene.sceneId !== turnOnScene?.sceneId)
                                .map(scene => ({ id: scene.sceneId, name: scene.sceneName })),
                              onToggle: this._toggleMainTurnOnPicker,
                              onInput: this._onMainTurnOnSearchInput,
                              onPick: this._onAddMainTurnOnRoutine,
                              onRemove: () => this._onRemoveMainTurnOnRoutine(),
                              emptyKey: 'home.roomRoutineSearchEmpty',
                              disabled: this._savingSharedSettings,
                              removeLabel: scene => this.t('home.removeAssignedRoutine', { name: scene.name }),
                            })}
                          </div>

                          <div class="settings-subsection">
                            <div class="settings-section-copy">
                              <h3>${this.t('home.mainTurnOffLabel')}</h3>
                            </div>
                            ${this._renderSettingsPicker({
                              label: this.t('home.mainTurnOffLabel'),
                              placeholder: this.t('home.searchRoomRoutinePlaceholder'),
                              selectedItems: turnOffScene ? [{ id: turnOffScene.sceneId, name: turnOffScene.sceneName }] : [],
                              emptyText: this.t('home.unassignedRoutine'),
                              query: this._mainTurnOffSearch,
                              open: this._mainTurnOffPickerOpen,
                              items: this._scenes
                                .filter(scene => scene.sceneId !== turnOffScene?.sceneId)
                                .map(scene => ({ id: scene.sceneId, name: scene.sceneName })),
                              onToggle: this._toggleMainTurnOffPicker,
                              onInput: this._onMainTurnOffSearchInput,
                              onPick: this._onAddMainTurnOffRoutine,
                              onRemove: () => this._onRemoveMainTurnOffRoutine(),
                              emptyKey: 'home.roomRoutineSearchEmpty',
                              disabled: this._savingSharedSettings,
                              removeLabel: scene => this.t('home.removeAssignedRoutine', { name: scene.name }),
                            })}
                          </div>
                        </div>
                      `}
                </div>
              </div>

              ${this._rooms.length === 0
                ? html``
                : html`
                    <div class="settings-group">
                      <div class="settings-section-copy">
                        <h3>${this.t('home.sharedHiddenRoomsTitle')}</h3>
                        <p>${this.t('home.sharedHiddenRoomsDescription')}</p>
                      </div>

                      <div class="settings-group-body">
                        ${this._renderSettingsPicker({
                          label: this.t('home.addHiddenRoom'),
                          placeholder: this.t('home.searchHiddenRoomPlaceholder'),
                          selectedItems: sharedHiddenRooms,
                          emptyText: this.t('home.sharedHiddenRoomsEmpty'),
                          query: this._sharedRoomSearch,
                          open: this._sharedHiddenRoomPickerOpen,
                          items: availableSharedHiddenRooms,
                          onToggle: this._toggleSharedHiddenRoomPicker,
                          onInput: this._onSharedRoomSearchInput,
                          onPick: this._onAddSharedHiddenRoom,
                          onRemove: roomId => this._onRemoveSharedHiddenRoom(roomId),
                          emptyKey: 'home.hiddenRoomSearchEmpty',
                          disabled: this._savingSharedSettings,
                          removeLabel: room => this.t('home.removeHiddenRoom', { name: room.name }),
                        })}
                      </div>
                    </div>
                  `}
            </section>
          ` : ''}

          ${this._settingsTab === 'connection' ? html`
            <section class="settings-panel">
              <div class="settings-group">
                <div class="settings-section-copy">
                  <h3>${this.t('home.connection')}</h3>
                  <p>${this.t(this._connectionCopyKey('DisconnectDescription'))}</p>
                </div>
                <div class="settings-group-body">
                  <div class="connection-panel">
                    <button class="disconnect-btn" @click=${this._openDisconnectConfirm}>${this.t(this._connectionCopyKey('DisconnectAction'))}</button>
                  </div>
                </div>
              </div>
            </section>
          ` : ''}

          ${this._settingsTab !== 'connection' ? html`
            <div class="settings-actions">
              <button class="primary-btn" @click=${this._toggleSettings}>${this.t('common.save')}</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderActiveRoomSettings() {
    const activeRoom = this._activeRoomSource;
    if (!activeRoom) {
      return html``;
    }

    const hiddenLightIds = new Set(this._draftActiveRoomSettings.hiddenLightIds);
    const hiddenLights = activeRoom.lights
      .filter(light => hiddenLightIds.has(light.id))
      .map(light => ({ id: light.id, name: light.name }));
    const roomRoutines = this._draftActiveRoomSettings.routineSceneIds
      .map(sceneId => this._selectedScene(sceneId))
      .filter(Boolean)
      .map(scene => ({ id: scene.sceneId, name: scene.sceneName }));

    return html`
      <div class="settings-backdrop" @click=${this._toggleSettings}>
        <div
          class="settings-sheet"
          role="dialog"
          aria-modal="true"
          aria-label=${this.t('home.roomSettingsTitle', { name: activeRoom.name })}
          tabindex="-1"
          @click=${e => e.stopPropagation()}
          @keydown=${this._onSettingsKeyDown}
        >
          <h2>${this.t('home.roomSettingsTitle', { name: activeRoom.name })}</h2>
          <p>${this.t('home.roomSettingsDescription', { name: activeRoom.name })}</p>

          <section class="settings-panel">
            <div class="settings-group">
              <div class="settings-section-copy">
                <h3>${this.t('home.roomHiddenDevicesTitle')}</h3>
                <p>${this.t('home.roomHiddenDevicesDescription')}</p>
              </div>

              <div class="settings-group-body">
                ${this._renderSettingsPicker({
                  label: this.t('home.addHiddenDevice'),
                  placeholder: this.t('home.searchHiddenDevicePlaceholder'),
                  selectedItems: hiddenLights,
                  emptyText: this.t('home.roomHiddenDevicesEmpty'),
                  query: this._roomHiddenDeviceSearch,
                  open: this._roomHiddenDevicePickerOpen,
                  items: this._availableActiveRoomLights.map(light => ({ id: light.id, name: light.name })),
                  onToggle: this._toggleRoomHiddenDevicePicker,
                  onInput: this._onRoomHiddenDeviceSearchInput,
                  onPick: this._onAddRoomHiddenDevice,
                  onRemove: lightId => this._onRemoveRoomHiddenDevice(lightId),
                  emptyKey: 'home.hiddenDeviceSearchEmpty',
                  disabled: this._savingSharedSettings,
                  removeLabel: light => this.t('home.removeHiddenDevice', { name: light.name }),
                })}
              </div>
            </div>

            <div class="settings-group">
              <div class="settings-section-copy">
                <h3>${this.t('home.roomRoutinesTitle')}</h3>
                <p>${this.t('home.roomRoutinesDescription')}</p>
              </div>

              <div class="settings-group-body">
                ${this._scenes.length === 0
                  ? html`<div class="settings-empty">${this.t('home.sharedSettingsEmpty')}</div>`
                  : this._renderSettingsPicker({
                    label: this.t('home.addRoomRoutine'),
                    placeholder: this.t('home.searchRoomRoutinePlaceholder'),
                    selectedItems: roomRoutines,
                    emptyText: this.t('home.roomRoutinesEmpty'),
                    query: this._roomRoutineSearch,
                    open: this._roomRoutinePickerOpen,
                    items: this._availableActiveRoomRoutines,
                    onToggle: this._toggleRoomRoutinePicker,
                    onInput: this._onRoomRoutineSearchInput,
                    onPick: this._onAddRoomRoutine,
                    onRemove: sceneId => this._onRemoveRoomRoutine(sceneId),
                    emptyKey: 'home.roomRoutineSearchEmpty',
                    disabled: this._savingSharedSettings,
                    removeLabel: scene => this.t('home.removeRoomRoutine', { name: scene.name }),
                  })}
              </div>
            </div>
          </section>

          <div class="settings-actions">
            <button class="primary-btn" @click=${this._toggleSettings}>${this.t('common.save')}</button>
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
          aria-label=${this.t(this._connectionCopyKey('ConfirmDisconnectLabel'))}
          tabindex="-1"
          @click=${e => e.stopPropagation()}
          @keydown=${this._onDisconnectConfirmKeyDown}
        >
          <h3>${this.t(this._connectionCopyKey('ConfirmDisconnectTitle'))}</h3>
          <p>${this.t(this._connectionCopyKey('ConfirmDisconnectDescription'))}</p>
          <div class="confirm-actions">
            <button class="secondary-btn" @click=${this._closeDisconnectConfirm}>${this.t('common.cancel')}</button>
            <button class="disconnect-btn" @click=${this._confirmDisconnect}>${this.t(this._connectionCopyKey('Disconnect'))}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderSettingsPasswordPrompt() {
    return html`
      <div class="confirm-backdrop" @click=${this._closeSettingsPasswordPrompt}>
        <div
          class="confirm-dialog settings-lock-dialog"
          role="dialog"
          aria-modal="true"
          aria-label=${this.t('home.settingsUnlockTitle')}
          tabindex="-1"
          @click=${e => e.stopPropagation()}
          @keydown=${this._onSettingsPasswordPromptKeyDown}
        >
          <h3>${this.t('home.settingsUnlockTitle')}</h3>
          <p>${this.t('home.settingsUnlockDescription')}</p>

          <form class="settings-lock-form" @submit=${this._onSettingsPasswordPromptSubmit}>
            <input
              class="settings-lock-hidden-user"
              type="text"
              tabindex="-1"
              autocomplete="username"
              .value=${this.t('app.title')}
              aria-hidden="true"
            />
            <label class="settings-lock-field">
              <span class="settings-lock-label">${this.t('home.settingsUnlockLabel')}</span>
              <input
                class="settings-lock-input"
                type="password"
                inputmode="numeric"
                pattern="[0-9]*"
                maxlength="4"
                placeholder="0000"
                .value=${this._settingsPasswordPromptValue}
                autocomplete="current-password"
                @input=${this._onSettingsPasswordPromptInput}
              />
            </label>

            ${this._settingsPasswordPromptError ? html`
              <p class="settings-lock-error" role="alert">${this._settingsPasswordPromptError}</p>
            ` : ''}

            <div class="confirm-actions">
              <button class="secondary-btn" type="button" @click=${this._closeSettingsPasswordPrompt}>${this.t('common.cancel')}</button>
              <button class="primary-btn" type="submit">${this.t('home.settingsUnlockAction')}</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }
}

customElements.define('home-view', HomeView);
