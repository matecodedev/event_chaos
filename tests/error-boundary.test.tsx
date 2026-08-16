// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

const Boom = ({ message }: { message: string }) => {
  throw new Error(message);
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React logs the caught error itself; silence it so the run stays readable.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>El show continúa</p>
      </ErrorBoundary>
    );

    expect(screen.getByText('El show continúa')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces a crashed tree with an alert instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Boom message="fader desconectado" />
      </ErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Fallo crítico en el show');
    expect(alert.textContent).toContain('fader desconectado');
  });

  it('offers a reload control that is reachable by name', () => {
    render(
      <ErrorBoundary>
        <Boom message="fallo de red DMX" />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: 'Reiniciar simulador' })).toBeDefined();
  });

  it('falls back to a generic message when the error carries none', () => {
    const Silent = () => {
      throw new Error('');
    };

    render(
      <ErrorBoundary>
        <Silent />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert').textContent).toContain('Error desconocido');
  });

  it('reports the failure to the console for diagnostics', () => {
    render(
      <ErrorBoundary>
        <Boom message="overflow de audio" />
      </ErrorBoundary>
    );

    const loggedOurMessage = consoleError.mock.calls.some((call) =>
      call.some((arg) => typeof arg === 'string' && arg.includes('Unhandled error in Event Chaos UI'))
    );
    expect(loggedOurMessage).toBe(true);
  });
});
