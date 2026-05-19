export type ToastDismissReason = 'dismiss' | 'clear' | (string & {});

export type ToastItem = {
  id: string;
  tone: string;
  duration: number;
  onDismiss?: (reason: ToastDismissReason, item: ToastItem) => void;
  [key: string]: unknown;
};

export type ToastInput = Partial<ToastItem>;

function createToastId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ToastService extends EventTarget {
  #items: ToastItem[] = [];
  #timers = new Map<string, number>();

  get items(): ToastItem[] {
    return [...this.#items];
  }

  show(toast: ToastInput = {}): string {
    const item = {
      ...toast,
      id: toast.id ?? createToastId(),
      tone: toast.tone ?? 'info',
      duration: Number.isFinite(Number(toast.duration)) ? Number(toast.duration) : 5000,
    } as ToastItem;

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

  dismiss(id: string, reason: ToastDismissReason = 'dismiss'): void {
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

  clear(): void {
    const ids = this.#items.map((item) => item.id);

    for (const id of ids) {
      this.dismiss(id, 'clear');
    }
  }

  #emit(): void {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { items: this.items },
    }));
  }
}

export const toasts = new ToastService();
