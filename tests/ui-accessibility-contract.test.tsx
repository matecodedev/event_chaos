// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from 'lucide-react';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { AchievementPanel } from '../components/AchievementPanel';
import { ClientPopup } from '../components/ClientPopup';
import { TutorialOverlay } from '../components/TutorialOverlay';
import { ACHIEVEMENTS } from '../hooks/useAchievementSystem';

/** Every control must expose a name, otherwise screen reader users hear "button". */
const expectEveryButtonNamed = () => {
  const unnamed = screen.getAllByRole('button').filter((button) => {
    const label = button.getAttribute('aria-label') ?? button.textContent ?? '';
    return label.trim().length === 0;
  });

  expect(unnamed.map((b) => b.outerHTML.slice(0, 120))).toEqual([]);
};

describe('Button accessible name', () => {
  it('forwards an accessible name to icon-only buttons', () => {
    render(
      <Button onClick={vi.fn()} ariaLabel="Abrir ajustes">
        <Settings />
      </Button>
    );

    expect(screen.getByRole('button', { name: 'Abrir ajustes' })).toBeDefined();
    expectEveryButtonNamed();
  });

  it('defaults to type=button so it never submits a surrounding form', () => {
    render(<Button onClick={vi.fn()}>Iniciar</Button>);
    expect(screen.getByRole('button', { name: 'Iniciar' }).getAttribute('type')).toBe('button');
  });

  it('exposes pressed state when asked to', () => {
    render(<Button onClick={vi.fn()} ariaPressed>Normal</Button>);
    expect(screen.getByRole('button', { name: 'Normal' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('does not emit aria-pressed when the button is not a toggle', () => {
    render(<Button onClick={vi.fn()}>Iniciar</Button>);
    expect(screen.getByRole('button', { name: 'Iniciar' }).hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('ProgressBar semantics', () => {
  it('is announced as a progressbar carrying its label and value', () => {
    render(<ProgressBar value={37} label="Estrés" colorClass="text-red-500" />);

    const bar = screen.getByRole('progressbar', { name: 'Estrés' });
    expect(bar.getAttribute('aria-valuenow')).toBe('37');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('37 por ciento');
  });

  it('clamps the reported percentage to the 0-100 range', () => {
    render(<ProgressBar value={180} label="Energía" colorClass="text-emerald-400" />);
    expect(screen.getByRole('progressbar', { name: 'Energía' }).getAttribute('aria-valuetext'))
      .toBe('100 por ciento');
  });

  it('honours a custom max when reporting progress', () => {
    render(<ProgressBar value={25} max={50} label="Cliente" colorClass="text-cyan-400" />);

    const bar = screen.getByRole('progressbar', { name: 'Cliente' });
    expect(bar.getAttribute('aria-valuemax')).toBe('50');
    expect(bar.getAttribute('aria-valuetext')).toBe('50 por ciento');
  });
});

describe('Modal semantics', () => {
  it('marks the achievements panel as a labelled modal dialog', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <AchievementPanel achievements={ACHIEVEMENTS} unlockedIds={[]} onClose={onClose} />
    );

    const dialog = screen.getByRole('dialog', { name: /LOGROS/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expectEveryButtonNamed();

    await user.click(screen.getByRole('button', { name: 'Cerrar logros' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks the tutorial as a labelled modal dialog', () => {
    render(
      <TutorialOverlay
        step={{ id: 1, title: 'Bienvenido', text: 'Movete con las flechas.' }}
        onNext={vi.fn()}
        totalSteps={5}
      />
    );

    const dialog = screen.getByRole('dialog', { name: 'Bienvenido' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expectEveryButtonNamed();
  });

  it('gives the tutorial portrait a real alt text', () => {
    render(
      <TutorialOverlay
        step={{ id: 1, title: 'Bienvenido', text: 'Movete con las flechas.' }}
        onNext={vi.fn()}
        totalSteps={5}
      />
    );

    expect(screen.getByAltText('Roberto, jefe técnico')).toBeDefined();
  });
});

describe('Client messages live region', () => {
  it('announces incoming client messages politely', () => {
    render(<ClientPopup message="El sonido está saturando" mood="ANGRY" onClose={vi.fn()} />);

    const status = screen.getByRole('status', { name: 'Mensaje del cliente' });
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('El sonido está saturando');
    expectEveryButtonNamed();
  });

  it('lets the message be dismissed from the keyboard', async () => {
    const user = userEvent.setup();
    render(<ClientPopup message="Subí las luces" mood="PANIC" onClose={vi.fn()} />);

    const dismiss = screen.getByRole('button', { name: 'Descartar mensaje del cliente' });
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss);

    await user.keyboard('{Enter}');
    expect(screen.queryByRole('status', { name: 'Mensaje del cliente' })).toBeNull();
  });
});
