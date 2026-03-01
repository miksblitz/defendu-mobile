export interface TrainerApplication {
  uid: string;
  fullLegalName: string;
  professionalAlias?: string;
  email: string;
  academyName?: string;
  appliedDate: Date;
  status: 'awaiting review' | 'approved' | 'rejected';
  dateOfBirth: string;
  phone: string;
  physicalAddress: string;
  defenseStyles: string[];
  yearsOfExperience: string;
  yearsOfTeaching: string;
  currentRank?: string;
  aboutMe?: string;
  /** Optional image or file URL for trainer profile (e.g. headshot or bio attachment). */
  aboutMeImageUrl?: string;
  facebookLink?: string;
  instagramLink?: string;
  otherLink?: string;
  uploadedFiles: { name: string; uri: string; type: string; size: number }[];
  credentialsRevoked: string | null;
  credentialsRevokedExplanation?: string;
  felonyConviction: string | null;
  felonyExplanation?: string;
  certifyAccurate: boolean;
  agreeConduct: boolean;
}
