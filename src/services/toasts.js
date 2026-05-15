function createToastId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class ToastService extends EventTarget {
  #items = [];
  #timers = new Map();

  get items() {
    return [...this.#items];
  }

  show(toast) {
    const item = {
      id: toast?.id ?? createToastId(),
      tone: toast?.tone ?? 'info',
      duration: Number.isFinite(Number(toast?.duration)) ? Number(toast.duration) : 5000,
      ...toast,
    };

    this.#items = [...this.#items, item];
    this.#emit();

    if (item.duration > 0) {
      const timer = window.setTimeout(() => {
        this.dismiss(item.id);
      }, item.duration);

      this.#timers.set(item.id, timer);
    }

    return item.id;
  }

  dismiss(id, reason = 'dismiss') {
    const item = this.#items.find((entry) => entry.id === id);
    const timer = this.#timers.get(id);

    if (timer) {
      window.clearTimeout(timer);
      this.#timers.delete(id);
    }

    const nextItems = this.#items.filter((item) => item.id !== id);

    if (nextItems.length === this.#items.length) {
      return;
    }

    this.#items = nextItems;
    this.#emit();

    try {
      item?.onDismiss?.(reason, item);
    } catch {
      // Ignore toast cleanup errors.
    }
  }

  clear() {
    const ids = this.#items.map((item) => item.id);

    for (const id of ids) {
      this.dismiss(id, 'clear');
    }
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { items: this.items },
    }));
  }
}

export const toasts = new ToastService();