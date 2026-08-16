import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_USER_AUDIO_MIX, normalizeUserAudioMix } from './useSoundSynth';
import type { AudioSpatialMode, UserAudioMix } from './useSoundSynth';
import type { VisualQualityMode } from '../utils/visualPerformance';
import {
  readStoredJson,
  readStoredValue,
  writeStoredJson,
  writeStoredValue
} from '../utils/safeStorage';

const VISUAL_QUALITY_STORAGE_KEY = 'event_chaos_visual_quality_mode';
const USER_SETTINGS_STORAGE_KEY = 'event_chaos_user_settings_v1';

export const VISUAL_QUALITY_SEQUENCE: VisualQualityMode[] = ['AUTO', 'PERFORMANCE', 'CINEMATIC'];
export const AUDIO_SPATIAL_SEQUENCE: AudioSpatialMode[] = ['BALANCED', 'CINEMATIC', 'FOCUS'];
export const DEFAULT_AUDIO_SPATIAL_MODE: AudioSpatialMode = 'BALANCED';

export const VISUAL_QUALITY_LABEL: Record<VisualQualityMode, string> = {
  AUTO: 'AUTO',
  PERFORMANCE: 'PERF',
  CINEMATIC: 'CINE'
};

interface StoredUserSettings {
  visualQualityMode?: VisualQualityMode;
  reducedMotion?: boolean;
  highContrastUi?: boolean;
  audioSpatialMode?: AudioSpatialMode;
  audioMix?: Partial<UserAudioMix>;
}

const loadStoredUserSettings = (): StoredUserSettings =>
  readStoredJson<StoredUserSettings>(USER_SETTINGS_STORAGE_KEY, {});

const readInitialVisualQuality = (): VisualQualityMode => {
  const stored = loadStoredUserSettings();
  if (stored.visualQualityMode) return stored.visualQualityMode;

  // Older builds persisted the mode under its own key; keep honouring it.
  const legacyMode = readStoredValue(VISUAL_QUALITY_STORAGE_KEY);
  if (legacyMode === 'AUTO' || legacyMode === 'PERFORMANCE' || legacyMode === 'CINEMATIC') {
    return legacyMode;
  }
  return 'AUTO';
};

const readInitialSpatialMode = (): AudioSpatialMode => {
  const mode = loadStoredUserSettings().audioSpatialMode;
  if (mode === 'BALANCED' || mode === 'CINEMATIC' || mode === 'FOCUS') return mode;
  return DEFAULT_AUDIO_SPATIAL_MODE;
};

/**
 * Owns the player's persisted preferences: visual quality, motion, contrast and
 * the audio mix. Cycling helpers return the mode they selected so the caller can
 * announce it without this hook needing to know about the game log.
 */
export const useUserSettings = () => {
  const [visualQualityMode, setVisualQualityMode] =
    useState<VisualQualityMode>(readInitialVisualQuality);
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    Boolean(loadStoredUserSettings().reducedMotion)
  );
  const [highContrastUi, setHighContrastUi] = useState<boolean>(() =>
    Boolean(loadStoredUserSettings().highContrastUi)
  );
  const [audioSpatialMode, setAudioSpatialMode] =
    useState<AudioSpatialMode>(readInitialSpatialMode);
  const [audioMix, setAudioMix] = useState<UserAudioMix>(() =>
    normalizeUserAudioMix(loadStoredUserSettings().audioMix || DEFAULT_USER_AUDIO_MIX)
  );

  useEffect(() => {
    writeStoredValue(VISUAL_QUALITY_STORAGE_KEY, visualQualityMode);
    writeStoredJson(USER_SETTINGS_STORAGE_KEY, {
      visualQualityMode,
      reducedMotion,
      highContrastUi,
      audioSpatialMode,
      audioMix
    });
  }, [audioMix, audioSpatialMode, highContrastUi, reducedMotion, visualQualityMode]);

  const cycleVisualQuality = useCallback(() => {
    const nextMode =
      VISUAL_QUALITY_SEQUENCE[
        (VISUAL_QUALITY_SEQUENCE.indexOf(visualQualityMode) + 1) % VISUAL_QUALITY_SEQUENCE.length
      ];
    setVisualQualityMode(nextMode);
    return nextMode;
  }, [visualQualityMode]);

  const cycleAudioSpatial = useCallback(() => {
    const nextMode =
      AUDIO_SPATIAL_SEQUENCE[
        (AUDIO_SPATIAL_SEQUENCE.indexOf(audioSpatialMode) + 1) % AUDIO_SPATIAL_SEQUENCE.length
      ];
    setAudioSpatialMode(nextMode);
    return nextMode;
  }, [audioSpatialMode]);

  const handleAudioMixChange = useCallback((mix: Partial<UserAudioMix>) => {
    setAudioMix((prev) => normalizeUserAudioMix(mix, prev));
  }, []);

  const resetSettings = useCallback(() => {
    setVisualQualityMode('AUTO');
    setReducedMotion(false);
    setHighContrastUi(false);
    setAudioSpatialMode(DEFAULT_AUDIO_SPATIAL_MODE);
    setAudioMix(DEFAULT_USER_AUDIO_MIX);
  }, []);

  return {
    visualQualityMode,
    setVisualQualityMode,
    reducedMotion,
    setReducedMotion,
    highContrastUi,
    setHighContrastUi,
    audioSpatialMode,
    setAudioSpatialMode,
    audioMix,
    cycleVisualQuality,
    cycleAudioSpatial,
    handleAudioMixChange,
    resetSettings
  };
};
