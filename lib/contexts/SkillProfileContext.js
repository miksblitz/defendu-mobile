import React, { createContext, useContext, useState } from 'react';

const SkillProfileContext = createContext(undefined);

export function SkillProfileProvider({ children }) {
  const [physicalAttributes, setPhysicalAttributesState] = useState(null);
  const [preferences, setPreferencesState] = useState(null);
  const [pastExperience, setPastExperienceState] = useState(null);
  const [fitnessCapabilities, setFitnessCapabilitiesState] = useState(null);

  const setPhysicalAttributes = (data) => setPhysicalAttributesState(data);
  const setPreferences = (data) => setPreferencesState(data);
  const setPastExperience = (data) => setPastExperienceState(data);
  const setFitnessCapabilities = (data) => setFitnessCapabilitiesState(data);

  const clearProfile = () => {
    setPhysicalAttributesState(null);
    setPreferencesState(null);
    setPastExperienceState(null);
    setFitnessCapabilitiesState(null);
  };

  const getCompleteProfile = async () => {
    const { AuthController } = require('../controllers/AuthController');
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
  };

  const value = {
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

export function useSkillProfile() {
  const context = useContext(SkillProfileContext);
  if (context === undefined) {
    throw new Error('useSkillProfile must be used within a SkillProfileProvider');
  }
  return context;
}
