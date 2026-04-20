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
  /** Cloudinary `secure_url` values for certification photos (images only). Absent on legacy applications. */
  credentialImageUrls?: string[];
  /**
   * Legacy applications only: local file metadata from document picker (not portable).
   * Prefer `credentialImageUrls` for new data.
   */
  uploadedFiles?: { name: string; uri: string; type: string; size: number }[];
  credentialsRevoked: string | null;
  credentialsRevokedExplanation?: string;
  felonyConviction: string | null;
  felonyExplanation?: string;
  certifyAccurate: boolean;
  agreeConduct: boolean;
}
