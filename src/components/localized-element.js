import { LitElement } from 'lit';
import { i18n } from '../services/i18n.ts';

export class LocalizedElement extends LitElement {
  connectedCallback() {
    super.connectedCallback();
    this._handleLanguageChange ??= () => this.requestUpdate();
    i18n.addEventListener('change', this._handleLanguageChange);
  }

  disconnectedCallback() {
    i18n.removeEventListener('change', this._handleLanguageChange);
    super.disconnectedCallback();
  }

  t(key, values) {
    return i18n.t(key, values);
  }
}
