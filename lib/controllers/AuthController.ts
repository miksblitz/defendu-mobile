/**
 * App data layer: session, modules, trainers, progress, password/OTP API, Cloudinary.
 * Implementation is split across sibling modules; this file re-exports for stable import paths.
 */

export type { ModuleItem } from './modulesCatalog';

export {
  isDemoMode,
  setDemoModeAndUser,
  clearDemoMode,
} from './demoMode';

export {
  register,
  login,
  getCurrentUser,
  logout,
  updateStoredUserCredits,
} from './authSession';

export { saveSkillProfile, getSkillProfile, getFullSkillProfile } from './skillProfile';

export {
  forgotPassword,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  validateResetToken,
  confirmPasswordReset,
} from './passwordResetApi';

export {
  getRecommendations,
  getUserProgress,
  recordModuleCompletion,
  recordModuleTrainingFailure,
  resetUserProgress,
} from './userProgress';

export { uploadFileToCloudinary } from './cloudinary';

export {
  updateUserProfile,
  updateProfilePicture,
  changePassword,
} from './userProfile';

export { getApprovedModules } from './modulesCatalog';

export {
  getModulesByIds,
  getReferencePoseData,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  saveModule,
  updateModuleMedia,
  removeModule,
  seedTestModules,
} from './moduleOperations';

export {
  getApprovedTrainers,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
} from './trainers';

import { isDemoMode, setDemoModeAndUser, clearDemoMode } from './demoMode';
import { register, login, getCurrentUser, logout, updateStoredUserCredits } from './authSession';
import { saveSkillProfile, getSkillProfile, getFullSkillProfile } from './skillProfile';
import {
  forgotPassword,
  sendRegistrationOtp,
  verifyRegistrationOtp,
} from './passwordResetApi';
import {
  getRecommendations,
  getUserProgress,
  recordModuleCompletion,
  recordModuleTrainingFailure,
  resetUserProgress,
} from './userProgress';
import { uploadFileToCloudinary } from './cloudinary';
import {
  updateUserProfile,
  updateProfilePicture,
  changePassword,
} from './userProfile';
import { getApprovedModules } from './modulesCatalog';
import {
  getModulesByIds,
  getReferencePoseData,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  saveModule,
  updateModuleMedia,
  removeModule,
  seedTestModules,
} from './moduleOperations';
import {
  getApprovedTrainers,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
} from './trainers';

/** Namespace object for screens that prefer `AuthController.method()`. */
export const AuthController = {
  register,
  login,
  getCurrentUser,
  updateStoredUserCredits,
  isDemoMode,
  setDemoModeAndUser,
  clearDemoMode,
  saveSkillProfile,
  getSkillProfile,
  getFullSkillProfile,
  updateUserProfile,
  updateProfilePicture,
  resetUserProgress,
  changePassword,
  getApprovedModules,
  forgotPassword,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  logout,
  getRecommendations,
  getUserProgress,
  recordModuleCompletion,
  recordModuleTrainingFailure,
  getModulesByIds,
  getReferencePoseData,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  getApprovedTrainers,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
  saveModule,
  updateModuleMedia,
  removeModule,
  seedTestModules,
  uploadFileToCloudinary,
};
