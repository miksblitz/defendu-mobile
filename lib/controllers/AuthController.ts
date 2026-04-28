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

export {
  saveSkillProfile,
  getSkillProfile,
  getFullSkillProfile,
  updateSkillProfilePartial,
} from './skillProfile';

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
  claimWeeklyGoalReward,
  resetUserProgress,
} from './userProgress';

export { uploadFileToCloudinary } from './cloudinary';

export {
  updateUserProfile,
  updateProfilePicture,
  updateCoverPhoto,
  changePassword,
} from './userProfile';

export {
  getApprovedModules,
  getCategorySegmentProgram,
  getModuleCategoriesWithMeta,
  type ModuleCategoryWithMeta,
} from './modulesCatalog';

export {
  getModulesByIds,
  getReferencePoseData,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  getMyCategoryReview,
  submitCategoryReview,
  queueCategoryReviewPrompt,
  popCategoryReviewPrompt,
  saveModule,
  getTrainerEditableModuleById,
  updateTrainerOwnedModuleMetadata,
  updateModuleMedia,
  removeModule,
  seedTestModules,
} from './moduleOperations';

export {
  getApprovedTrainers,
  getTrainerApplicationsByUids,
  getTrainerRatingSummaries,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
} from './trainers';

export { getTrainerPublishedModuleAnalytics } from './trainerAnalytics';

import { isDemoMode, setDemoModeAndUser, clearDemoMode } from './demoMode';
import { register, login, getCurrentUser, logout, updateStoredUserCredits } from './authSession';
import {
  saveSkillProfile,
  getSkillProfile,
  getFullSkillProfile,
  updateSkillProfilePartial,
} from './skillProfile';
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
  claimWeeklyGoalReward,
  resetUserProgress,
} from './userProgress';
import { uploadFileToCloudinary } from './cloudinary';
import {
  updateUserProfile,
  updateProfilePicture,
  updateCoverPhoto,
  changePassword,
} from './userProfile';
import { getApprovedModules, getCategorySegmentProgram, getModuleCategoriesWithMeta } from './modulesCatalog';
import {
  getModulesByIds,
  getReferencePoseData,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  getMyCategoryReview,
  submitCategoryReview,
  queueCategoryReviewPrompt,
  popCategoryReviewPrompt,
  saveModule,
  getTrainerEditableModuleById,
  updateTrainerOwnedModuleMetadata,
  updateModuleMedia,
  removeModule,
  seedTestModules,
} from './moduleOperations';
import {
  getApprovedTrainers,
  getTrainerApplicationsByUids,
  getTrainerRatingSummaries,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
} from './trainers';
import { getTrainerPublishedModuleAnalytics } from './trainerAnalytics';

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
  updateSkillProfilePartial,
  updateUserProfile,
  updateProfilePicture,
  updateCoverPhoto,
  resetUserProgress,
  changePassword,
  getApprovedModules,
  getCategorySegmentProgram,
  getModuleCategoriesWithMeta,
  forgotPassword,
  sendRegistrationOtp,
  verifyRegistrationOtp,
  logout,
  getRecommendations,
  getUserProgress,
  recordModuleCompletion,
  recordModuleTrainingFailure,
  claimWeeklyGoalReward,
  getModulesByIds,
  getReferencePoseData,
  getModuleByIdForUser,
  getModuleReviews,
  submitModuleReview,
  getMyCategoryReview,
  submitCategoryReview,
  queueCategoryReviewPrompt,
  popCategoryReviewPrompt,
  getApprovedTrainers,
  getTrainerApplicationsByUids,
  getTrainerRatingSummaries,
  getTrainerApplicationData,
  getUserTrainerApplication,
  updateTrainerProfile,
  submitTrainerApplication,
  getTrainerPublishedModuleAnalytics,
  saveModule,
  getTrainerEditableModuleById,
  updateTrainerOwnedModuleMetadata,
  updateModuleMedia,
  removeModule,
  seedTestModules,
  uploadFileToCloudinary,
};
