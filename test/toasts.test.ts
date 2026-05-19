import test from 'node:test';
import assert from 'node:assert/strict';

import { ToastService } from '../src/services/toasts.ts';

test('ToastService normalizes toast fields and clears timers on dismiss', () => {
  const service = new ToastService();
  const dismissed: string[] = [];
  const toastId = service.show({
    duration: 20,
    onDismiss(reason) {
      dismissed.push(reason);
    },
  });

  assert.equal(service.items.length, 1);
  assert.equal(service.items[0]?.tone, 'info');

  service.dismiss(toastId, 'dismiss');

  assert.equal(service.items.length, 0);
  assert.deepEqual(dismissed, ['dismiss']);
});
