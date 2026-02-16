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
  videoDuration?: number;
  thumbnailUrl?: string;
  intensityLevel?: number;
  spaceRequirements?: string[];
  physicalDemandTags?: string[];
  repRange?: string;
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
