import { SCENARIOS, PERMANENT_UPGRADES } from '../../constants';
import type { CareerData } from '../../types';

export const CAREER_STORAGE_KEY = 'event_chaos_career';
export const DEFAULT_CAREER: CareerData = {
  totalCash: 0,
  completedScenarios: [],
  highScores: {},
  unlockedAchievements: [],
  unlockedUpgrades: [],
  careerPoints: 0,
  reputation: 0
};

const KNOWN_SCENARIO_IDS = new Set(SCENARIOS.map((scenario) => scenario.id));
const KNOWN_UPGRADE_IDS = new Set(PERMANENT_UPGRADES.map((upgrade) => upgrade.id));

const getNonNegativeNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
};

const normalizeStringArray = (value: unknown, allowedIds?: Set<string>): string[] => {
  if (!Array.isArray(value)) return [];
  const normalized = new Set<string>();

  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    if (allowedIds && !allowedIds.has(entry)) return;
    normalized.add(entry);
  });

  return [...normalized];
};

const normalizeHighScores = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const normalized: Record<string, number> = {};
  Object.entries(value as Record<string, unknown>).forEach(([scenarioId, score]) => {
    if (!KNOWN_SCENARIO_IDS.has(scenarioId)) return;
    const parsedScore = Number(score);
    if (!Number.isFinite(parsedScore)) return;
    normalized[scenarioId] = Math.max(0, parsedScore);
  });

  return normalized;
};

export const normalizeCareerData = (raw: unknown): CareerData => {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Partial<Record<keyof CareerData, unknown>>)
      : {};

  return {
    totalCash: getNonNegativeNumber(source.totalCash),
    completedScenarios: normalizeStringArray(source.completedScenarios, KNOWN_SCENARIO_IDS),
    highScores: normalizeHighScores(source.highScores),
    unlockedAchievements: normalizeStringArray(source.unlockedAchievements),
    unlockedUpgrades: normalizeStringArray(source.unlockedUpgrades, KNOWN_UPGRADE_IDS),
    careerPoints: getNonNegativeNumber(source.careerPoints),
    reputation: getNonNegativeNumber(source.reputation)
  };
};

export const NEW_MISSION_IDS = new Set([
  'balanced_mix',
  'visual_impact',
  'stage_security',
  'full_throttle',
  'cooldown_window',
  'arena_transition',
  'pyro_guard',
  'broadcast_lock',
  'blackout_containment',
  'precision_drop',
  'arena_split_cue',
  'tour_broadcast_sync',
  'blackout_triage'
]);
