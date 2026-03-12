export interface Module {
  moduleId: string;
  trainerId: string;
  trainerName?: string;
  moduleTitle: string;
  description: string;
  category: string;
  introductionType?: 'text' | 'video';
  introduction?: string;
  introductionVideoUrl?: string;
  techniqueVideoUrl?: string;
  techniqueVideoLink?: string;
  /** Optional URL to precomputed reference pose sequence JSON (one rep) for "Try with pose". */
  referencePoseSequenceUrl?: string;
  /** Optional: reference pose stored directly in DB (no Storage/Blaze). Prefer over URL when set. */
  referencePoseSequence?: unknown;
  referencePoseSequences?: unknown[];
  referencePoseFocus?: 'punching' | 'kicking' | 'full';
  videoDuration?: number;
  thumbnailUrl?: string;
  intensityLevel?: number;
  spaceRequirements?: string[];
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
