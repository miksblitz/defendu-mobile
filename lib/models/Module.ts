export interface Module {
  moduleId: string;
  /** Human-friendly module reference code (e.g. M0101). */
  referenceCode?: string;
  trainerId: string;
  trainerName?: string;
  moduleTitle: string;
  description: string;
  category: string;
  introductionType?: 'text' | 'video';
  introduction?: string;
  introductionVideoUrl?: string;
  techniqueVideoUrl?: string;
  techniqueVideoUrl2?: string;
  techniqueVideoLink?: string;
  /**
   * Pose reference for "Try with pose". Set by the training pipeline (reference videos + payment, 1–2 days).
   * URL to JSON or stored in DB (referencePoseSequence / referencePoseSequences).
   * One module = one move evaluator (e.g. jab, hook, block); reference is produced per module.
   */
  referencePoseSequenceUrl?: string;
  referencePoseSequence?: unknown;
  referencePoseSequences?: unknown[];
  referencePoseFocus?: 'punching' | 'kicking' | 'full';
  /** When true, app fetches ref from referencePoseData/{moduleId} instead of inline (keeps module doc small). */
  hasReferencePose?: boolean;
  /** Guide media URL shown in the training overlay (from modules/{id}/referenceGuideUrl). */
  referenceGuideUrl?: string;
  /** Reference videos for pose (Try with pose): side 1 and side 2. Used to generate reference pose data. */
  referencePoseVideoUrlSide1?: string;
  referencePoseVideoUrlSide2?: string;
  videoDuration?: number;
  thumbnailUrl?: string;
  intensityLevel?: number;
  /** Optional explicit sort order from admin table (lower = earlier in list). */
  sortOrder?: number;
  spaceRequirements?: string[];
  /** Recommended warmup exercises (e.g. ARM CIRCLES, LEG SWINGS). */
  warmupExercises?: string[];
  /** Recommended cooldown stretches (e.g. shoulder stretch, quad stretch). */
  cooldownExercises?: string[];
  physicalDemandTags?: string[];
  repRange?: string;
  /** Overall difficulty: Basic, Intermediate, or Advanced. */
  difficultyLevel?: 'basic' | 'intermediate' | 'advanced';
  trainingDurationSeconds?: number;
  status: 'draft' | 'pending review' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  certificationChecked?: boolean;
  rejectionReason?: string;
}

