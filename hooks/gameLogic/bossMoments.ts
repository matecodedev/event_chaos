import { GameMode } from '../../types';
import type { GameScenario } from '../../types';
import { clamp } from './math';
import type {
  MatchPhase,
  PhaseDirectorProfile,
  ProceduralInjectionProfile,
  SessionFatigueMetrics
} from './director';

export interface BossMomentProfile {
  active: boolean;
  recovery: boolean;
  intensity: number;
  spawnDelayMultiplier: number;
  missionRespawnMultiplier: number;
  severityDelta: number;
  concurrencyDelta: number;
  cascadeChanceDelta: number;
  aiChanceMultiplier: number;
  aiCooldownMultiplier: number;
  durationMultiplier: number;
}
const SCENARIO_BOSS_BEATS: Record<string, number[]> = {
  NORMAL: [0.72],
  ROCKSTAR: [0.66, 0.84],
  FESTIVAL: [0.62, 0.78, 0.9],
  EXTREME: [0.64, 0.76, 0.88],
  ARENA: [0.58, 0.73, 0.87],
  WORLD_TOUR: [0.56, 0.7, 0.82, 0.92],
  BLACKOUT_PROTOCOL: [0.52, 0.66, 0.79, 0.9]
};

const DEFAULT_BOSS_MOMENT_PROFILE: BossMomentProfile = {
  active: false,
  recovery: false,
  intensity: 0,
  spawnDelayMultiplier: 1,
  missionRespawnMultiplier: 1,
  severityDelta: 0,
  concurrencyDelta: 0,
  cascadeChanceDelta: 0,
  aiChanceMultiplier: 1,
  aiCooldownMultiplier: 1,
  durationMultiplier: 1
};

const getBossTimelineProgress = (
  mode: GameMode,
  fatigueMetrics: SessionFatigueMetrics,
  attemptsCount: number
) => {
  if (mode !== GameMode.ENDLESS) return fatigueMetrics.progressRatio;
  return clamp((attemptsCount % 24) / 24, 0, 1);
};

export const getScenarioBossMomentProfile = (
  scenarioId: string,
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  phase: MatchPhase,
  fatigueMetrics: SessionFatigueMetrics,
  activeEventsCount: number,
  attemptsCount: number
): BossMomentProfile => {
  if (difficulty === 'TUTORIAL' || phase !== 'FINALE') return { ...DEFAULT_BOSS_MOMENT_PROFILE };
  const beats = SCENARIO_BOSS_BEATS[scenarioId];
  if (!beats || beats.length === 0) return { ...DEFAULT_BOSS_MOMENT_PROFILE };

  const timeline = getBossTimelineProgress(mode, fatigueMetrics, attemptsCount);
  const beatWidth = 0.035;
  const recoveryWidth = 0.06;
  const isActive = beats.some(beat => Math.abs(timeline - beat) <= beatWidth);
  const isRecovery = !isActive && beats.some(beat => {
    const start = beat + beatWidth;
    const end = start + recoveryWidth;
    return timeline > start && timeline <= end;
  });

  if (!isActive && !isRecovery) return { ...DEFAULT_BOSS_MOMENT_PROFILE };

  const difficultyIntensity = {
    NORMAL: 0.72,
    HARD: 0.86,
    EXTREME: 1.0,
    TUTORIAL: 0.6
  }[difficulty];

  const pressureSuppression = fatigueMetrics.pressureLevel >= 0.8 ? 0.78 : 1;
  const loadSuppression = activeEventsCount >= 5 ? 0.84 : 1;
  const intensity = clamp(
    difficultyIntensity *
      (0.78 + (fatigueMetrics.fatigueLevel * 0.34)) *
      pressureSuppression *
      loadSuppression,
    0.36,
    1.12
  );

  if (isActive) {
    return {
      active: true,
      recovery: false,
      intensity,
      spawnDelayMultiplier: clamp(1 - (intensity * 0.26), 0.6, 1),
      missionRespawnMultiplier: clamp(1 + (intensity * 0.1), 1, 1.2),
      severityDelta: clamp(intensity * 0.1, 0.04, 0.18),
      concurrencyDelta: intensity >= 0.72 ? 1 : 0,
      cascadeChanceDelta: clamp(intensity * 0.16, 0.06, 0.24),
      aiChanceMultiplier: clamp(1 + (intensity * 0.2), 1.04, 1.34),
      aiCooldownMultiplier: clamp(1 - (intensity * 0.16), 0.72, 0.96),
      durationMultiplier: clamp(1 - (intensity * 0.1), 0.78, 0.95)
    };
  }

  return {
    active: false,
    recovery: true,
    intensity: intensity * 0.8,
    spawnDelayMultiplier: clamp(1 + (intensity * 0.22), 1.04, 1.3),
    missionRespawnMultiplier: clamp(1 - (intensity * 0.08), 0.84, 1),
    severityDelta: clamp(-(intensity * 0.07), -0.14, -0.03),
    concurrencyDelta: intensity >= 0.9 ? -1 : 0,
    cascadeChanceDelta: clamp(-(intensity * 0.09), -0.16, -0.04),
    aiChanceMultiplier: clamp(1 - (intensity * 0.16), 0.7, 0.96),
    aiCooldownMultiplier: clamp(1 + (intensity * 0.2), 1.04, 1.32),
    durationMultiplier: clamp(1 + (intensity * 0.12), 1.02, 1.24)
  };
};

export const applyBossMomentToDirectorProfile = (
  profile: PhaseDirectorProfile,
  bossMoment: BossMomentProfile
): PhaseDirectorProfile => {
  if (!bossMoment.active && !bossMoment.recovery) return profile;

  const nextCascadeChance = clamp(
    profile.cascadeChance + bossMoment.cascadeChanceDelta,
    0.04,
    0.8
  );

  return {
    spawnDelayMultiplier: clamp(profile.spawnDelayMultiplier * bossMoment.spawnDelayMultiplier, 0.52, 1.42),
    missionRespawnMultiplier: clamp(profile.missionRespawnMultiplier * bossMoment.missionRespawnMultiplier, 0.62, 1.42),
    severityDelta: clamp(profile.severityDelta + bossMoment.severityDelta, -0.22, 0.3),
    concurrencyDelta: clamp(profile.concurrencyDelta + bossMoment.concurrencyDelta, -2, 2),
    cascadeChance: nextCascadeChance,
    cascadeCooldownMs: Math.round(clamp(
      profile.cascadeCooldownMs * (1.12 - nextCascadeChance),
      4500,
      25000
    ))
  };
};

export const applyBossMomentToProceduralProfile = (
  profile: ProceduralInjectionProfile,
  bossMoment: BossMomentProfile
): ProceduralInjectionProfile => {
  if (!bossMoment.active && !bossMoment.recovery) return profile;

  const nextMaxInjectedEvents = bossMoment.active
    ? Math.min(3, profile.maxInjectedEvents + (bossMoment.intensity >= 0.9 ? 1 : 0))
    : Math.max(1, profile.maxInjectedEvents - 1);

  return {
    aiChanceMultiplier: clamp(profile.aiChanceMultiplier * bossMoment.aiChanceMultiplier, 0.5, 1.5),
    aiCooldownMultiplier: clamp(profile.aiCooldownMultiplier * bossMoment.aiCooldownMultiplier, 0.64, 1.7),
    idleRetryDelayMs: Math.round(clamp(
      profile.idleRetryDelayMs * (bossMoment.recovery ? 1.12 : 0.92),
      4500,
      14000
    )),
    maxInjectedEvents: nextMaxInjectedEvents,
    severityBias: clamp(profile.severityBias + (bossMoment.severityDelta * 0.5), -0.3, 0.28),
    durationMultiplier: clamp(profile.durationMultiplier * bossMoment.durationMultiplier, 0.74, 1.34)
  };
};

