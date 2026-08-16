import { GameMode } from '../../types';
import type { GameScenario, GameStats, SystemState, SystemType } from '../../types';
import { GAME_DURATION } from '../../constants';
import { clamp } from './math';

export const getModeDuration = (mode: GameMode) => {
  if (mode === GameMode.SPEEDRUN) return 90;
  if (mode === GameMode.ENDLESS) return 3600;
  return GAME_DURATION;
};

export type MatchPhase = 'OPENING' | 'MIDGAME' | 'FINALE';

export interface PhaseDirectorProfile {
  spawnDelayMultiplier: number;
  missionRespawnMultiplier: number;
  severityDelta: number;
  concurrencyDelta: number;
  cascadeChance: number;
  cascadeCooldownMs: number;
}

export type SessionEventOutcome = 'SUCCESS' | 'FAIL';

export interface SessionDirectorTelemetry {
  resolvedEvents: number;
  failedEvents: number;
  expiredEvents: number;
  totalSpend: number;
  recentOutcomes: SessionEventOutcome[];
}

export interface AdaptiveDirectorAdjustments {
  spawnDelayMultiplier: number;
  missionRespawnMultiplier: number;
  severityDelta: number;
  concurrencyDelta: number;
  cascadeChanceDelta: number;
}

export interface SessionFatigueMetrics {
  progressRatio: number;
  pressureLevel: number;
  recentFailRate: number;
  fatigueLevel: number;
}

export interface ProceduralInjectionProfile {
  aiChanceMultiplier: number;
  aiCooldownMultiplier: number;
  idleRetryDelayMs: number;
  maxInjectedEvents: number;
  severityBias: number;
  durationMultiplier: number;
}




export const DEFAULT_SESSION_DIRECTOR_TELEMETRY: SessionDirectorTelemetry = {
  resolvedEvents: 0,
  failedEvents: 0,
  expiredEvents: 0,
  totalSpend: 0,
  recentOutcomes: []
};

export const DEFAULT_PHASE_DIRECTOR_PROFILE: PhaseDirectorProfile = {
  spawnDelayMultiplier: 1,
  missionRespawnMultiplier: 1,
  severityDelta: 0,
  concurrencyDelta: 0,
  cascadeChance: 0.2,
  cascadeCooldownMs: 12000
};

export const pushRecentOutcome = (
  outcomes: SessionEventOutcome[],
  outcome: SessionEventOutcome,
  maxLength: number = 8
) => {
  const next = [...outcomes, outcome];
  if (next.length <= maxLength) return next;
  return next.slice(next.length - maxLength);
};

export const getMatchPhase = (
  mode: GameMode,
  timeRemaining: number,
  totalDuration: number,
  stressLevel: number
): MatchPhase => {
  if (mode === GameMode.ENDLESS) {
    if (stressLevel >= 75) return 'FINALE';
    if (stressLevel >= 45) return 'MIDGAME';
    return 'OPENING';
  }

  if (!Number.isFinite(totalDuration) || totalDuration <= 0) return 'MIDGAME';
  const clampedRemaining = clamp(timeRemaining, 0, totalDuration);
  const progress = 1 - (clampedRemaining / totalDuration);

  if (progress < 0.34) return 'OPENING';
  if (progress < 0.78) return 'MIDGAME';
  return 'FINALE';
};

export const getPhaseDirectorProfile = (
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  phase: MatchPhase,
  stressLevel: number
): PhaseDirectorProfile => {
  if (difficulty === 'TUTORIAL') {
    return {
      spawnDelayMultiplier: 1.1,
      missionRespawnMultiplier: 1.08,
      severityDelta: -0.08,
      concurrencyDelta: 0,
      cascadeChance: 0,
      cascadeCooldownMs: 22000
    };
  }

  const baseByPhase: Record<MatchPhase, PhaseDirectorProfile> = {
    OPENING: {
      spawnDelayMultiplier: 1.12,
      missionRespawnMultiplier: 1.06,
      severityDelta: -0.05,
      concurrencyDelta: -1,
      cascadeChance: 0.12,
      cascadeCooldownMs: 15000
    },
    MIDGAME: {
      spawnDelayMultiplier: 1.0,
      missionRespawnMultiplier: 1.0,
      severityDelta: 0,
      concurrencyDelta: 0,
      cascadeChance: 0.2,
      cascadeCooldownMs: 12000
    },
    FINALE: {
      spawnDelayMultiplier: 0.82,
      missionRespawnMultiplier: 0.88,
      severityDelta: 0.08,
      concurrencyDelta: 1,
      cascadeChance: 0.3,
      cascadeCooldownMs: 9000
    }
  };

  const difficultyDelta = {
    NORMAL: { severity: -0.01, cascade: 0, concurrency: 0, spawn: 1.0, mission: 1.0 },
    HARD: { severity: 0.02, cascade: 0.04, concurrency: 0, spawn: 0.97, mission: 0.95 },
    EXTREME: { severity: 0.04, cascade: 0.08, concurrency: 1, spawn: 0.93, mission: 0.92 },
    TUTORIAL: { severity: -0.08, cascade: -1, concurrency: 0, spawn: 1.1, mission: 1.08 }
  }[difficulty];

  const modeDelta = {
    [GameMode.NORMAL]: { severity: 0, cascade: 0, concurrency: 0, spawn: 1.0, mission: 1.0 },
    [GameMode.ENDLESS]: { severity: -0.01, cascade: 0.01, concurrency: 0, spawn: 0.96, mission: 0.92 },
    [GameMode.SPEEDRUN]: { severity: 0.02, cascade: 0.02, concurrency: 0, spawn: 0.88, mission: 0.84 },
    [GameMode.HARDCORE]: { severity: 0.03, cascade: 0.03, concurrency: 1, spawn: 0.9, mission: 0.86 }
  }[mode];

  const stressDelta =
    stressLevel >= 85 ? { severity: 0.04, cascade: 0.06, spawn: 0.9, mission: 0.9 } :
    stressLevel >= 65 ? { severity: 0.02, cascade: 0.03, spawn: 0.95, mission: 0.95 } :
    stressLevel <= 20 ? { severity: -0.02, cascade: -0.04, spawn: 1.06, mission: 1.06 } :
    { severity: 0, cascade: 0, spawn: 1.0, mission: 1.0 };

  const profile = baseByPhase[phase];
  const cascadeChance = clamp(
    profile.cascadeChance + difficultyDelta.cascade + modeDelta.cascade + stressDelta.cascade,
    0.06,
    0.72
  );

  return {
    spawnDelayMultiplier: clamp(
      profile.spawnDelayMultiplier * difficultyDelta.spawn * modeDelta.spawn * stressDelta.spawn,
      0.62,
      1.28
    ),
    missionRespawnMultiplier: clamp(
      profile.missionRespawnMultiplier * difficultyDelta.mission * modeDelta.mission * stressDelta.mission,
      0.68,
      1.32
    ),
    severityDelta: clamp(
      profile.severityDelta + difficultyDelta.severity + modeDelta.severity + stressDelta.severity,
      -0.12,
      0.2
    ),
    concurrencyDelta: clamp(
      profile.concurrencyDelta + difficultyDelta.concurrency + modeDelta.concurrency,
      -1,
      2
    ),
    cascadeChance,
    cascadeCooldownMs: Math.round(clamp(
      profile.cascadeCooldownMs * (1.18 - cascadeChance),
      6000,
      22000
    ))
  };
};

export const getSessionDifficultyTarget = (
  difficulty: GameScenario['difficulty'],
  telemetry: SessionDirectorTelemetry,
  stats: Pick<GameStats, 'stress' | 'budget'>,
  activeEventsCount: number,
  initialBudget: number
) => {
  if (difficulty === 'TUTORIAL') return -1;

  const totalFailures = telemetry.failedEvents + telemetry.expiredEvents;
  const totalResolved = telemetry.resolvedEvents;
  const totalAttempts = totalResolved + totalFailures;
  const successRate = totalAttempts > 0 ? totalResolved / totalAttempts : 0.5;
  const budgetRatio = initialBudget > 0 ? stats.budget / initialBudget : 1;
  const recentFails = telemetry.recentOutcomes.filter(outcome => outcome === 'FAIL').length;
  const recentFailPressure = telemetry.recentOutcomes.length > 0
    ? recentFails / telemetry.recentOutcomes.length
    : 0;

  let target = 0;
  target += (successRate - 0.55) * 1.1;

  if (stats.stress >= 85) target -= 0.5;
  else if (stats.stress >= 70) target -= 0.28;
  else if (stats.stress <= 35) target += 0.15;

  if (budgetRatio <= 0.2) target -= 0.42;
  else if (budgetRatio <= 0.45) target -= 0.2;
  else if (budgetRatio >= 1.7) target += 0.16;

  if (activeEventsCount <= 1 && successRate >= 0.65) target += 0.08;
  if (activeEventsCount >= 4) target -= 0.08;

  target -= recentFailPressure * 0.45;

  if (totalResolved >= 12 && successRate > 0.74) target += 0.14;
  if (totalFailures >= 6 && successRate < 0.45) target -= 0.16;

  return clamp(target, -1, 1);
};

export const getAdaptiveDirectorAdjustments = (
  difficultyTarget: number
): AdaptiveDirectorAdjustments => {
  const intensity = clamp(difficultyTarget, -1, 1);

  return {
    spawnDelayMultiplier: clamp(1 - (intensity * 0.18), 0.82, 1.22),
    missionRespawnMultiplier: clamp(1 - (intensity * 0.14), 0.86, 1.2),
    severityDelta: clamp(intensity * 0.08, -0.1, 0.1),
    concurrencyDelta: intensity >= 0.5 ? 1 : intensity <= -0.5 ? -1 : 0,
    cascadeChanceDelta: clamp(intensity * 0.12, -0.14, 0.14)
  };
};

export const composeDirectorProfile = (
  base: PhaseDirectorProfile,
  adjustments: AdaptiveDirectorAdjustments
): PhaseDirectorProfile => {
  const cascadeCooldownMultiplier = clamp(
    1 - (adjustments.cascadeChanceDelta * 0.72),
    0.72,
    1.28
  );

  return {
    spawnDelayMultiplier: clamp(
      base.spawnDelayMultiplier * adjustments.spawnDelayMultiplier,
      0.58,
      1.34
    ),
    missionRespawnMultiplier: clamp(
      base.missionRespawnMultiplier * adjustments.missionRespawnMultiplier,
      0.64,
      1.34
    ),
    severityDelta: clamp(base.severityDelta + adjustments.severityDelta, -0.18, 0.24),
    concurrencyDelta: clamp(base.concurrencyDelta + adjustments.concurrencyDelta, -2, 2),
    cascadeChance: clamp(base.cascadeChance + adjustments.cascadeChanceDelta, 0.04, 0.78),
    cascadeCooldownMs: Math.round(clamp(base.cascadeCooldownMs * cascadeCooldownMultiplier, 5000, 24000))
  };
};

export const getSessionFatigueMetrics = (
  mode: GameMode,
  timeRemaining: number,
  totalDuration: number,
  telemetry: SessionDirectorTelemetry,
  stats: Pick<GameStats, 'stress' | 'budget'>,
  activeEventsCount: number
): SessionFatigueMetrics => {
  const attempts = telemetry.resolvedEvents + telemetry.failedEvents + telemetry.expiredEvents;
  const recentFailRate = telemetry.recentOutcomes.length > 0
    ? telemetry.recentOutcomes.filter(outcome => outcome === 'FAIL').length / telemetry.recentOutcomes.length
    : 0;

  const progressRatio = mode === GameMode.ENDLESS
    ? clamp(attempts / 40, 0, 1)
    : totalDuration > 0
      ? clamp(1 - (timeRemaining / totalDuration), 0, 1)
      : 0.5;

  const stressPressure = clamp((stats.stress - 45) / 55, 0, 1);
  const loadPressure = clamp((activeEventsCount - 2) / 4, 0, 1);
  const failPressure = clamp(recentFailRate, 0, 1);
  const pressureLevel = clamp(
    (stressPressure * 0.54) +
    (loadPressure * 0.3) +
    (failPressure * 0.16),
    0,
    1
  );

  const fatigueLevel = clamp(
    (progressRatio * 0.56) +
    (pressureLevel * 0.44),
    0,
    1
  );

  return {
    progressRatio,
    pressureLevel,
    recentFailRate,
    fatigueLevel
  };
};

export const getProceduralInjectionProfile = (
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  metrics: SessionFatigueMetrics,
  activeEventsCount: number
): ProceduralInjectionProfile => {
  if (difficulty === 'TUTORIAL') {
    return {
      aiChanceMultiplier: 0.55,
      aiCooldownMultiplier: 1.45,
      idleRetryDelayMs: 11000,
      maxInjectedEvents: 1,
      severityBias: -0.2,
      durationMultiplier: 1.2
    };
  }

  const modeAggression = {
    [GameMode.NORMAL]: 1.0,
    [GameMode.ENDLESS]: 1.06,
    [GameMode.SPEEDRUN]: 1.12,
    [GameMode.HARDCORE]: 1.16
  }[mode];
  const difficultyAggression = {
    NORMAL: 1.0,
    HARD: 1.08,
    EXTREME: 1.16,
    TUTORIAL: 0.55
  }[difficulty];

  const overloadSuppression = metrics.pressureLevel >= 0.74 || metrics.recentFailRate >= 0.62;
  const climaxBoost = metrics.fatigueLevel >= 0.72 && metrics.pressureLevel <= 0.52;
  const loadPenalty = activeEventsCount >= 4 ? 0.14 : activeEventsCount >= 3 ? 0.08 : 0;
  const progressBoost = metrics.progressRatio >= 0.8 ? 0.06 : metrics.progressRatio >= 0.6 ? 0.03 : 0;

  let aiChanceMultiplier = difficultyAggression * modeAggression;
  let aiCooldownMultiplier = 1.0;
  let maxInjectedEvents = activeEventsCount >= 4 ? 1 : 2;
  let severityBias = (difficultyAggression - 1) * 0.16;
  let durationMultiplier = 1.0;
  let idleRetryDelayMs = 8000;

  if (overloadSuppression) {
    aiChanceMultiplier *= 0.76;
    aiCooldownMultiplier *= 1.26;
    maxInjectedEvents = 1;
    severityBias -= 0.14;
    durationMultiplier *= 1.14;
    idleRetryDelayMs = 10500;
  } else if (climaxBoost) {
    aiChanceMultiplier *= 1.08;
    aiCooldownMultiplier *= 0.9;
    maxInjectedEvents = 2;
    severityBias += 0.12;
    durationMultiplier *= 0.92;
    idleRetryDelayMs = 6500;
  } else if (metrics.fatigueLevel >= 0.55) {
    aiChanceMultiplier *= 0.96;
    aiCooldownMultiplier *= 1.05;
    severityBias -= 0.02;
    durationMultiplier *= 1.06;
    idleRetryDelayMs = 9000;
  }

  aiChanceMultiplier = clamp(aiChanceMultiplier + progressBoost - loadPenalty, 0.56, 1.34);
  aiCooldownMultiplier = clamp(aiCooldownMultiplier + (loadPenalty * 0.8), 0.78, 1.5);
  severityBias = clamp(severityBias, -0.24, 0.22);
  durationMultiplier = clamp(durationMultiplier + (loadPenalty * 0.4), 0.86, 1.28);
  idleRetryDelayMs = Math.round(clamp(idleRetryDelayMs + (loadPenalty * 2200), 5500, 13000));

  return {
    aiChanceMultiplier,
    aiCooldownMultiplier,
    idleRetryDelayMs,
    maxInjectedEvents,
    severityBias,
    durationMultiplier
  };
};

