import { GameMode } from '../../types';
import type { GameScenario, GameStats, SystemState, SystemType } from '../../types';

export interface WinConditions {
  publicInterest: number;
  clientSatisfaction: number;
  stressLimit: number;
  minBudget: number;
}
export interface EventResolutionTelemetry {
  success: boolean;
  cost: number;
  systemId: SystemType;
  severity: 1 | 2 | 3;
  eventTitle: string;
  eventId: string;
}

export const shouldTriggerImmediateGameOver = (
  scenario: GameScenario,
  mode: GameMode,
  stats: Pick<GameStats, 'publicInterest' | 'clientSatisfaction' | 'stress' | 'budget'>,
  systems: SystemState[],
  winConditions: WinConditions
) => {
  if (scenario.isTutorial) return false;
  if (mode === GameMode.HARDCORE && systems.some(system => system.health <= 0)) return true;

  return (
    stats.publicInterest <= 0 ||
    stats.clientSatisfaction <= 0 ||
    stats.stress >= 100 ||
    stats.budget < winConditions.minBudget
  );
};

export const applyTutorialSafetyNet = (
  scenario: GameScenario,
  stats: Pick<GameStats, 'stress' | 'budget'>
) => {
  return {
    stress: scenario.isTutorial && stats.stress > 80 ? 50 : stats.stress,
    budget: scenario.isTutorial && stats.budget < 0 ? 1000 : stats.budget
  };
};

export const getTimerEndOutcome = (
  mode: GameMode,
  timeRemaining: number,
  stats: Pick<GameStats, 'publicInterest' | 'clientSatisfaction' | 'stress'>,
  winConditions: WinConditions
): 'VICTORY' | 'GAME_OVER' | null => {
  if (mode === GameMode.ENDLESS || timeRemaining > 0) return null;

  const passed =
    stats.publicInterest >= winConditions.publicInterest &&
    stats.clientSatisfaction >= winConditions.clientSatisfaction &&
    stats.stress < winConditions.stressLimit;

  return passed ? 'VICTORY' : 'GAME_OVER';
};

export const getCrewDriftMultiplier = (crewBonus: string | null) => {
  return crewBonus === 'LESS_DRIFT' ? 0.85 : 1.0;
};

export const getCrewStressMultiplier = (crewBonus: string | null) => {
  return crewBonus === 'SLOW_STRESS' ? 0.8 : 1.0;
};

export const getCrewAutoHealPer5Seconds = (crewBonus: string | null) => {
  return crewBonus === 'AUTO_REPAIR_SLOW' ? 0.5 : 0;
};

