export interface PermanentGameplayModifiers {
  eventTimeMultiplier: number;
  missionTimeMultiplier: number;
  stressMultiplier: number;
  costMultiplier: number;
  rewardMultiplier: number;
  activeEventStressMultiplier: number;
}

export const getPermanentGameplayModifiers = (
  unlockedUpgrades: string[]
): PermanentGameplayModifiers => {
  const has = (upgradeId: string) => unlockedUpgrades.includes(upgradeId);

  let eventTimeMultiplier = 1.0;
  let missionTimeMultiplier = 1.0;
  let stressMultiplier = 1.0;
  let costMultiplier = 1.0;
  let rewardMultiplier = 1.0;
  let activeEventStressMultiplier = 1.0;

  if (has('reflexes_1')) eventTimeMultiplier *= 1.1;
  if (has('reflexes_2')) eventTimeMultiplier *= 1.2;
  if (has('special_focus')) eventTimeMultiplier *= 1.25;

  if (has('knowledge_1')) missionTimeMultiplier *= 1.05;
  if (has('knowledge_2')) {
    missionTimeMultiplier *= 1.1;
    activeEventStressMultiplier *= 0.9;
  }

  if (has('resistance_1')) stressMultiplier *= 0.85;
  if (has('resistance_2')) stressMultiplier *= 0.7;
  if (has('special_focus')) stressMultiplier *= 0.85;

  if (has('efficiency_1')) costMultiplier *= 0.8;
  if (has('efficiency_2')) costMultiplier *= 0.65;

  if (has('special_logistics')) rewardMultiplier *= 1.2;

  return {
    eventTimeMultiplier,
    missionTimeMultiplier,
    stressMultiplier,
    costMultiplier,
    rewardMultiplier,
    activeEventStressMultiplier
  };
};
