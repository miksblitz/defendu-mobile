import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { PhysicalAttributes, Preferences, PastExperience, FitnessCapabilities, SkillProfile } from '../models/SkillProfile';
import { AuthController } from '../controllers/AuthController';

interface SkillProfileContextType {
  physicalAttributes: PhysicalAttributes | null;
  preferences: Preferences | null;
  pastExperience: PastExperience | null;
  fitnessCapabilities: FitnessCapabilities | null;
  setPhysicalAttributes: (data: PhysicalAttributes) => void;
  setPreferences: (data: Preferences) => void;
  setPastExperience: (data: PastExperience) => void;
  setFitnessCapabilities: (data: FitnessCapabilities) => void;
  clearProfile: () => void;
  getCompleteProfile: () => Promise<SkillProfile | null>;
}

const SkillProfileContext = createContext<SkillProfileContextType | undefined>(undefined);

export function SkillProfileProvider({ children }: { children: ReactNode }) {
  const [physicalAttributes, setPhysicalAttributesState] = useState<PhysicalAttributes | null>(null);
  const [preferences, setPreferencesState] = useState<Preferences | null>(null);
  const [pastExperience, setPastExperienceState] = useState<PastExperience | null>(null);
  const [fitnessCapabilities, setFitnessCapabilitiesState] = useState<FitnessCapabilities | null>(null);

  const setPhysicalAttributes = useCallback((data: PhysicalAttributes) => setPhysicalAttributesState(data), []);
  const setPreferences = useCallback((data: Preferences) => setPreferencesState(data), []);
  const setPastExperience = useCallback((data: PastExperience) => setPastExperienceState(data), []);
  const setFitnessCapabilities = useCallback((data: FitnessCapabilities) => setFitnessCapabilitiesState(data), []);

  const clearProfile = useCallback(() => {
    setPhysicalAttributesState(null);
    setPreferencesState(null);
    setPastExperienceState(null);
    setFitnessCapabilitiesState(null);
  }, []);

  const getCompleteProfile = useCallback(async (): Promise<SkillProfile | null> => {
    if (!physicalAttributes || !preferences || !pastExperience || !fitnessCapabilities) return null;
    const currentUser = await AuthController.getCurrentUser();
    if (!currentUser) return null;
    return {
      uid: currentUser.uid,
      physicalAttributes,
      preferences,
      pastExperience,
      fitnessCapabilities,
      completedAt: new Date(),
    };
  }, [physicalAttributes, preferences, pastExperience, fitnessCapabilities]);

  const value: SkillProfileContextType = {
    physicalAttributes,
    preferences,
    pastExperience,
    fitnessCapabilities,
    setPhysicalAttributes,
    setPreferences,
    setPastExperience,
    setFitnessCapabilities,
    clearProfile,
    getCompleteProfile,
  };

  return (
    <SkillProfileContext.Provider value={value}>
      {children}
    </SkillProfileContext.Provider>
  );
}

export function useSkillProfile(): SkillProfileContextType {
  const context = useContext(SkillProfileContext);
  if (context === undefined) {
    throw new Error('useSkillProfile must be used within a SkillProfileProvider');
  }
  return context;
}
