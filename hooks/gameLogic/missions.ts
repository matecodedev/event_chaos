import { GameMode } from '../../types';
import type { GameScenario, GameStats, MissionDefinition, SystemState, SystemType } from '../../types';
import { clamp } from './math';
import type { MatchPhase } from './director';
import type { EconomyPhaseProfile, EconomyStreakState } from './economy';

export interface MissionDirectorContext {
  systems: Record<SystemType, SystemState>;
  stats: Pick<GameStats, 'stress' | 'budget'>;
  phase: MatchPhase;
  mode: GameMode;
  difficulty: GameScenario['difficulty'];
}

export interface AdaptiveMissionPick {
  missionId: string;
  queueIndex: number;
}

const getCriteriaBounds = (criterion: MissionDefinition['criteria'][number]) => {
  return {
    min: criterion.min ?? 0,
    max: criterion.max ?? 100
  };
};

export const getMissionComplexityScore = (mission: MissionDefinition) => {
  const criteriaCount = mission.criteria.length;
  const criteriaDensity = clamp((criteriaCount - 1) / 3, 0, 1);
  const precisionScore = mission.criteria.length > 0
    ? mission.criteria.reduce((sum, criterion) => {
      const { min, max } = getCriteriaBounds(criterion);
      const width = clamp(max - min, 0, 100);
      return sum + (1 - (width / 100));
    }, 0) / mission.criteria.length
    : 0;
  const holdComplexity = clamp((mission.holdDuration - 8) / 16, 0, 1);
  const timeoutPressure = clamp(mission.holdDuration / Math.max(1, mission.timeout), 0, 1);
  const rewardSignal = clamp(mission.rewardCash / 1800, 0, 1);

  return clamp(
    (criteriaDensity * 0.32) +
    (precisionScore * 0.28) +
    (holdComplexity * 0.18) +
    (timeoutPressure * 0.12) +
    (rewardSignal * 0.1),
    0,
    1
  );
};

export const getMissionSystemFitScore = (
  mission: MissionDefinition,
  systems: Record<SystemType, SystemState>
) => {
  if (mission.criteria.length === 0) return 0.5;

  let accumulatedGap = 0;
  let inRangeCount = 0;

  mission.criteria.forEach(criterion => {
    const value = systems[criterion.systemId]?.faderValue ?? 50;
    const { min, max } = getCriteriaBounds(criterion);
    const gap = value < min ? (min - value) : value > max ? (value - max) : 0;
    if (gap === 0) inRangeCount += 1;
    accumulatedGap += clamp(gap / 100, 0, 1);
  });

  const avgGap = accumulatedGap / mission.criteria.length;
  const inRangeRatio = inRangeCount / mission.criteria.length;

  return clamp((1 - avgGap) * 0.75 + (inRangeRatio * 0.25), 0, 1);
};

export const getMissionTargetComplexity = (context: MissionDirectorContext) => {
  const phaseBase = {
    OPENING: 0.42,
    MIDGAME: 0.56,
    FINALE: 0.68
  }[context.phase];

  const difficultyDelta = {
    TUTORIAL: -0.2,
    NORMAL: 0,
    HARD: 0.08,
    EXTREME: 0.14
  }[context.difficulty];

  const modeDelta = {
    [GameMode.NORMAL]: 0,
    [GameMode.ENDLESS]: -0.04,
    [GameMode.SPEEDRUN]: 0.06,
    [GameMode.HARDCORE]: 0.1
  }[context.mode];

  const stressDelta =
    context.stats.stress >= 85 ? -0.26 :
    context.stats.stress >= 70 ? -0.16 :
    context.stats.stress <= 35 ? 0.08 :
    0;
  const budgetDelta =
    context.stats.budget <= 1200 ? -0.15 :
    context.stats.budget >= 7000 ? 0.06 :
    0;

  return clamp(phaseBase + difficultyDelta + modeDelta + stressDelta + budgetDelta, 0.18, 0.9);
};

export const pickAdaptiveMissionFromQueue = (
  missionPool: MissionDefinition[],
  queueIds: string[],
  queueStartIndex: number,
  context: MissionDirectorContext,
  lookahead: number = 4,
  randomFactor: number = Math.random()
): AdaptiveMissionPick | null => {
  if (missionPool.length === 0 || queueIds.length === 0 || queueStartIndex >= queueIds.length) {
    return null;
  }

  const missionById = new Map(missionPool.map(mission => [mission.id, mission]));
  const targetComplexity = getMissionTargetComplexity(context);
  const pressureWeight = context.stats.stress >= 70 ? 0.4 : 0.25;
  const challengeWeight = context.stats.stress <= 45 ? 0.25 : 0.12;
  const economyWeight = context.stats.budget <= 1200 ? 0.2 : 0.08;
  const alignmentWeight = Math.max(0.2, 1 - pressureWeight - challengeWeight - economyWeight);

  const endIndex = Math.min(queueIds.length, queueStartIndex + Math.max(1, lookahead));
  let bestPick: AdaptiveMissionPick | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let queueIndex = queueStartIndex; queueIndex < endIndex; queueIndex += 1) {
    const missionId = queueIds[queueIndex];
    const mission = missionById.get(missionId);
    if (!mission) continue;

    const complexity = getMissionComplexityScore(mission);
    const complexityAlignment = 1 - Math.abs(complexity - targetComplexity);
    const fitScore = getMissionSystemFitScore(mission, context.systems);
    const economyScore = context.stats.budget <= 1200 ? fitScore : (0.5 * fitScore + 0.5 * complexityAlignment);
    const queueProximityBonus = (endIndex - queueIndex) * 0.003;
    const deterministicNoise = ((queueIndex - queueStartIndex + 1) * clamp(randomFactor, 0, 1)) * 0.002;

    const score =
      (complexityAlignment * alignmentWeight) +
      (fitScore * pressureWeight) +
      (complexity * challengeWeight) +
      (economyScore * economyWeight) +
      queueProximityBonus +
      deterministicNoise;

    if (score > bestScore) {
      bestScore = score;
      bestPick = { missionId, queueIndex };
    }
  }

  return bestPick;
};

export const getMissionRewardCash = (
  baseRewardCash: number,
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  activeEventsCount: number,
  stressLevel: number,
  rewardMultiplier: number
) => {
  const difficultyMultiplier = {
    TUTORIAL: 0.9,
    NORMAL: 1.0,
    HARD: 1.12,
    EXTREME: 1.22
  }[difficulty];
  const modeMultiplier = {
    [GameMode.NORMAL]: 1.0,
    [GameMode.ENDLESS]: 0.95,
    [GameMode.SPEEDRUN]: 1.1,
    [GameMode.HARDCORE]: 1.16
  }[mode];
  const pressureBonus =
    (stressLevel >= 75 ? 0.08 : 0) +
    (activeEventsCount >= 4 ? 0.05 : activeEventsCount >= 2 ? 0.03 : 0);
  const totalMultiplier = clamp(difficultyMultiplier * modeMultiplier * rewardMultiplier * (1 + pressureBonus), 0.8, 1.6);
  return Math.max(50, Math.round(baseRewardCash * totalMultiplier));
};

export const getMissionRewardPacingMultiplier = (
  economyProfile: EconomyPhaseProfile,
  streakState: Pick<EconomyStreakState, 'missionSuccessStreak' | 'missionFailStreak'>,
  stats: Pick<GameStats, 'stress' | 'budget'>,
  phase: MatchPhase,
  fatigueLevel: number
) => {
  const successBonus = Math.min(0.15, streakState.missionSuccessStreak * 0.03);
  const failComeback = Math.min(0.22, streakState.missionFailStreak * economyProfile.comebackBonusMultiplier * 0.7);
  const budgetComeback = stats.budget <= 1200 ? economyProfile.comebackBonusMultiplier * 0.6 : 0;
  const stressComeback = stats.stress >= 75 ? economyProfile.comebackBonusMultiplier * 0.5 : 0;
  const finaleFatigueBonus = phase === 'FINALE' && fatigueLevel >= 0.72 ? 0.08 : 0;

  const total = economyProfile.missionRewardMultiplier *
    (1 + successBonus + failComeback + budgetComeback + stressComeback + finaleFatigueBonus);
  return clamp(total, 0.76, 1.62);
};

export const getMissionTimeoutBudgetPenalty = (
  mission: Pick<MissionDefinition, 'criteria' | 'rewardCash'>,
  economyProfile: EconomyPhaseProfile,
  stats: Pick<GameStats, 'stress' | 'budget'>
) => {
  const basePenalty = Math.max(
    120,
    Math.round(mission.rewardCash * 0.22) + (mission.criteria.length * 55)
  );
  const pressureRelief =
    stats.stress >= 85 ? economyProfile.comebackBonusMultiplier * 0.75 :
    stats.stress >= 70 ? economyProfile.comebackBonusMultiplier * 0.45 :
    0;
  const budgetRelief = stats.budget <= 1000 ? economyProfile.comebackBonusMultiplier * 0.35 : 0;
  const penaltyMultiplier = Math.max(0.58, economyProfile.failurePenaltyMultiplier - pressureRelief - budgetRelief);
  return Math.max(0, Math.round(basePenalty * penaltyMultiplier));
};

