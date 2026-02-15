export type UserRole = 'individual' | 'trainer' | 'admin';

export interface User {
  uid: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  role?: UserRole;
  hasCompletedSkillProfile?: boolean;
  trainerApproved?: boolean;
  blocked?: boolean;
  lastActive?: Date;
  preferredTechnique?: string[];
  trainingGoal?: string[];
  martialArtsBackground?: string[];
  height?: number;
  weight?: number;
  age?: number;
  gender?: string;
  physicalLimitations?: string | null;
  experienceLevel?: string;
  previousTrainingDetails?: string | null;
  currentFitnessLevel?: string;
  trainingFrequency?: string;
  currentInjuries?: string | null;
}

export interface RegisterData {
  email: string;
  password: string;
  username: string;
  firstName: string;
  lastName: string;
}

export interface LoginData {
  email: string;
  password: string;
}
