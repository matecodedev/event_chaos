// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaderPanel } from '../components/FaderPanel';
import { SystemType } from '../types';
import type { SystemState } from '../types';

const buildSystem = (id: SystemType, faderValue: number): SystemState => ({
  id,
  name: id,
  health: 100,
  status: 'OK',
  faderValue,
  stability: 100,
  driftSpeed: 0
});

const buildSystems = (values: Partial<Record<SystemType, number>> = {}) => ({
  [SystemType.SOUND]: buildSystem(SystemType.SOUND, values[SystemType.SOUND] ?? 50),
  [SystemType.LIGHTS]: buildSystem(SystemType.LIGHTS, values[SystemType.LIGHTS] ?? 50),
  [SystemType.VIDEO]: buildSystem(SystemType.VIDEO, values[SystemType.VIDEO] ?? 50),
  [SystemType.STAGE]: buildSystem(SystemType.STAGE, values[SystemType.STAGE] ?? 50)
});

const renderPanel = (overrides: Partial<React.ComponentProps<typeof FaderPanel>> = {}) => {
  const onFaderChange = vi.fn();
  const onSelectSystem = vi.fn();

  const utils = render(
    <FaderPanel
      systems={buildSystems()}
      onFaderChange={onFaderChange}
      onSelectSystem={onSelectSystem}
      selectedSystem={SystemType.SOUND}
      {...overrides}
    />
  );

  return { onFaderChange, onSelectSystem, ...utils };
};

describe('FaderPanel accessibility', () => {
  it('exposes one focusable slider per system', () => {
    renderPanel();

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(4);

    sliders.forEach((slider) => {
      expect(slider.tabIndex).toBe(0);
      expect(slider.getAttribute('aria-label')).toMatch(/^Fader de /);
      expect(slider.getAttribute('aria-orientation')).toBe('vertical');
      expect(slider.getAttribute('aria-valuemin')).toBe('0');
      expect(slider.getAttribute('aria-valuemax')).toBe('100');
    });
  });

  it('reports the current value and safe-zone state through aria', () => {
    renderPanel({
      systems: buildSystems({
        [SystemType.SOUND]: 50,
        [SystemType.LIGHTS]: 30,
        [SystemType.VIDEO]: 90
      })
    });

    expect(screen.getByRole('slider', { name: 'Fader de SOUND' }).getAttribute('aria-valuetext'))
      .toBe('50 por ciento, zona segura');
    expect(screen.getByRole('slider', { name: 'Fader de LIGHTS' }).getAttribute('aria-valuetext'))
      .toBe('30 por ciento, fuera de la zona segura');
    expect(screen.getByRole('slider', { name: 'Fader de VIDEO' }).getAttribute('aria-valuetext'))
      .toBe('90 por ciento, zona crítica');
  });

  it('is reachable with the keyboard alone', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.tab();
    // The first stop is the system selector button, the second is its slider.
    const focusedTags: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      focusedTags.push(document.activeElement?.getAttribute('role') ?? document.activeElement?.tagName ?? '');
      await user.tab();
    }

    expect(focusedTags).toContain('slider');
  });

  it('moves the fader with arrow keys, page keys and home/end', async () => {
    const user = userEvent.setup();
    const { onFaderChange } = renderPanel();

    const slider = screen.getByRole('slider', { name: 'Fader de SOUND' });
    slider.focus();

    await user.keyboard('{ArrowUp}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 52);

    await user.keyboard('{ArrowDown}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 48);

    await user.keyboard('{PageUp}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 60);

    await user.keyboard('{PageDown}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 40);

    await user.keyboard('{Home}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 0);

    await user.keyboard('{End}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 100);
  });

  it('clamps keyboard movement to the 0-100 range', async () => {
    const user = userEvent.setup();
    const { onFaderChange } = renderPanel({
      systems: buildSystems({ [SystemType.SOUND]: 99 })
    });

    const slider = screen.getByRole('slider', { name: 'Fader de SOUND' });
    slider.focus();

    await user.keyboard('{ArrowUp}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 100);
  });

  it('steps from the value of the latest render, not the first one', async () => {
    const user = userEvent.setup();
    const { onFaderChange, rerender } = renderPanel();

    const slider = screen.getByRole('slider', { name: 'Fader de SOUND' });
    slider.focus();

    // Faders drift on every game tick, so the panel is re-rendered constantly.
    rerender(
      <FaderPanel
        systems={buildSystems({ [SystemType.SOUND]: 70 })}
        onFaderChange={onFaderChange}
        onSelectSystem={vi.fn()}
        selectedSystem={SystemType.SOUND}
      />
    );

    await user.keyboard('{ArrowUp}');
    expect(onFaderChange).toHaveBeenLastCalledWith(SystemType.SOUND, 72);

    // The slider also has to keep reporting the drifted value to assistive tech.
    expect(slider.getAttribute('aria-valuenow')).toBe('70');
  });

  it('selects the system when its slider is driven by keyboard', async () => {
    const user = userEvent.setup();
    const { onSelectSystem } = renderPanel();

    screen.getByRole('slider', { name: 'Fader de STAGE' }).focus();
    await user.keyboard('{ArrowUp}');

    expect(onSelectSystem).toHaveBeenCalledWith(SystemType.STAGE);
  });

  it('ignores keys that are not part of the slider pattern', async () => {
    const user = userEvent.setup();
    const { onFaderChange } = renderPanel();

    screen.getByRole('slider', { name: 'Fader de SOUND' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard('a');

    expect(onFaderChange).not.toHaveBeenCalled();
  });

  it('exposes the system selector as a button with pressed state', async () => {
    const user = userEvent.setup();
    const { onSelectSystem } = renderPanel();

    const selected = screen.getByRole('button', { name: /Seleccionar sistema SOUND/ });
    expect(selected.getAttribute('aria-pressed')).toBe('true');

    const other = screen.getByRole('button', { name: /Seleccionar sistema VIDEO/ });
    expect(other.getAttribute('aria-pressed')).toBe('false');

    await user.click(other);
    expect(onSelectSystem).toHaveBeenCalledWith(SystemType.VIDEO);
  });

  it('announces a system in critical state through its selector label', () => {
    renderPanel({ systems: buildSystems({ [SystemType.LIGHTS]: 95 }) });

    expect(screen.getByRole('button', { name: 'Seleccionar sistema LIGHTS (en estado crítico)' }))
      .toBeDefined();
  });
});
