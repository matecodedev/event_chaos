import { afterEach } from 'vitest';

// This setup file runs for every test file, including the node-environment
// logic suites, so it must not assume a DOM exists.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
}
