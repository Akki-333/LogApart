import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Each test starts from an empty document, so one dialog cannot leak into the next.
afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});
