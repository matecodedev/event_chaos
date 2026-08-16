import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, GameStats, SystemState, SystemType, GameEvent, GameScenario, GameEventOption, CareerData, ShopItem, ActiveMission, GameMode, EventDefinition, MissionDefinition } from '../types';
import { GAME_DURATION, INITIAL_STATS, WIN_CONDITIONS, SYSTEM_EVENTS, SCENARIOS, CREW_MEMBERS, SHOP_ITEMS, CLIENT_MISSIONS, PERMANENT_UPGRADES } from '../constants';
import { useAIEventGenerator } from './useAIEventGenerator';
import { resolvePlayableScenario } from '../utils/scenarioUnlocks';
import { readStoredValue, writeStoredJson } from '../utils/safeStorage';

import { clamp } from './gameLogic/math';
import { CAREER_STORAGE_KEY, DEFAULT_CAREER, NEW_MISSION_IDS, normalizeCareerData } from './gameLogic/career';
import {
  DEFAULT_PHASE_DIRECTOR_PROFILE,
  DEFAULT_SESSION_DIRECTOR_TELEMETRY,
  composeDirectorProfile,
  getAdaptiveDirectorAdjustments,
  getMatchPhase,
  getModeDuration,
  getPhaseDirectorProfile,
  getProceduralInjectionProfile,
  getSessionDifficultyTarget,
  getSessionFatigueMetrics,
  pushRecentOutcome
} from './gameLogic/director';
import type { PhaseDirectorProfile, SessionDirectorTelemetry } from './gameLogic/director';
import {
  applyBossMomentToDirectorProfile,
  applyBossMomentToProceduralProfile,
  getScenarioBossMomentProfile
} from './gameLogic/bossMoments';
import {
  getMissionRewardCash,
  getMissionRewardPacingMultiplier,
  getMissionTimeoutBudgetPenalty,
  pickAdaptiveMissionFromQueue
} from './gameLogic/missions';
import {
  buildMinigameResolutionOption,
  createEscalatedEvent,
  createRelatedCascadeEvent,
  getCrossSystemCascadeTargets,
  getEventConcurrencyCap,
  getStaticEventSeverityChance,
  getStaticEventSpawnDelayMs,
  pickScenarioWeightedEvent
} from './gameLogic/events';
import {
  DEFAULT_ECONOMY_PROFILE,
  DEFAULT_ECONOMY_STREAK,
  applyBossMomentToEconomyProfile,
  calculateScenarioScore,
  getEventResolutionBudgetDelta,
  getExpiredEventsBudgetPenalty,
  getPhaseEconomyProfile,
  getScenarioCompletionRewards
} from './gameLogic/economy';
import type { EconomyPhaseProfile, EconomyStreakState } from './gameLogic/economy';
import { getPermanentGameplayModifiers } from './gameLogic/upgrades';
import type { PermanentGameplayModifiers } from './gameLogic/upgrades';
import {
  applyTutorialSafetyNet,
  getTimerEndOutcome,
  shouldTriggerImmediateGameOver,
  getCrewAutoHealPer5Seconds,
  getCrewDriftMultiplier,
  getCrewStressMultiplier
} from './gameLogic/sessionRules';
import type { EventResolutionTelemetry } from './gameLogic/sessionRules';

// The pure rules of the game live in ./gameLogic/*. They are re-exported here so
// the hook stays the single public entry point for callers and tests.
export * from './gameLogic/sessionRules';
export * from './gameLogic/career';
export * from './gameLogic/director';
export * from './gameLogic/bossMoments';
export * from './gameLogic/missions';
export * from './gameLogic/events';
export * from './gameLogic/economy';
export * from './gameLogic/upgrades';

export const useGameLogic = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [stats, setStats] = useState<GameStats>({ ...INITIAL_STATS, timeRemaining: GAME_DURATION });
  const [currentGameMode, setCurrentGameMode] = useState<GameMode>(GameMode.NORMAL);
  const [currentScenario, setCurrentScenario] = useState<GameScenario>(SCENARIOS[0]);
  const [activeMinigame, setActiveMinigame] = useState<{eventId: string, type: 'CABLES' | 'FREQUENCY'} | null>(null);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  
  // Tutorial State
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState(0);

  // Career State
  const [careerData, setCareerData] = useState<CareerData>(DEFAULT_CAREER);

  // Crew & Inventory State
  const [crewBonus, setCrewBonus] = useState<string | null>(null);
  const [inventory, setInventory] = useState<string[]>([]);
  
  const [pendingStartData, setPendingStartData] = useState<{scenarioId: string, crewId: string, gameMode: GameMode} | null>(null);

  const [systems, setSystems] = useState<Record<SystemType, SystemState>>({
    [SystemType.SOUND]: { 
        id: SystemType.SOUND, name: 'Sound', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: 1.0 
    },
    [SystemType.LIGHTS]: { 
        id: SystemType.LIGHTS, name: 'Lights', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: 1.0 
    },
    [SystemType.VIDEO]: { 
        id: SystemType.VIDEO, name: 'Video', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: 1.0
    },
    [SystemType.STAGE]: { 
        id: SystemType.STAGE, name: 'Stage', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: 1.0
    },
  });

  const [activeEvents, setActiveEvents] = useState<GameEvent[]>([]);
  const { generateAIEvents, isGeneratingEvents } = useAIEventGenerator();
  
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(Date.now());
  const aiCooldownRef = useRef<number>(0);
  const nextStaticEventTimeRef = useRef<number>(0);
  const nextCascadeTimeRef = useRef<number>(0);
  const nextMissionTimeRef = useRef<number>(0);
  const eventCooldownsRef = useRef<Map<string, number>>(new Map());
  const missionQueueRef = useRef<string[]>([]);
  const missionQueueIndexRef = useRef<number>(0);
  const statsRef = useRef(stats);
  const systemsRef = useRef(systems);
  const activeEventsRef = useRef(activeEvents);
  const sessionDirectorTelemetryRef = useRef<SessionDirectorTelemetry>({
    ...DEFAULT_SESSION_DIRECTOR_TELEMETRY,
    recentOutcomes: []
  });
  const adaptiveDifficultyBiasRef = useRef<number>(0);
  const runtimeDirectorRef = useRef<PhaseDirectorProfile>(DEFAULT_PHASE_DIRECTOR_PROFILE);
  const runtimeEconomyProfileRef = useRef<EconomyPhaseProfile>({ ...DEFAULT_ECONOMY_PROFILE });
  const economyStreakRef = useRef<EconomyStreakState>({ ...DEFAULT_ECONOMY_STREAK });
  const activeMissionRef = useRef(activeMission);
  const currentScenarioRef = useRef(currentScenario);
  const currentGameModeRef = useRef(currentGameMode);
  const crewBonusRef = useRef(crewBonus);
  const isGeneratingEventsRef = useRef(isGeneratingEvents);
  const eventResolutionCallbackRef = useRef<((result: EventResolutionTelemetry) => void) | null>(null);

  useEffect(() => {
    systemsRef.current = systems;
  }, [systems]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    activeEventsRef.current = activeEvents;
  }, [activeEvents]);

  useEffect(() => {
    activeMissionRef.current = activeMission;
  }, [activeMission]);

  useEffect(() => {
    currentScenarioRef.current = currentScenario;
  }, [currentScenario]);

  useEffect(() => {
    currentGameModeRef.current = currentGameMode;
  }, [currentGameMode]);

  useEffect(() => {
    crewBonusRef.current = crewBonus;
  }, [crewBonus]);

  useEffect(() => {
    isGeneratingEventsRef.current = isGeneratingEvents;
  }, [isGeneratingEvents]);

  const isEventAllowedForScenario = useCallback((allowedScenarios: string[] | undefined, scenario: GameScenario) => {
    if (!allowedScenarios || allowedScenarios.length === 0) return true;
    if (allowedScenarios.includes(scenario.id)) return true;

    const HARD_SCENARIOS = ['ROCKSTAR', 'FESTIVAL', 'ARENA'];
    const EXTREME_SCENARIOS = ['EXTREME', 'WORLD_TOUR', 'BLACKOUT_PROTOCOL'];

    if (scenario.difficulty === 'HARD') {
      return allowedScenarios.some(id => HARD_SCENARIOS.includes(id));
    }

    if (scenario.difficulty === 'EXTREME') {
      return allowedScenarios.some(id => EXTREME_SCENARIOS.includes(id) || HARD_SCENARIOS.includes(id));
    }

    return false;
  }, []);

  const shuffleIds = useCallback((ids: string[]) => {
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const getMissionPoolForScenario = useCallback((scenario: GameScenario) => {
    if (scenario.isTutorial) return [];

    const directPool = CLIENT_MISSIONS.filter(mission =>
      !mission.allowedScenarios || mission.allowedScenarios.includes(scenario.id)
    );

    if (directPool.length > 0) return directPool;
    return CLIENT_MISSIONS.filter(mission => !mission.allowedScenarios || mission.allowedScenarios.length === 0);
  }, []);

  const refillMissionQueue = useCallback((prioritizeNew: boolean) => {
    const missionPool = getMissionPoolForScenario(currentScenarioRef.current);
    const allIds = missionPool.map(mission => mission.id);
    if (allIds.length === 0) {
      missionQueueRef.current = [];
      missionQueueIndexRef.current = 0;
      return;
    }

    if (!prioritizeNew) {
      missionQueueRef.current = shuffleIds(allIds);
      missionQueueIndexRef.current = 0;
      return;
    }

    const newIds = allIds.filter(id => NEW_MISSION_IDS.has(id));
    const legacyIds = allIds.filter(id => !NEW_MISSION_IDS.has(id));
    missionQueueRef.current = [...shuffleIds(newIds), ...shuffleIds(legacyIds)];
    missionQueueIndexRef.current = 0;
  }, [getMissionPoolForScenario, shuffleIds]);

  // LOAD CAREER ON MOUNT
  useEffect(() => {
      const saved = readStoredValue(CAREER_STORAGE_KEY);
      if (saved) {
          try {
              const parsed = JSON.parse(saved);
              const loadedCareer = normalizeCareerData(parsed);
              setCareerData(loadedCareer);
              writeStoredJson(CAREER_STORAGE_KEY, loadedCareer);
          } catch (e) {
              console.error("Failed to load save", e);
              // Reset to default if corrupted
              setCareerData(DEFAULT_CAREER);
              writeStoredJson(CAREER_STORAGE_KEY, DEFAULT_CAREER);
          }
      } else {
          // If no save exists, ensure we start with default
          setCareerData(DEFAULT_CAREER);
      }
  }, []);

  const saveCareer = useCallback((data: CareerData) => {
      const normalized = normalizeCareerData(data);
      setCareerData(normalized);
      writeStoredJson(CAREER_STORAGE_KEY, normalized);
  }, []);

  const handleFaderChange = (id: SystemType, value: number) => {
      setSystems(prev => {
          const next = {
              ...prev,
              [id]: {
                  ...prev[id],
                  faderValue: value
              }
          };
          systemsRef.current = next;
          return next;
      });
  };

  const initializeSession = (scenarioId: string = 'NORMAL', crewId: string = 'VETERAN', gameMode: GameMode = GameMode.NORMAL) => {
      const scenario = resolvePlayableScenario(scenarioId, SCENARIOS, careerData);
      const crew = CREW_MEMBERS.find(c => c.id === crewId);
      
      setCurrentScenario(scenario);
      currentScenarioRef.current = scenario;
      setCurrentGameMode(gameMode);
      currentGameModeRef.current = gameMode;
      setCrewBonus(crew ? crew.bonus : null);
      crewBonusRef.current = crew ? crew.bonus : null;
      
      const baseBudget = scenario.initialBudget + (crew?.bonus === 'MORE_BUDGET' ? 2500 : 0);
      setStats({ ...INITIAL_STATS, budget: baseBudget, timeRemaining: getModeDuration(gameMode) });
      setInventory([]); 
      
      setPendingStartData({ scenarioId: scenario.id, crewId, gameMode });
      
      if (scenario.isTutorial) {
          startGame(baseBudget, scenario);
      } else {
          setGameState(GameState.SHOP);
      }

      return scenario.id;
  };

  const buyItem = (item: ShopItem) => {
      if (stats.budget >= item.cost && !inventory.includes(item.id)) {
          setStats(prev => ({ ...prev, budget: prev.budget - item.cost }));
          setInventory(prev => [...prev, item.id]);
      }
  };

  const startGame = (overrideBudget?: number, scenarioOverride?: GameScenario) => {
    const scenario = scenarioOverride ?? currentScenarioRef.current;
    currentScenarioRef.current = scenario;
    const gameMode = currentGameModeRef.current;
    const permanentModifiers = getPermanentGameplayModifiers(careerData.unlockedUpgrades);
    
    let driftModifier = 1.0;
    let stressResist = 1.0;
    let autoHealPer5Seconds = 0;
    let finalBudget = overrideBudget !== undefined ? overrideBudget : stats.budget; 

    inventory.forEach(itemId => {
        const item = SHOP_ITEMS.find(i => i.id === itemId);
        if (item) {
            // STABILITY: Reduce drift en porcentaje (ej: 20% = reduce a 80% del drift original)
            if (item.effect === 'STABILITY') {
                driftModifier *= (1 - item.value / 100);
            }
            // STRESS_RESIST: Reduce el aumento de estrés en porcentaje (ej: 15% = reduce aumento a 85%)
            if (item.effect === 'STRESS_RESIST') {
                stressResist *= (1 - item.value / 100);
            }
            if (item.effect === 'AUTO_HEAL') autoHealPer5Seconds = item.value;
            if (item.effect === 'BUDGET_MULTIPLIER') finalBudget += item.value;
        }
    });
    autoHealPer5Seconds += getCrewAutoHealPer5Seconds(crewBonusRef.current);

    setGameState(GameState.PLAYING);
    setActiveMinigame(null);
    setActiveMission(null);
    activeMissionRef.current = null;
    refillMissionQueue(true);

    if (scenario.isTutorial) {
        setTutorialActive(true);
        setTutorialStepIndex(0);
    } else {
        setTutorialActive(false);
    }

    setStats({ ...INITIAL_STATS, budget: finalBudget, timeRemaining: getModeDuration(gameMode) });
    setActiveEvents([]);
    activeEventsRef.current = [];
    eventCooldownsRef.current.clear(); 
    sessionDirectorTelemetryRef.current = {
      ...DEFAULT_SESSION_DIRECTOR_TELEMETRY,
      recentOutcomes: []
    };
    adaptiveDifficultyBiasRef.current = 0;
    runtimeDirectorRef.current = { ...DEFAULT_PHASE_DIRECTOR_PROFILE };
    runtimeEconomyProfileRef.current = { ...DEFAULT_ECONOMY_PROFILE };
    economyStreakRef.current = { ...DEFAULT_ECONOMY_STREAK };
    
    const modeDriftMultiplier =
      gameMode === GameMode.HARDCORE ? 1.2 :
      gameMode === GameMode.SPEEDRUN ? 1.1 :
      gameMode === GameMode.ENDLESS ? 1.05 :
      1.0;
    const driftBase = (scenario.isTutorial ? 0.8 : (scenario.difficulty === 'NORMAL' ? 1.7 : 2.2)) * driftModifier * modeDriftMultiplier;

    setSystems({
      [SystemType.SOUND]: { 
        id: SystemType.SOUND, name: 'Sound', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase 
      },
      [SystemType.LIGHTS]: { 
        id: SystemType.LIGHTS, name: 'Lights', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase + 0.2
      },
      [SystemType.VIDEO]: { 
        id: SystemType.VIDEO, name: 'Video', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase - 0.2
      },
      [SystemType.STAGE]: { 
        id: SystemType.STAGE, name: 'Stage', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase - 0.4
      },
    });
    systemsRef.current = {
      [SystemType.SOUND]: {
        id: SystemType.SOUND, name: 'Sound', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase
      },
      [SystemType.LIGHTS]: {
        id: SystemType.LIGHTS, name: 'Lights', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase + 0.2
      },
      [SystemType.VIDEO]: {
        id: SystemType.VIDEO, name: 'Video', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase - 0.2
      },
      [SystemType.STAGE]: {
        id: SystemType.STAGE, name: 'Stage', health: 100, status: 'OK',
        faderValue: 50, stability: 100, driftSpeed: driftBase - 0.4
      },
    };
    lastTickRef.current = Date.now();
    const now = Date.now();
    aiCooldownRef.current = now + (scenario.id === 'NORMAL' ? 10000 : 8000);
    nextStaticEventTimeRef.current = scenario.isTutorial
      ? now + 999999
      : now + getStaticEventSpawnDelayMs(scenario.difficulty, gameMode, 0, 0);
    nextCascadeTimeRef.current = now + 8000;
    const missionSpawnBase =
      scenario.difficulty === 'EXTREME' ? 11000 :
      scenario.difficulty === 'HARD' ? 13000 :
      15000;
    const missionSpawnModeMultiplier =
      gameMode === GameMode.SPEEDRUN ? 0.7 :
      gameMode === GameMode.HARDCORE ? 0.85 :
      1.0;
    nextMissionTimeRef.current = Date.now() + (scenario.isTutorial ? 999999 : Math.round(missionSpawnBase * missionSpawnModeMultiplier));

    modifiersRef.current = { stressResist: stressResist * permanentModifiers.stressMultiplier, autoHealPer5Seconds };
    autoHealPulseRef.current = Date.now() + 5000;
    permanentModifiersRef.current = permanentModifiers;
  };

  const modifiersRef = useRef({ stressResist: 1.0, autoHealPer5Seconds: 0 });
  const autoHealPulseRef = useRef<number>(Date.now() + 5000);
  const permanentModifiersRef = useRef<PermanentGameplayModifiers>(getPermanentGameplayModifiers([]));
  const applyComboBonusRef = useRef<((bonus: { type: string; amount: number; message: string }) => void) | null>(null);

  const applyComboBonus = useCallback((bonus: { type: string; amount: number; message: string }) => {
    setStats(prev => {
      let newBudget = prev.budget + Math.round(bonus.amount * permanentModifiersRef.current.rewardMultiplier);
      let newStress = prev.stress;
      
      if (bonus.type === 'STREAK_30') {
        newStress = Math.max(0, newStress - 10);
      } else if (bonus.type === 'STREAK_60') {
        newStress = Math.max(0, newStress - 20);
        // Could trigger special event here
      }
      
      return {
        ...prev,
        budget: newBudget,
        stress: newStress
      };
    });
  }, []);

  const setComboBonusCallback = useCallback((callback: (bonus: { type: string; amount: number; message: string }) => void) => {
    applyComboBonusRef.current = callback;
  }, []);

  const setEventResolutionCallback = useCallback((callback: (result: EventResolutionTelemetry) => void) => {
    eventResolutionCallbackRef.current = callback;
  }, []);

  const advanceTutorial = () => {
     setTutorialStepIndex(prev => prev + 1);
  };

  const finishTutorial = () => {
      setTutorialActive(false);
      nextStaticEventTimeRef.current = Date.now() + 5000;
  };

  const togglePause = () => {
    if (gameState === GameState.PLAYING) {
      setGameState(GameState.PAUSED);
    } else if (gameState === GameState.PAUSED) {
      setGameState(GameState.PLAYING);
    }
  };

  const quitGame = () => {
    setGameState(GameState.MENU);
  };

  const generateStaticEvent = useCallback(() => {
    setActiveEvents(currentEvents => {
      const scenario = currentScenarioRef.current;
      const mode = currentGameModeRef.current;
      const now = Date.now();
      const eventTimeMultiplier = scenario.isTutorial ? 1 : permanentModifiersRef.current.eventTimeMultiplier;
      const stressNow = statsRef.current.stress;
      const runtimeSeverityDelta = runtimeDirectorRef.current.severityDelta;
      const activeTitles = new Set(currentEvents.map(e => e.title));
      const systemTypes = Object.values(SystemType).sort(() => Math.random() - 0.5);

      for (const sys of systemTypes) {
        const possibleEvents = SYSTEM_EVENTS[sys];

        const validEvents = possibleEvents.filter(def => {
          const onCooldown = (eventCooldownsRef.current.get(def.title) || 0) > now;
          const isActive = activeTitles.has(def.title);
          const isScenarioAllowed = isEventAllowedForScenario(def.allowedScenarios, scenario);
          return !onCooldown && !isActive && isScenarioAllowed;
        });

        if (validEvents.length > 0) {
          const eventDef = pickScenarioWeightedEvent(validEvents, scenario.id) || validEvents[0];
          const severityChance = getStaticEventSeverityChance(
            scenario.difficulty,
            mode,
            stressNow,
            currentEvents.length
          );
          const adjustedSeverityChance = clamp(severityChance + runtimeSeverityDelta, 0.05, 0.95);

          const severity = Math.random() < adjustedSeverityChance ? (Math.random() > 0.5 ? 3 : 2) : 1;
          let duration = severity === 3 ? 20 : severity === 2 ? 30 : 45;

          if (scenario.isTutorial) duration = 60;
          duration = Math.max(10, Math.round(duration * eventTimeMultiplier));

          const newEvent: GameEvent = {
            id: Math.random().toString(36).slice(2, 11),
            systemId: sys,
            title: eventDef.title,
            description: eventDef.description,
            severity: scenario.isTutorial ? 1 : (severity as 1 | 2 | 3),
            expiresAt: now + (duration * 1000),
            correctAction: "",
            options: eventDef.options,
            priority: eventDef.priority || (severity === 3 ? 9 : severity === 2 ? 6 : 3),
            canEscalate: eventDef.canEscalate || false,
            escalationTime: eventDef.escalationTime ? now + (eventDef.escalationTime * 1000) : undefined,
            relatedEvents: eventDef.relatedTo ? [] : undefined
          };

          return [...currentEvents, newEvent];
        }
      }

      return currentEvents;
    });
  }, [isEventAllowedForScenario]);

  const resolveEvent = (eventId: string, option: GameEventOption) => {
    if (option.requiresMinigame) {
        setActiveMinigame({ eventId, type: option.requiresMinigame });
        return;
    }
    applyEventResolution(eventId, option);
  };

  const completeMinigame = (success: boolean) => {
      if (!activeMinigame) return;
      const event = activeEventsRef.current.find(e => e.id === activeMinigame.eventId);
      if (event) {
          const option = event.options.find(o => o.requiresMinigame === activeMinigame.type);
          if (option) {
              const resultOption = buildMinigameResolutionOption(option, success);
              applyEventResolution(event.id, resultOption);
          }
      }
      setActiveMinigame(null);
  };

  const applyEventResolution = (eventId: string, option: GameEventOption) => {
    const event = activeEventsRef.current.find(e => e.id === eventId);
    if (!event) return;

    const isCorrect = option.isCorrect;
    const stressImpact = option.stressImpact;
    const baseCost = option.cost || 0;
    const cost = Math.max(0, Math.round(baseCost * permanentModifiersRef.current.costMultiplier));
    const scenario = currentScenarioRef.current;
    const activeEventsCount = activeEventsRef.current.length;
    const economyProfile = runtimeEconomyProfileRef.current;
    const economyStreakState = economyStreakRef.current;

    setStats(prev => {
       const budgetOutcome = getEventResolutionBudgetDelta(
         event.severity,
         isCorrect,
         cost,
         activeEventsCount,
         { stress: prev.stress, budget: prev.budget },
         economyProfile,
         economyStreakState
       );
       const newBudget = prev.budget + budgetOutcome.netBudgetDelta;
       let newStress = prev.stress;
       let newPublic = prev.publicInterest;
       let newClient = prev.clientSatisfaction;

       if (isCorrect) {
           const reductionMultiplier = scenario.difficulty === 'NORMAL' || scenario.isTutorial ? 1.5 : 1.2; 
           const residualStress = scenario.difficulty === 'NORMAL' ? 0 : stressImpact;
           
           newStress = Math.max(0, newStress - (15 * reductionMultiplier) + residualStress); 
           newClient = Math.min(100, newClient + 10); 
           newPublic = Math.min(100, newPublic + 10);
           eventCooldownsRef.current.set(event.title, Date.now() + 80000);
           
           setSystems(s => {
             const next = {
               ...s,
               [event.systemId]: { ...s[event.systemId], health: Math.min(100, s[event.systemId].health + 30) }
             };
             systemsRef.current = next;
             return next;
           });

       } else {
           newStress = Math.min(100, newStress + stressImpact);
           newPublic = Math.max(0, newPublic - 5);
           newClient = Math.max(0, newClient - 5);
           eventCooldownsRef.current.set(event.title, Date.now() + 40000); 
       }

       return {
           ...prev,
           stress: newStress,
           clientSatisfaction: newClient,
           publicInterest: newPublic,
           budget: newBudget
       };
    });

    const telemetry = sessionDirectorTelemetryRef.current;
    sessionDirectorTelemetryRef.current = {
      ...telemetry,
      resolvedEvents: isCorrect ? telemetry.resolvedEvents + 1 : telemetry.resolvedEvents,
      failedEvents: isCorrect ? telemetry.failedEvents : telemetry.failedEvents + 1,
      totalSpend: telemetry.totalSpend + cost,
      recentOutcomes: pushRecentOutcome(
        telemetry.recentOutcomes,
        isCorrect ? 'SUCCESS' : 'FAIL'
      )
    };
    economyStreakRef.current = isCorrect
      ? {
        ...economyStreakRef.current,
        eventSuccessStreak: economyStreakRef.current.eventSuccessStreak + 1,
        eventFailStreak: 0
      }
      : {
        ...economyStreakRef.current,
        eventSuccessStreak: 0,
        eventFailStreak: economyStreakRef.current.eventFailStreak + 1
      };

    eventResolutionCallbackRef.current?.({
      success: isCorrect,
      cost,
      systemId: event.systemId,
      severity: event.severity,
      eventTitle: event.title,
      eventId: event.id
    });

    setActiveEvents(prev => {
      const next = prev.filter(e => e.id !== eventId);
      activeEventsRef.current = next;
      return next;
    });
  };

  // Main Loop
  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;
    if (tutorialActive) return;

    timerRef.current = window.setInterval(() => {
      const now = Date.now();
      const scenario = currentScenarioRef.current;
      const gameMode = currentGameModeRef.current;
      const crew = crewBonusRef.current;
      const currentEvents = activeEventsRef.current;
      const currentMission = activeMissionRef.current;
      const stressNow = statsRef.current.stress;
      const matchPhase = getMatchPhase(
        gameMode,
        statsRef.current.timeRemaining,
        getModeDuration(gameMode),
        stressNow
      );
      const phaseProfile = getPhaseDirectorProfile(
        scenario.difficulty,
        gameMode,
        matchPhase,
        stressNow
      );
      const sessionTelemetry = sessionDirectorTelemetryRef.current;
      const attemptsCount = sessionTelemetry.resolvedEvents + sessionTelemetry.failedEvents + sessionTelemetry.expiredEvents;
      const sessionTarget = getSessionDifficultyTarget(
        scenario.difficulty,
        sessionTelemetry,
        { stress: stressNow, budget: statsRef.current.budget },
        currentEvents.length,
        scenario.initialBudget + (crew === 'MORE_BUDGET' ? 2500 : 0)
      );
      const smoothedSessionTarget = clamp(
        (adaptiveDifficultyBiasRef.current * 0.88) + (sessionTarget * 0.12),
        -1,
        1
      );
      adaptiveDifficultyBiasRef.current = smoothedSessionTarget;
      const adaptiveAdjustments = getAdaptiveDirectorAdjustments(smoothedSessionTarget);
      const fatigueMetrics = getSessionFatigueMetrics(
        gameMode,
        statsRef.current.timeRemaining,
        getModeDuration(gameMode),
        sessionTelemetry,
        { stress: stressNow, budget: statsRef.current.budget },
        currentEvents.length
      );
      const bossMomentProfile = getScenarioBossMomentProfile(
        scenario.id,
        scenario.difficulty,
        gameMode,
        matchPhase,
        fatigueMetrics,
        currentEvents.length,
        attemptsCount
      );
      const runtimeDirectorProfileBase = composeDirectorProfile(phaseProfile, adaptiveAdjustments);
      const runtimeDirectorProfile = applyBossMomentToDirectorProfile(
        runtimeDirectorProfileBase,
        bossMomentProfile
      );
      runtimeDirectorRef.current = runtimeDirectorProfile;
      const economyProfileBase = getPhaseEconomyProfile(
        scenario.difficulty,
        gameMode,
        matchPhase,
        stressNow,
        {
          fatigueLevel: fatigueMetrics.fatigueLevel,
          pressureLevel: fatigueMetrics.pressureLevel
        }
      );
      const runtimeEconomyProfile = applyBossMomentToEconomyProfile(
        economyProfileBase,
        bossMomentProfile
      );
      runtimeEconomyProfileRef.current = runtimeEconomyProfile;
      const proceduralInjectionProfileBase = getProceduralInjectionProfile(
        scenario.difficulty,
        gameMode,
        fatigueMetrics,
        currentEvents.length
      );
      const proceduralInjectionProfile = applyBossMomentToProceduralProfile(
        proceduralInjectionProfileBase,
        bossMomentProfile
      );
      lastTickRef.current = now;

      // 0. SYSTEM MECHANICS UPDATE
      setSystems(prevSystems => {
        const nextSystems = { ...prevSystems };
        let totalPenalty = 0;
        const healPulseReady = now >= autoHealPulseRef.current;

        (Object.keys(nextSystems) as SystemType[]).forEach(key => {
          const sys = nextSystems[key];
          const hasEvents = currentEvents.some(e => e.systemId === key);
          const driftDirection = Math.random() > 0.5 ? 1 : -1;
          const eventMultiplier = hasEvents ? 2.5 : 1;
          const crewMultiplier = getCrewDriftMultiplier(crew);
          const noise = (Math.random() * sys.driftSpeed * eventMultiplier * crewMultiplier) * driftDirection;

          let newValue = sys.faderValue + noise;
          newValue = Math.max(0, Math.min(100, newValue));

          let healthDelta = 0;
          if (newValue >= 40 && newValue <= 60) {
            healthDelta = 0.3;
          } else if (newValue < 20 || newValue > 80) {
            healthDelta = -0.3;
            totalPenalty += 0.6;
          } else {
            healthDelta = -0.05;
          }

          if (healPulseReady && modifiersRef.current.autoHealPer5Seconds > 0 && sys.health < 100 && !hasEvents) {
            healthDelta += modifiersRef.current.autoHealPer5Seconds;
          }

          const nextHealth = Math.max(0, Math.min(100, sys.health + healthDelta));
          nextSystems[key] = {
            ...sys,
            faderValue: newValue,
            health: nextHealth,
            status: nextHealth < 30 ? 'CRITICAL' : nextHealth < 70 ? 'WARNING' : 'OK'
          };
        });

        if (totalPenalty > 0) {
          const stressMult = getCrewStressMultiplier(crew);
          const itemMult = modifiersRef.current.stressResist;
          const tutorialProtection = scenario.isTutorial ? 0.1 : 1.0;
          setStats(s => ({ ...s, stress: Math.min(100, s.stress + (totalPenalty * stressMult * itemMult * tutorialProtection)) }));
        }

        if (healPulseReady) {
          autoHealPulseRef.current = now + 5000;
        }

        systemsRef.current = nextSystems;
        return nextSystems;
      });

      // 1. MISSION LOGIC (CLIENT DEMANDS)
      const missionRespawnBase =
        scenario.difficulty === 'EXTREME' ? 7000 :
        scenario.difficulty === 'HARD' ? 8500 :
        10000;
      const missionRespawnModeMultiplier =
        gameMode === GameMode.SPEEDRUN ? 0.75 :
        gameMode === GameMode.HARDCORE ? 0.9 :
        1.0;
      const missionSuccessDelay = Math.round(
        missionRespawnBase * missionRespawnModeMultiplier * runtimeDirectorProfile.missionRespawnMultiplier
      );
      const missionFailDelay = Math.round(missionSuccessDelay * 0.8);
      const missionPool = getMissionPoolForScenario(scenario);
      const missionRewardPacingMultiplier = getMissionRewardPacingMultiplier(
        runtimeEconomyProfile,
        economyStreakRef.current,
        { stress: stressNow, budget: statsRef.current.budget },
        matchPhase,
        fatigueMetrics.fatigueLevel
      );

      if (currentMission) {
        const criteriaMet = currentMission.criteria.every(c => {
          const val = systemsRef.current[c.systemId].faderValue;
          const min = c.min ?? 0;
          const max = c.max ?? 100;
          return val >= min && val <= max;
        });

        if (criteriaMet) {
          const newProgress = currentMission.progress + 0.05;
          if (newProgress >= currentMission.holdDuration) {
            const missionReward = getMissionRewardCash(
              currentMission.rewardCash,
              scenario.difficulty,
              gameMode,
              currentEvents.length,
              statsRef.current.stress,
              permanentModifiersRef.current.rewardMultiplier
            );
            const pacedMissionReward = Math.max(
              60,
              Math.round(missionReward * missionRewardPacingMultiplier)
            );
            setStats(s => ({
              ...s,
              budget: s.budget + pacedMissionReward,
              clientSatisfaction: Math.min(100, s.clientSatisfaction + 15),
              publicInterest: Math.min(100, s.publicInterest + 10),
              stress: Math.max(0, s.stress - 10)
            }));
            economyStreakRef.current = {
              ...economyStreakRef.current,
              missionSuccessStreak: economyStreakRef.current.missionSuccessStreak + 1,
              missionFailStreak: 0
            };
            setActiveMission(null);
            activeMissionRef.current = null;
            nextMissionTimeRef.current = now + missionSuccessDelay;
          } else {
            setActiveMission(m => {
              if (!m) return null;
              const updated = { ...m, progress: newProgress };
              activeMissionRef.current = updated;
              return updated;
            });
          }
        }

        if (now > currentMission.expiresAt) {
          const missionTimeoutBudgetPenalty = getMissionTimeoutBudgetPenalty(
            currentMission,
            runtimeEconomyProfile,
            { stress: stressNow, budget: statsRef.current.budget }
          );
          setStats(s => ({
            ...s,
            clientSatisfaction: Math.max(0, s.clientSatisfaction - 15),
            stress: Math.min(100, s.stress + 10),
            budget: s.budget - missionTimeoutBudgetPenalty
          }));
          economyStreakRef.current = {
            ...economyStreakRef.current,
            missionSuccessStreak: 0,
            missionFailStreak: economyStreakRef.current.missionFailStreak + 1
          };
          setActiveMission(null);
          activeMissionRef.current = null;
          nextMissionTimeRef.current = now + missionFailDelay;
        }
      } else if (now > nextMissionTimeRef.current && !scenario.isTutorial) {
        if (missionPool.length === 0) {
          nextMissionTimeRef.current = now + 12000;
        } else {
          if (missionQueueRef.current.length === 0 || missionQueueIndexRef.current >= missionQueueRef.current.length) {
            refillMissionQueue(false);
          }
          const adaptivePick = pickAdaptiveMissionFromQueue(
            missionPool,
            missionQueueRef.current,
            missionQueueIndexRef.current,
            {
              systems: systemsRef.current,
              stats: { stress: stressNow, budget: statsRef.current.budget },
              phase: matchPhase,
              mode: gameMode,
              difficulty: scenario.difficulty
            },
            4
          );
          if (adaptivePick && adaptivePick.queueIndex !== missionQueueIndexRef.current) {
            const queue = missionQueueRef.current;
            [queue[missionQueueIndexRef.current], queue[adaptivePick.queueIndex]] = [queue[adaptivePick.queueIndex], queue[missionQueueIndexRef.current]];
          }
          const nextMissionId = missionQueueRef.current[missionQueueIndexRef.current];
          missionQueueIndexRef.current += 1;
          const missionDef = missionPool.find(mission => mission.id === nextMissionId) || missionPool[0];
          if (missionDef) {
            const missionTimeout = Math.max(
              missionDef.holdDuration + 5,
              Math.round(missionDef.timeout * permanentModifiersRef.current.missionTimeMultiplier)
            );
            const newMission: ActiveMission = {
              ...missionDef,
              startTime: now,
              expiresAt: now + (missionTimeout * 1000),
              progress: 0,
              isCompleted: false
            };
            setActiveMission(newMission);
            activeMissionRef.current = newMission;
          } else {
            nextMissionTimeRef.current = now + 12000;
          }
        }
      }


      // 2. Procedural Event Injection (offline-first local generator)
      if (now > aiCooldownRef.current && !isGeneratingEventsRef.current && !scenario.isTutorial) {
        const aiChanceBase = scenario.difficulty === 'NORMAL' ? 0.3 : 0.5;
        const modeBoostedChance = gameMode === GameMode.HARDCORE ? Math.min(0.8, aiChanceBase + 0.2) : aiChanceBase;
        const aiChance = clamp(modeBoostedChance * proceduralInjectionProfile.aiChanceMultiplier, 0.12, 0.88);
        if (Math.random() < aiChance) {
          const baseCooldown = scenario.difficulty === 'NORMAL' ? 35000 : 20000;
          const modeCooldown = gameMode === GameMode.SPEEDRUN ? 0.6 : gameMode === GameMode.HARDCORE ? 0.75 : 1;
          aiCooldownRef.current = now + Math.round(baseCooldown * modeCooldown * proceduralInjectionProfile.aiCooldownMultiplier);
          generateAIEvents(scenario.id)
            .then(newEvents => {
              if (newEvents.length === 0) return;
              setActiveEvents(prev => {
                const currentNow = Date.now();
                const activeTitles = new Set(prev.map(e => e.title));
                const uniqueNew = newEvents.filter(e => {
                  const onCooldown = (eventCooldownsRef.current.get(e.title) || 0) > currentNow;
                  return !activeTitles.has(e.title) && !onCooldown;
                });
                const selectedNewEvents = uniqueNew.slice(
                  0,
                  Math.max(1, Math.min(3, proceduralInjectionProfile.maxInjectedEvents))
                );
                const liveStress = statsRef.current.stress;
                const tunedNewEvents = selectedNewEvents.map(event => {
                  const baseRemainingMs = Math.max(2000, event.expiresAt - currentNow);
                  const adjustedRemainingMs = Math.round(
                    baseRemainingMs *
                    permanentModifiersRef.current.eventTimeMultiplier *
                    proceduralInjectionProfile.durationMultiplier
                  );
                  const criticalChance = clamp(
                    0.08 +
                    proceduralInjectionProfile.severityBias +
                    (liveStress >= 80 ? 0.05 : liveStress <= 30 ? -0.03 : 0),
                    0.03,
                    0.58
                  );
                  const warningChance = clamp(
                    0.54 + (proceduralInjectionProfile.severityBias * 0.45),
                    0.25,
                    0.78
                  );
                  const roll = Math.random();
                  const severity: 1 | 2 | 3 = roll < criticalChance ? 3 : roll < (criticalChance + warningChance) ? 2 : 1;
                  return {
                    ...event,
                    severity,
                    priority: event.priority || (severity === 3 ? 9 : severity === 2 ? 6 : 4),
                    expiresAt: currentNow + Math.max(2200, adjustedRemainingMs)
                  };
                });
                const next = [...prev, ...tunedNewEvents];
                activeEventsRef.current = next;
                return next;
              });
            })
            .catch(() => {
              // Ignore simulated AI generation errors.
            });
        } else {
          aiCooldownRef.current = now + proceduralInjectionProfile.idleRetryDelayMs;
        }
      }

      setStats(prev => {
        const scenarioNow = currentScenarioRef.current;
        const modeNow = currentGameModeRef.current;
        const crewNow = crewBonusRef.current;
        const systemsSnapshot = Object.values(systemsRef.current) as SystemState[];
        const eventsSnapshot = activeEventsRef.current as GameEvent[];

        // GAME OVER CONDITIONS
        const hasImmediateFailure = shouldTriggerImmediateGameOver(
          scenarioNow,
          modeNow,
          prev,
          systemsSnapshot,
          WIN_CONDITIONS
        );
        if (hasImmediateFailure) {
          setGameState(GameState.GAME_OVER);
          return prev;
        }

        const tutorialSafeStats = applyTutorialSafetyNet(scenarioNow, prev);
        const tutorialStress = tutorialSafeStats.stress;
        const tutorialBudget = tutorialSafeStats.budget;

        const timerEndOutcome = getTimerEndOutcome(modeNow, prev.timeRemaining, prev, WIN_CONDITIONS);
        if (timerEndOutcome) {
          if (timerEndOutcome === 'VICTORY') {

            setCareerData(currentCareer => {
              const safeCareer = normalizeCareerData(currentCareer);
              const newCareer: CareerData = {
                totalCash: safeCareer.totalCash + (prev.budget > 0 ? prev.budget : 0),
                completedScenarios: [...safeCareer.completedScenarios],
                highScores: { ...safeCareer.highScores },
                unlockedAchievements: safeCareer.unlockedAchievements,
                unlockedUpgrades: safeCareer.unlockedUpgrades,
                careerPoints: safeCareer.careerPoints,
                reputation: safeCareer.reputation
              };

              const isFirstTime = !newCareer.completedScenarios.includes(scenarioNow.id);

              if (isFirstTime) {
                newCareer.completedScenarios.push(scenarioNow.id);
              }

              const { pointsEarned, reputationEarned } = getScenarioCompletionRewards(scenarioNow.difficulty, isFirstTime, modeNow);
              newCareer.careerPoints += pointsEarned;
              newCareer.reputation += reputationEarned;
              const sessionScore = calculateScenarioScore(modeNow, scenarioNow.difficulty, prev, systemsSnapshot);
              const previousBest = newCareer.highScores[scenarioNow.id] || 0;
              if (sessionScore > previousBest) {
                newCareer.highScores[scenarioNow.id] = sessionScore;
              }
              const normalizedCareer = normalizeCareerData(newCareer);
              writeStoredJson(CAREER_STORAGE_KEY, normalizedCareer);
              return normalizedCareer;
            });

            setGameState(GameState.VICTORY);
          } else {
            setGameState(GameState.GAME_OVER);
          }
          return {
            ...prev,
            stress: tutorialStress,
            budget: tutorialBudget
          };
        }

        let newPublic = prev.publicInterest;
        let newClient = prev.clientSatisfaction;
        let newStress = tutorialStress;

        systemsSnapshot.forEach(sys => {
          if (sys.faderValue < 15 || sys.faderValue > 85) {
            newPublic -= 0.2;
            newClient -= 0.15;
            newStress += 0.05;
          } else if (sys.faderValue < 30 || sys.faderValue > 70) {
            newPublic -= 0.02;
            newClient -= 0.01;
          }
        });

        if (eventsSnapshot.length === 0) {
          newStress = Math.max(0, newStress - 0.5);
        } else {
          eventsSnapshot.forEach(e => {
            const factor = scenarioNow.difficulty === 'NORMAL' ? 0.005 : 0.01;
            const stressMult = getCrewStressMultiplier(crewNow);
            newStress += factor * e.severity * stressMult * permanentModifiersRef.current.activeEventStressMultiplier;
            newPublic -= 0.005 * e.severity;
          });
        }

        return {
          ...prev,
          budget: tutorialBudget,
          timeRemaining: modeNow === GameMode.ENDLESS
            ? prev.timeRemaining
            : Math.max(0, prev.timeRemaining - (modeNow === GameMode.SPEEDRUN ? 0.07 : 0.05)),
          publicInterest: Math.min(100, Math.max(0, newPublic)),
          clientSatisfaction: Math.min(100, Math.max(0, newClient)),
          stress: Math.min(100, Math.max(0, newStress)),
        };
      });

      // STATIC EVENT GENERATION CONTROL
      const activeEventCount = activeEventsRef.current.length;
      const baseConcurrencyCap = getEventConcurrencyCap(scenario.difficulty, gameMode, stressNow);
      const concurrencyCap = clamp(
        baseConcurrencyCap + runtimeDirectorProfile.concurrencyDelta,
        scenario.isTutorial ? 1 : 2,
        7
      );
      if (activeEventCount < concurrencyCap && now > nextStaticEventTimeRef.current) {
        const baseSpawnDelay = getStaticEventSpawnDelayMs(
          scenario.difficulty,
          gameMode,
          stressNow,
          activeEventCount
        );
        const spawnDelay = Math.max(3200, Math.round(baseSpawnDelay * runtimeDirectorProfile.spawnDelayMultiplier));
        nextStaticEventTimeRef.current = now + spawnDelay;
        generateStaticEvent();
      }

      setActiveEvents(prevEvents => {
        const currentNow = Date.now();
        const expired = prevEvents.filter(e => e.expiresAt < currentNow);
        const remaining = prevEvents.filter(e => e.expiresAt >= currentNow);
        
        const eventsToEscalate = remaining.filter(e => 
          e.canEscalate && 
          e.escalationTime && 
          currentNow >= e.escalationTime &&
          !e.escalatedFrom
        );

        if (expired.length > 0) {
          const expiredBudgetPenalty = getExpiredEventsBudgetPenalty(
            expired,
            remaining.length,
            runtimeEconomyProfile,
            stressNow
          );
          setStats(current => ({
            ...current,
            publicInterest: Math.max(0, current.publicInterest - 10),
            clientSatisfaction: Math.max(0, current.clientSatisfaction - 10),
            stress: Math.min(100, current.stress + 10),
            budget: current.budget - expiredBudgetPenalty
          }));
          
          setSystems(currSystems => {
            const newSystems = { ...currSystems };
            expired.forEach(ex => {
              const newHealth = Math.max(0, newSystems[ex.systemId].health - 20);
              newSystems[ex.systemId] = {
                ...newSystems[ex.systemId],
                health: newHealth,
                status: newHealth < 30 ? 'CRITICAL' : 'WARNING'
              };
            });
            systemsRef.current = newSystems;
            return newSystems;
          });
          expired.forEach(ex => eventCooldownsRef.current.set(ex.title, Date.now() + 60000));

          const telemetry = sessionDirectorTelemetryRef.current;
          let recentOutcomes = telemetry.recentOutcomes;
          const failBursts = Math.min(3, expired.length);
          for (let i = 0; i < failBursts; i += 1) {
            recentOutcomes = pushRecentOutcome(recentOutcomes, 'FAIL');
          }
          sessionDirectorTelemetryRef.current = {
            ...telemetry,
            failedEvents: telemetry.failedEvents + expired.length,
            expiredEvents: telemetry.expiredEvents + expired.length,
            recentOutcomes
          };
          const failBurst = Math.min(3, expired.length);
          economyStreakRef.current = {
            ...economyStreakRef.current,
            eventSuccessStreak: 0,
            eventFailStreak: economyStreakRef.current.eventFailStreak + failBurst
          };
        }
        
        if (eventsToEscalate.length > 0) {
          eventsToEscalate.forEach(event => {
            const escalatedEvent = createEscalatedEvent(event, SYSTEM_EVENTS[event.systemId], currentNow);
            if (escalatedEvent) {
              remaining.push(escalatedEvent);
            }
          });
          eventsToEscalate.forEach(e => {
            const index = remaining.findIndex(ev => ev.id === e.id);
            if (index >= 0) remaining.splice(index, 1);
          });
        }

        const cascadeSources = [...eventsToEscalate, ...expired]
          .sort((a, b) => {
            const priorityDelta = (b.priority || 0) - (a.priority || 0);
            if (priorityDelta !== 0) return priorityDelta;
            return b.severity - a.severity;
          });

        if (
          cascadeSources.length > 0 &&
          !scenario.isTutorial &&
          currentNow >= nextCascadeTimeRef.current &&
          remaining.length < concurrencyCap &&
          Math.random() < runtimeDirectorProfile.cascadeChance
        ) {
          const activeTitles = new Set<string>(remaining.map(event => event.title));

          for (const source of cascadeSources) {
            const sourceDefinition = SYSTEM_EVENTS[source.systemId].find(def => def.title === source.title);
            const targets = getCrossSystemCascadeTargets(
              source,
              sourceDefinition,
              SYSTEM_EVENTS,
              activeTitles,
              eventCooldownsRef.current,
              currentNow,
              (allowedScenarios) => isEventAllowedForScenario(allowedScenarios, scenario)
            );
            if (targets.length === 0) continue;

            const weightedTargets = targets.flatMap(target => {
              const weight = Math.max(1, Math.min(5, Math.round((target.definition.priority || 4) / 2)));
              return Array.from({ length: weight }, () => target);
            });
            const selectedTarget =
              weightedTargets[Math.floor(Math.random() * weightedTargets.length)] || targets[0];

            if (!selectedTarget) continue;

            const severityBonus = matchPhase === 'FINALE' ? 1 : 0;
            const cascadeEvent = createRelatedCascadeEvent(
              source,
              selectedTarget.systemId,
              selectedTarget.definition,
              currentNow,
              severityBonus
            );
            remaining.push(cascadeEvent);
            activeTitles.add(cascadeEvent.title);
            eventCooldownsRef.current.set(cascadeEvent.title, currentNow + 45000);

            const sourceIndex = remaining.findIndex(event => event.id === source.id);
            if (sourceIndex >= 0) {
              const sourceEvent = remaining[sourceIndex];
              const currentRelated = sourceEvent.relatedEvents || [];
              remaining[sourceIndex] = {
                ...sourceEvent,
                relatedEvents: [...currentRelated, cascadeEvent.id]
              };
            }

            nextCascadeTimeRef.current = currentNow + runtimeDirectorProfile.cascadeCooldownMs;
            break;
          }
        }

        activeEventsRef.current = remaining;
        return remaining;
      });

    }, 50);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gameState, tutorialActive, generateStaticEvent, generateAIEvents]); 

  // Expose combo bonus callback - set it directly
  applyComboBonusRef.current = applyComboBonus;

  return {
    gameState,
    stats,
    systems,
    activeEvents,
    currentScenario,
    currentGameMode,
    pendingStartData,
    activeMinigame,
    careerData,
    inventory,
    activeMission, // Exported for UI
    tutorialActive,
    tutorialStepIndex,
    advanceTutorial,
    finishTutorial,
    initializeSession,
    buyItem,
    startGame,
    togglePause,
    quitGame,
    resolveEvent,
    completeMinigame,
    setGameState,
    handleFaderChange,
    applyComboBonus,
    setComboBonusCallback,
    setEventResolutionCallback,
    saveCareer // Fase 3: Expose for achievements/upgrades
  };
};
