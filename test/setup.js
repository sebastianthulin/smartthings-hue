class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

const document = {
  documentElement: {
    lang: 'en',
  },
  title: '',
};

const window = new EventTarget();
const navigator = {
  language: 'en-US',
  languages: ['en-US'],
  standalone: false,
};

window.document = document;
window.navigator = navigator;
window.location = {
  href: 'https://example.com/app',
  search: '',
  hash: '',
  pathname: '/app',
  assign() {},
};
window.history = {
  replaceState() {},
};
window.matchMedia = () => ({ matches: false });
window.open = () => ({
  closed: true,
  document: {
    write() {},
    close() {},
  },
  location: {
    replace() {},
  },
  focus() {},
  close() {},
});
window.setTimeout = globalThis.setTimeout.bind(globalThis);
window.clearTimeout = globalThis.clearTimeout.bind(globalThis);

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: window,
});
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: document,
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: navigator,
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});
