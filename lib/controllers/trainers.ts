import { ref, get, set, update } from 'firebase/database';
import { auth, db } from '../config/firebaseConfig';
import type { User } from '../models/User';
import type { TrainerApplication } from '../models/TrainerApplication';
import { getCurrentUser } from './authSession';
import { normalizeArray } from './normalize';

export async function getApprovedTrainers(): Promise<User[]> {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('User must be authenticated to view trainers');
    const usersRef = ref(db, 'users');
    const snapshot = await get(usersRef);
    if (!snapshot.exists()) return [];
    const usersData = snapshot.val() as Record<string, Record<string, unknown>>;
    const approvedTrainers: User[] = [];
    for (const uid of Object.keys(usersData)) {
      const userDataRaw = usersData[uid];
      if (!userDataRaw || typeof userDataRaw !== 'object') continue;
      if (userDataRaw.role !== 'trainer' || userDataRaw.trainerApproved !== true) continue;
      approvedTrainers.push({
        ...userDataRaw,
        uid,
        email: String(userDataRaw.email ?? ''),
        username: String(userDataRaw.username ?? ''),
        firstName: String(userDataRaw.firstName ?? ''),
        lastName: String(userDataRaw.lastName ?? ''),
        createdAt: userDataRaw.createdAt ? new Date(userDataRaw.createdAt as number) : new Date(),
        lastActive: userDataRaw.lastActive ? new Date(userDataRaw.lastActive as number) : undefined,
        role: 'trainer',
        hasCompletedSkillProfile: Boolean(userDataRaw.hasCompletedSkillProfile ?? false),
        trainerApproved: true,
        blocked: Boolean(userDataRaw.blocked ?? false),
        preferredTechnique: normalizeArray(userDataRaw.preferredTechnique),
        trainingGoal: normalizeArray(userDataRaw.trainingGoal),
        martialArtsBackground: normalizeArray(userDataRaw.martialArtsBackground),
        profilePicture: userDataRaw.profilePicture != null ? String(userDataRaw.profilePicture) : undefined,
      } as User);
    }
    approvedTrainers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return approvedTrainers;
  } catch (e) {
    console.error('getApprovedTrainers:', e);
    throw e;
  }
}

export async function getTrainerApplicationData(uid: string): Promise<TrainerApplication | null> {
  try {
    const applicationRef = ref(db, `TrainerApplication/${uid}`);
    const snap = await get(applicationRef);
    if (!snap.exists()) return null;
    const data = snap.val() as Record<string, unknown>;
    return {
      ...data,
      uid: String(data.uid),
      appliedDate: data.appliedDate ? new Date(data.appliedDate as number) : new Date(),
    } as TrainerApplication;
  } catch (e) {
    console.error('getTrainerApplicationData:', e);
    return null;
  }
}

/** Get the current user's trainer application (same as getTrainerApplicationData for a given uid). */
export async function getUserTrainerApplication(uid: string): Promise<TrainerApplication | null> {
  return getTrainerApplicationData(uid);
}

/** Update the public trainer profile (what shows on Trainer page). Only approved trainers. */
export async function updateTrainerProfile(
  uid: string,
  updates: {
    defenseStyles?: string[];
    currentRank?: string;
    aboutMe?: string;
    aboutMeImageUrl?: string;
  }
): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.uid !== uid) throw new Error('User must be authenticated');
  if (currentUser.role !== 'trainer' || !currentUser.trainerApproved) {
    throw new Error('Only approved trainers can update their trainer profile');
  }
  const applicationRef = ref(db, `TrainerApplication/${uid}`);
  const patch: Record<string, unknown> = {};
  if (updates.defenseStyles !== undefined) patch.defenseStyles = updates.defenseStyles;
  if (updates.currentRank !== undefined) patch.currentRank = updates.currentRank;
  if (updates.aboutMe !== undefined) patch.aboutMe = updates.aboutMe;
  if (updates.aboutMeImageUrl !== undefined) patch.aboutMeImageUrl = updates.aboutMeImageUrl;
  if (Object.keys(patch).length === 0) return;
  await update(applicationRef, patch);
}

/** Submit or resubmit trainer application; updates user role to trainer and sets trainerApproved to false. */
export async function submitTrainerApplication(data: TrainerApplication): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== data.uid) {
    throw new Error('User must be authenticated to submit application');
  }
  const existing = await getUserTrainerApplication(data.uid);
  if (existing && existing.status !== 'rejected') {
    throw new Error(
      existing.status === 'awaiting review'
        ? 'You already have an application pending. Please wait for review.'
        : 'You cannot submit another application.'
    );
  }
  const applicationData: Record<string, unknown> = {
    uid: data.uid,
    fullLegalName: data.fullLegalName,
    email: data.email,
    appliedDate: data.appliedDate instanceof Date ? data.appliedDate.getTime() : (data.appliedDate as unknown as number),
    status: data.status,
    dateOfBirth: data.dateOfBirth,
    phone: data.phone,
    physicalAddress: data.physicalAddress,
    defenseStyles: data.defenseStyles,
    yearsOfExperience: data.yearsOfExperience,
    yearsOfTeaching: data.yearsOfTeaching,
    uploadedFiles: data.uploadedFiles,
    credentialsRevoked: data.credentialsRevoked,
    felonyConviction: data.felonyConviction,
    certifyAccurate: data.certifyAccurate,
    agreeConduct: data.agreeConduct,
  };
  if (data.professionalAlias?.trim()) applicationData.professionalAlias = data.professionalAlias;
  if (data.academyName?.trim()) applicationData.academyName = data.academyName;
  if (data.currentRank?.trim()) applicationData.currentRank = data.currentRank;
  if (data.facebookLink?.trim()) applicationData.facebookLink = data.facebookLink;
  if (data.instagramLink?.trim()) applicationData.instagramLink = data.instagramLink;
  if (data.otherLink?.trim()) applicationData.otherLink = data.otherLink;
  if (data.credentialsRevokedExplanation?.trim()) applicationData.credentialsRevokedExplanation = data.credentialsRevokedExplanation;
  if (data.felonyExplanation?.trim()) applicationData.felonyExplanation = data.felonyExplanation;
  if (data.aboutMe?.trim()) applicationData.aboutMe = data.aboutMe;

  await set(ref(db, `TrainerApplication/${data.uid}`), applicationData);
  await update(ref(db, `users/${data.uid}`), { role: 'trainer', trainerApproved: false });
}
