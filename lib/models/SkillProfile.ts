export interface PhysicalAttributes {
  height: number;
  weight: number;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  limitations?: string;
}

export interface Preferences {
  preferredTechnique: string[];
  trainingGoal: string[];
}

export interface PastExperience {
  experienceLevel: string;
  martialArtsBackground?: string[];
  previousTrainingDetails?: string;
}

export interface FitnessCapabilities {
  currentFitnessLevel: string;
  trainingFrequency: string;
  injuries?: string;
}

export interface SkillProfile {
  uid: string;
  physicalAttributes: PhysicalAttributes;
  preferences: Preferences;
  pastExperience: PastExperience;
  fitnessCapabilities: FitnessCapabilities;
  completedAt: Date;
  updatedAt?: Date;
}
