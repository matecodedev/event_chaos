import { GameMode } from '../../types';
import type { GameEvent, GameScenario, GameStats, SystemState, SystemType } from '../../types';
import { clamp } from './math';
import type { MatchPhase, SessionFatigueMetrics } from './director';
import type { BossMomentProfile } from './bossMoments';

export interface EconomyPhaseProfile {
  missionRewardMultiplier: number;
  eventRewardMultiplier: number;
  failurePenaltyMultiplier: number;
  expiryPenaltyMultiplier: number;
  comebackBonusMultiplier: number;
}

export interface EconomyStreakState {
  eventSuccessStreak: number;
  eventFailStreak: number;
  missionSuccessStreak: number;
  missionFailStreak: number;
}

export const DEFAULT_ECONOMY_PROFILE: EconomyPhaseProfile = {
  missionRewardMultiplier: 1,
  eventRewardMultiplier: 1,
  failurePenaltyMultiplier: 1,
  expiryPenaltyMultiplier: 1,
  comebackBonusMultiplier: 0
};

export const DEFAULT_ECONOMY_STREAK: EconomyStreakState = {
  eventSuccessStreak: 0,
  eventFailStreak: 0,
  missionSuccessStreak: 0,
  missionFailStreak: 0
};
export const getPhaseEconomyProfile = (
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  phase: MatchPhase,
  stressLevel: number,
  fatigueMetrics: Pick<SessionFatigueMetrics, 'fatigueLevel' | 'pressureLevel'>
): EconomyPhaseProfile => {
  if (difficulty === 'TUTORIAL') {
    return {
      missionRewardMultiplier: 0.92,
      eventRewardMultiplier: 0.86,
      failurePenaltyMultiplier: 0.78,
      expiryPenaltyMultiplier: 0.74,
      comebackBonusMultiplier: 0.08
    };
  }

  const baseByPhase: Record<MatchPhase, EconomyPhaseProfile> = {
    OPENING: {
      missionRewardMultiplier: 0.95,
      eventRewardMultiplier: 0.9,
      failurePenaltyMultiplier: 0.9,
      expiryPenaltyMultiplier: 0.88,
      comebackBonusMultiplier: 0.08
    },
    MIDGAME: {
      missionRewardMultiplier: 1.0,
      eventRewardMultiplier: 1.0,
      failurePenaltyMultiplier: 1.0,
      expiryPenaltyMultiplier: 1.0,
      comebackBonusMultiplier: 0.12
    },
    FINALE: {
      missionRewardMultiplier: 1.12,
      eventRewardMultiplier: 1.16,
      failurePenaltyMultiplier: 1.1,
      expiryPenaltyMultiplier: 1.12,
      comebackBonusMultiplier: 0.18
    }
  };

  const difficultyDelta = {
    NORMAL: { mission: 1.0, event: 1.0, failure: 1.0, expiry: 1.0, comeback: 0 },
    HARD: { mission: 1.05, event: 1.08, failure: 1.04, expiry: 1.06, comeback: 0.02 },
    EXTREME: { mission: 1.1, event: 1.14, failure: 1.08, expiry: 1.12, comeback: 0.04 },
    TUTORIAL: { mission: 0.92, event: 0.86, failure: 0.78, expiry: 0.74, comeback: 0.08 }
  }[difficulty];

  const modeDelta = {
    [GameMode.NORMAL]: { mission: 1.0, event: 1.0, failure: 1.0, expiry: 1.0, comeback: 0 },
    [GameMode.ENDLESS]: { mission: 0.98, event: 1.02, failure: 0.98, expiry: 1.0, comeback: 0.02 },
    [GameMode.SPEEDRUN]: { mission: 1.04, event: 1.08, failure: 1.06, expiry: 1.06, comeback: 0.02 },
    [GameMode.HARDCORE]: { mission: 1.06, event: 1.1, failure: 1.1, expiry: 1.1, comeback: 0.03 }
  }[mode];

  const stressDelta =
    stressLevel >= 85 ? { mission: 1.04, event: 1.06, failure: 0.9, expiry: 0.9, comeback: 0.07 } :
    stressLevel >= 70 ? { mission: 1.03, event: 1.04, failure: 0.94, expiry: 0.94, comeback: 0.05 } :
    stressLevel <= 30 ? { mission: 1.0, event: 1.0, failure: 1.04, expiry: 1.04, comeback: -0.02 } :
    { mission: 1.0, event: 1.0, failure: 1.0, expiry: 1.0, comeback: 0 };

  const fatigueDelta =
    fatigueMetrics.fatigueLevel >= 0.8 && fatigueMetrics.pressureLevel <= 0.55
      ? { mission: 1.06, event: 1.08, failure: 1.04, expiry: 1.05, comeback: 0.03 }
      : fatigueMetrics.pressureLevel >= 0.75
        ? { mission: 1.0, event: 0.98, failure: 0.88, expiry: 0.86, comeback: 0.06 }
        : { mission: 1.0, event: 1.0, failure: 1.0, expiry: 1.0, comeback: 0 };

  const base = baseByPhase[phase];
  return {
    missionRewardMultiplier: clamp(base.missionRewardMultiplier * difficultyDelta.mission * modeDelta.mission * stressDelta.mission * fatigueDelta.mission, 0.82, 1.48),
    eventRewardMultiplier: clamp(base.eventRewardMultiplier * difficultyDelta.event * modeDelta.event * stressDelta.event * fatigueDelta.event, 0.7, 1.65),
    failurePenaltyMultiplier: clamp(base.failurePenaltyMultiplier * difficultyDelta.failure * modeDelta.failure * stressDelta.failure * fatigueDelta.failure, 0.68, 1.5),
    expiryPenaltyMultiplier: clamp(base.expiryPenaltyMultiplier * difficultyDelta.expiry * modeDelta.expiry * stressDelta.expiry * fatigueDelta.expiry, 0.64, 1.52),
    comebackBonusMultiplier: clamp(base.comebackBonusMultiplier + difficultyDelta.comeback + modeDelta.comeback + stressDelta.comeback + fatigueDelta.comeback, 0, 0.36)
  };
};

export const applyBossMomentToEconomyProfile = (
  profile: EconomyPhaseProfile,
  bossMoment: BossMomentProfile
): EconomyPhaseProfile => {
  if (!bossMoment.active && !bossMoment.recovery) return profile;

  if (bossMoment.active) {
    return {
      missionRewardMultiplier: clamp(profile.missionRewardMultiplier * (1 + (bossMoment.intensity * 0.08)), 0.82, 1.7),
      eventRewardMultiplier: clamp(profile.eventRewardMultiplier * (1 + (bossMoment.intensity * 0.1)), 0.7, 1.8),
      failurePenaltyMultiplier: clamp(profile.failurePenaltyMultiplier * (1 + (bossMoment.intensity * 0.06)), 0.64, 1.6),
      expiryPenaltyMultiplier: clamp(profile.expiryPenaltyMultiplier * (1 + (bossMoment.intensity * 0.08)), 0.62, 1.65),
      comebackBonusMultiplier: clamp(profile.comebackBonusMultiplier + 0.04, 0, 0.4)
    };
  }

  return {
    missionRewardMultiplier: clamp(profile.missionRewardMultiplier * (1 + (bossMoment.intensity * 0.05)), 0.82, 1.7),
    eventRewardMultiplier: clamp(profile.eventRewardMultiplier * 0.96, 0.68, 1.8),
    failurePenaltyMultiplier: clamp(profile.failurePenaltyMultiplier * 0.86, 0.62, 1.6),
    expiryPenaltyMultiplier: clamp(profile.expiryPenaltyMultiplier * 0.84, 0.6, 1.65),
    comebackBonusMultiplier: clamp(profile.comebackBonusMultiplier + 0.06, 0, 0.45)
  };
};

export const getEventResolutionBudgetDelta = (
  severity: 1 | 2 | 3,
  isCorrect: boolean,
  cost: number,
  activeEventsCount: number,
  stats: Pick<GameStats, 'stress' | 'budget'>,
  economyProfile: EconomyPhaseProfile,
  streakState: Pick<EconomyStreakState, 'eventSuccessStreak' | 'eventFailStreak'>
) => {
  if (isCorrect) {
    const baseReward = 65 + (severity * 55) + (Math.min(4, activeEventsCount) * 12);
    const streakBonus = Math.min(0.18, streakState.eventSuccessStreak * 0.03);
    const pressureBonus = stats.stress >= 70 ? economyProfile.comebackBonusMultiplier : 0;
    const budgetBonus = stats.budget <= 1200 ? economyProfile.comebackBonusMultiplier * 0.6 : 0;
    const rewardMultiplier = economyProfile.eventRewardMultiplier * (1 + streakBonus + pressureBonus + budgetBonus);
    const rewardCash = Math.max(0, Math.round(baseReward * rewardMultiplier));
    const netBudgetDelta = rewardCash - cost;
    return {
      rewardCash,
      penaltyCash: 0,
      netBudgetDelta
    };
  }

  const basePenalty = (severity * 45) + (Math.min(4, activeEventsCount) * 14);
  const failStreakPenalty = Math.min(0.22, streakState.eventFailStreak * 0.04);
  const pressureRelief = stats.stress >= 80 ? 0.14 : 0;
  const penaltyMultiplier = economyProfile.failurePenaltyMultiplier * (1 + failStreakPenalty - pressureRelief);
  const penaltyCash = Math.max(0, Math.round(basePenalty * penaltyMultiplier));
  const netBudgetDelta = -(cost + penaltyCash);
  return {
    rewardCash: 0,
    penaltyCash,
    netBudgetDelta
  };
};

export const getExpiredEventsBudgetPenalty = (
  expiredEvents: GameEvent[],
  activeEventsCount: number,
  economyProfile: EconomyPhaseProfile,
  stressLevel: number
) => {
  if (expiredEvents.length === 0) return 0;

  const severityWeight = expiredEvents.reduce((sum, event) => sum + event.severity, 0);
  const basePenalty = (severityWeight * 42) + (Math.min(5, activeEventsCount) * 18);
  const stressRelief = stressLevel >= 85 ? 0.2 : stressLevel >= 70 ? 0.12 : 0;
  const penaltyMultiplier = Math.max(0.6, economyProfile.expiryPenaltyMultiplier - stressRelief);
  return Math.max(0, Math.round(basePenalty * penaltyMultiplier));
};

export const getScenarioCompletionRewards = (
  difficulty: GameScenario['difficulty'],
  isFirstTime: boolean,
  mode: GameMode
) => {
  const pointsByDifficulty = {
    TUTORIAL: { first: 10, repeat: 5 },
    NORMAL: { first: 20, repeat: 10 },
    HARD: { first: 30, repeat: 15 },
    EXTREME: { first: 50, repeat: 25 }
  };
  const reputationByDifficulty = {
    TUTORIAL: { first: 4, repeat: 1 },
    NORMAL: { first: 12, repeat: 4 },
    HARD: { first: 20, repeat: 7 },
    EXTREME: { first: 35, repeat: 12 }
  };
  const modeMultiplier =
    mode === GameMode.HARDCORE ? 1.25 :
    mode === GameMode.SPEEDRUN ? 1.15 :
    mode === GameMode.ENDLESS ? 0.9 :
    1.0;

  const basePoints = isFirstTime ? pointsByDifficulty[difficulty].first : pointsByDifficulty[difficulty].repeat;
  const baseReputation = isFirstTime ? reputationByDifficulty[difficulty].first : reputationByDifficulty[difficulty].repeat;

  return {
    pointsEarned: Math.max(1, Math.round(basePoints * modeMultiplier)),
    reputationEarned: Math.max(1, Math.round(baseReputation * modeMultiplier))
  };
};

export const calculateScenarioScore = (
  mode: GameMode,
  difficulty: GameScenario['difficulty'],
  stats: Pick<GameStats, 'publicInterest' | 'clientSatisfaction' | 'stress' | 'budget'>,
  systems: SystemState[]
) => {
  const boundedStress = Math.min(100, Math.max(0, stats.stress));
  const boundedInterest = Math.min(100, Math.max(0, stats.publicInterest));
  const boundedClient = Math.min(100, Math.max(0, stats.clientSatisfaction));
  const averageSystemHealth = systems.length > 0
    ? systems.reduce((sum, system) => sum + Math.min(100, Math.max(0, system.health)), 0) / systems.length
    : 100;

  const basePerformance =
    (boundedInterest * 3) +
    (boundedClient * 3) +
    ((100 - boundedStress) * 2) +
    (averageSystemHealth * 2) +
    (Math.max(0, stats.budget) / 40);

  const difficultyMultiplier = {
    TUTORIAL: 0.6,
    NORMAL: 1.0,
    HARD: 1.35,
    EXTREME: 1.7
  }[difficulty];

  const modeMultiplier = {
    [GameMode.NORMAL]: 1.0,
    [GameMode.ENDLESS]: 0.95,
    [GameMode.SPEEDRUN]: 1.15,
    [GameMode.HARDCORE]: 1.25
  }[mode];

  return Math.max(1, Math.round(basePerformance * difficultyMultiplier * modeMultiplier));
};

