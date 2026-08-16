import { GameMode, SystemType } from '../../types';
import type { EventDefinition, GameEvent, GameEventOption, GameScenario } from '../../types';
import { clamp } from './math';

export const getEventConcurrencyCap = (
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  stressLevel: number
) => {
  const difficultyBase = {
    TUTORIAL: 1,
    NORMAL: 3,
    HARD: 4,
    EXTREME: 5
  }[difficulty];

  const modeDelta =
    mode === GameMode.HARDCORE
      ? 1
      : mode === GameMode.SPEEDRUN
        ? 1
        : mode === GameMode.ENDLESS
          ? 0
          : 0;
  const stressDelta = stressLevel >= 80 ? 1 : stressLevel <= 20 ? -1 : 0;

  if (difficulty === 'TUTORIAL') return 1;
  return clamp(difficultyBase + modeDelta + stressDelta, 2, 6);
};

export const getStaticEventSeverityChance = (
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  stressLevel: number,
  activeEventsCount: number
) => {
  const baseByDifficulty = {
    TUTORIAL: 0.05,
    NORMAL: 0.15,
    HARD: 0.5,
    EXTREME: 0.7
  }[difficulty];
  const modeDelta =
    mode === GameMode.HARDCORE
      ? 0.12
      : mode === GameMode.SPEEDRUN
        ? 0.08
        : mode === GameMode.ENDLESS
          ? -0.04
          : 0;
  const stressDelta = clamp((stressLevel - 50) / 250, -0.12, 0.22);
  const loadDelta = activeEventsCount >= 4 ? -0.06 : activeEventsCount <= 1 ? 0.04 : 0;

  return clamp(baseByDifficulty + modeDelta + stressDelta + loadDelta, 0.05, 0.9);
};

export const getStaticEventSpawnDelayMs = (
  difficulty: GameScenario['difficulty'],
  mode: GameMode,
  stressLevel: number,
  activeEventsCount: number,
  randomFactor: number = Math.random()
) => {
  const baseByDifficulty = {
    TUTORIAL: 60000,
    NORMAL: 15000,
    HARD: 11000,
    EXTREME: 9000
  }[difficulty];
  const modeMultiplier =
    mode === GameMode.SPEEDRUN
      ? 0.62
      : mode === GameMode.HARDCORE
        ? 0.72
        : mode === GameMode.ENDLESS
          ? 0.86
          : 1.0;
  const stressMultiplier =
    stressLevel >= 85 ? 0.72 : stressLevel >= 65 ? 0.85 : stressLevel <= 20 ? 1.14 : 1.0;
  const loadMultiplier = activeEventsCount >= 4 ? 1.22 : activeEventsCount <= 1 ? 0.94 : 1.0;

  const normalizedRandom = clamp(randomFactor, 0, 1);
  const jitter = 0.88 + normalizedRandom * 0.24;
  return Math.max(
    3500,
    Math.round(baseByDifficulty * modeMultiplier * stressMultiplier * loadMultiplier * jitter)
  );
};

export const buildMinigameResolutionOption = (
  option: GameEventOption,
  success: boolean
): GameEventOption => {
  if (success) return option;
  return {
    ...option,
    isCorrect: false,
    // Prevent negative stress on failure when the base option has a negative impact.
    stressImpact: Math.max(10, Math.abs(option.stressImpact))
  };
};

export const createEscalatedEvent = (
  event: GameEvent,
  systemEvents: EventDefinition[],
  now: number,
  idFactory: () => string = () => Math.random().toString(36).slice(2, 11)
): GameEvent | null => {
  const eventDef = systemEvents.find((def) => def.title === event.title);
  if (!eventDef?.escalationEvent) return null;

  const escalationDef = systemEvents.find((def) => def.title === eventDef.escalationEvent);
  if (!escalationDef) return null;

  const escalatedSeverity: 1 | 2 | 3 =
    event.severity === 3 ? 3 : ((event.severity + 1) as 1 | 2 | 3);
  const remainingMs = Math.max(1000, event.expiresAt - now);

  return {
    id: idFactory(),
    systemId: event.systemId,
    title: escalationDef.title,
    description: `${escalationDef.description} (Escalado desde: ${event.title})`,
    severity: escalatedSeverity,
    expiresAt: now + remainingMs,
    correctAction: '',
    options: escalationDef.options,
    priority: escalationDef.priority || 9,
    canEscalate: escalationDef.canEscalate || false,
    escalationTime: escalationDef.escalationTime
      ? now + escalationDef.escalationTime * 1000
      : undefined,
    escalatedFrom: event.id,
    relatedEvents: [event.id]
  };
};

export interface CascadeTarget {
  systemId: SystemType;
  definition: EventDefinition;
}

export const getCrossSystemCascadeTargets = (
  sourceEvent: GameEvent,
  sourceDefinition: EventDefinition | undefined,
  allSystemEvents: Record<SystemType, EventDefinition[]>,
  activeTitles: Set<string>,
  eventCooldowns: Map<string, number>,
  now: number,
  isEventAllowedForScenario: (allowedScenarios: string[] | undefined) => boolean
): CascadeTarget[] => {
  if (!sourceDefinition?.relatedTo || sourceDefinition.relatedTo.length === 0) return [];

  const relatedTitles = new Set(sourceDefinition.relatedTo);
  const targets: CascadeTarget[] = [];

  (Object.values(SystemType) as SystemType[]).forEach((systemId) => {
    if (systemId === sourceEvent.systemId) return;
    const systemDefinitions = allSystemEvents[systemId] || [];
    systemDefinitions.forEach((definition) => {
      if (!relatedTitles.has(definition.title)) return;
      if (activeTitles.has(definition.title)) return;
      if ((eventCooldowns.get(definition.title) || 0) > now) return;
      if (!isEventAllowedForScenario(definition.allowedScenarios)) return;

      targets.push({ systemId, definition });
    });
  });

  return targets;
};

export const createRelatedCascadeEvent = (
  sourceEvent: GameEvent,
  targetSystemId: SystemType,
  targetDefinition: EventDefinition,
  now: number,
  severityBonus: number = 0,
  idFactory: () => string = () => Math.random().toString(36).slice(2, 11)
): GameEvent => {
  const priorityWeight = targetDefinition.priority ? (targetDefinition.priority >= 8 ? 1 : 0) : 0;
  const severity = clamp(
    Math.round(sourceEvent.severity + priorityWeight + severityBonus),
    1,
    3
  ) as 1 | 2 | 3;
  const baseDurationSeconds = severity === 3 ? 20 : severity === 2 ? 30 : 42;

  return {
    id: idFactory(),
    systemId: targetSystemId,
    title: targetDefinition.title,
    description: `${targetDefinition.description} (Impacto en cadena desde: ${sourceEvent.title})`,
    severity,
    expiresAt: now + baseDurationSeconds * 1000,
    correctAction: '',
    options: targetDefinition.options,
    priority: targetDefinition.priority || (severity === 3 ? 9 : severity === 2 ? 6 : 4),
    canEscalate: targetDefinition.canEscalate || false,
    escalationTime: targetDefinition.escalationTime
      ? now + targetDefinition.escalationTime * 1000
      : undefined,
    escalatedFrom: sourceEvent.id,
    relatedEvents: [sourceEvent.id]
  };
};

export const pickScenarioWeightedEvent = <T extends { allowedScenarios?: string[] }>(
  events: T[],
  scenarioId: string
): T | null => {
  if (events.length === 0) return null;

  const weightedPool = events.flatMap((event) => {
    const hasDirectScenarioMatch = event.allowedScenarios?.includes(scenarioId);
    const weight = hasDirectScenarioMatch ? 3 : 1;
    return Array.from({ length: weight }, () => event);
  });

  return weightedPool[Math.floor(Math.random() * weightedPool.length)] || events[0];
};
