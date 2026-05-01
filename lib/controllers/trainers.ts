import { ref, get, set, update } from 'firebase/database';
import { auth, db } from '../config/firebaseConfig';
import type { User } from '../models/User';
import type { TrainerApplication } from '../models/TrainerApplication';
import { getCurrentUser } from './authSession';
import { normalizeArray } from './normalize';

export type TrainerRatingSummary = {
  averageRating: number;
  totalReviews: number;
};

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
      const isHidden = Boolean((userDataRaw as { trainerProfileHidden?: unknown }).trainerProfileHidden);
      if (isHidden && uid !== currentUser.uid) continue;
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
        trainerProfileHidden: isHidden,
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

export async function getTrainerApplicationsByUids(
  trainerIds: string[]
): Promise<Record<string, TrainerApplication | null>> {
  const ids = new Set(trainerIds.map((id) => String(id ?? '').trim()).filter(Boolean));
  if (ids.size === 0) return {};
  try {
    const snap = await get(ref(db, 'TrainerApplication'));
    if (!snap.exists()) {
      return Object.fromEntries(Array.from(ids).map((id) => [id, null]));
    }
    const all = snap.val() as Record<string, Record<string, unknown>>;
    const output: Record<string, TrainerApplication | null> = {};
    for (const id of ids) {
      const raw = all[id];
      if (!raw || typeof raw !== 'object') {
        output[id] = null;
        continue;
      }
      output[id] = {
        ...raw,
        uid: String(raw.uid ?? id),
        appliedDate: raw.appliedDate ? new Date(raw.appliedDate as number) : new Date(),
      } as TrainerApplication;
    }
    return output;
  } catch {
    return Object.fromEntries(Array.from(ids).map((id) => [id, null]));
  }
}

export async function getTrainerRatingSummaries(
  trainerIds: string[]
): Promise<Record<string, TrainerRatingSummary>> {
  const ids = Array.from(new Set(trainerIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (!ids.length) return {};
  const empty = Object.fromEntries(ids.map((id) => [id, { averageRating: 0, totalReviews: 0 }])) as Record<string, TrainerRatingSummary>;

  const aggregateFromCategoryReviewsRoot = async (): Promise<Record<string, TrainerRatingSummary>> => {
    try {
      const fallback = await get(ref(db, 'categoryReviews'));
      if (!fallback.exists()) return empty;
      const root = fallback.val() as Record<string, Record<string, { trainerRatings?: Record<string, number> }>>;
      const sums: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const counts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const idSet = new Set(ids);
      for (const categoryNode of Object.values(root)) {
        if (!categoryNode || typeof categoryNode !== 'object') continue;
        for (const review of Object.values(categoryNode)) {
          const ratings = (review as { trainerRatings?: Record<string, number> })?.trainerRatings;
          if (!ratings || typeof ratings !== 'object') continue;
          for (const [trainerId, value] of Object.entries(ratings)) {
            if (!idSet.has(trainerId)) continue;
            const rating = Number(value);
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
            sums[trainerId] += rating;
            counts[trainerId] += 1;
          }
        }
      }
      const out = { ...empty };
      for (const id of ids) {
        const totalReviews = counts[id] ?? 0;
        const averageRating = totalReviews > 0 ? (sums[id] ?? 0) / totalReviews : 0;
        out[id] = { totalReviews, averageRating };
      }
      return out;
    } catch {
      return empty;
    }
  };

  const aggregateFromUsersCategoryReviews = async (): Promise<Record<string, TrainerRatingSummary>> => {
    try {
      const usersSnap = await get(ref(db, 'users'));
      if (!usersSnap.exists()) return empty;
      const users = usersSnap.val() as Record<string, { categoryReviews?: Record<string, { trainerRatings?: Record<string, number> }> }>;
      const sums: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const counts: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      const idSet = new Set(ids);
      for (const user of Object.values(users)) {
        const byCategory = user?.categoryReviews;
        if (!byCategory || typeof byCategory !== 'object') continue;
        for (const review of Object.values(byCategory)) {
          const ratings = review?.trainerRatings;
          if (!ratings || typeof ratings !== 'object') continue;
          for (const [trainerId, value] of Object.entries(ratings)) {
            if (!idSet.has(trainerId)) continue;
            const rating = Number(value);
            if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
            sums[trainerId] += rating;
            counts[trainerId] += 1;
          }
        }
      }
      const out = { ...empty };
      for (const id of ids) {
        const totalReviews = counts[id] ?? 0;
        const averageRating = totalReviews > 0 ? (sums[id] ?? 0) / totalReviews : 0;
        out[id] = { totalReviews, averageRating };
      }
      return out;
    } catch {
      return empty;
    }
  };

  const hasAnyReviews = (map: Record<string, TrainerRatingSummary>) =>
    Object.values(map).some((r) => (r.totalReviews ?? 0) > 0);

  const mergeFallbackWhereMissing = async (
    primary: Record<string, TrainerRatingSummary>
  ): Promise<Record<string, TrainerRatingSummary>> => {
    const missingIds = ids.filter((id) => (primary[id]?.totalReviews ?? 0) <= 0);
    if (!missingIds.length) return primary;
    const categoryRoot = await aggregateFromCategoryReviewsRoot();
    const usersFallback = await aggregateFromUsersCategoryReviews();
    const merged = { ...primary };
    for (const id of missingIds) {
      const fromCategoryRoot = categoryRoot[id];
      if ((fromCategoryRoot?.totalReviews ?? 0) > 0) {
        merged[id] = fromCategoryRoot;
        continue;
      }
      const fromUsers = usersFallback[id];
      if ((fromUsers?.totalReviews ?? 0) > 0) {
        merged[id] = fromUsers;
      }
    }
    return merged;
  };

  try {
    const snap = await get(ref(db, 'trainerRatings'));
    if (!snap.exists()) {
      const fromCategoryRoot = await aggregateFromCategoryReviewsRoot();
      if (hasAnyReviews(fromCategoryRoot)) return fromCategoryRoot;
      return aggregateFromUsersCategoryReviews();
    }
    const root = snap.val() as Record<string, { stats?: Record<string, unknown>; reviews?: Record<string, { rating?: number }> }>;
    const out: Record<string, TrainerRatingSummary> = { ...empty };
    for (const trainerId of ids) {
      const node = root?.[trainerId];
      if (!node) continue;
      const stats = node.stats ?? {};
      const totalReviews = Number(stats.totalReviews ?? 0);
      const averageRating = Number(stats.averageRating ?? 0);
      if (Number.isFinite(totalReviews) && totalReviews > 0 && Number.isFinite(averageRating) && averageRating > 0) {
        out[trainerId] = { totalReviews, averageRating };
        continue;
      }
      const rows = node.reviews ?? {};
      let sum = 0;
      let count = 0;
      for (const row of Object.values(rows)) {
        const rating = Number(row?.rating ?? 0);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
        sum += rating;
        count += 1;
      }
      out[trainerId] = { totalReviews: count, averageRating: count > 0 ? sum / count : 0 };
    }
    if (hasAnyReviews(out)) return mergeFallbackWhereMissing(out);
    const fromCategoryRoot = await aggregateFromCategoryReviewsRoot();
    if (hasAnyReviews(fromCategoryRoot)) return fromCategoryRoot;
    return aggregateFromUsersCategoryReviews();
  } catch {
    const fromCategoryRoot = await aggregateFromCategoryReviewsRoot();
    if (hasAnyReviews(fromCategoryRoot)) return fromCategoryRoot;
    return aggregateFromUsersCategoryReviews();
  }
}

/** Update the public trainer profile (what shows on Trainer page). Only approved trainers. */
export async function updateTrainerProfile(
  uid: string,
  updates: {
    email?: string;
    academyName?: string;
    phone?: string;
    physicalAddress?: string;
    defenseStyles?: string[];
    yearsOfExperience?: string;
    yearsOfTeaching?: string;
    currentRank?: string;
    aboutMe?: string;
    aboutMeImageUrl?: string;
    facebookLink?: string;
    instagramLink?: string;
    otherLink?: string;
    trainerProfileHidden?: boolean;
  }
): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.uid !== uid) throw new Error('User must be authenticated');
  if (currentUser.role !== 'trainer' || !currentUser.trainerApproved) {
    throw new Error('Only approved trainers can update their trainer profile');
  }
  const applicationRef = ref(db, `TrainerApplication/${uid}`);
  const patch: Record<string, unknown> = {};
  if (updates.email !== undefined) patch.email = updates.email.trim();
  if (updates.academyName !== undefined) patch.academyName = updates.academyName.trim();
  if (updates.phone !== undefined) patch.phone = updates.phone.trim();
  if (updates.physicalAddress !== undefined) patch.physicalAddress = updates.physicalAddress.trim();
  if (updates.defenseStyles !== undefined) patch.defenseStyles = updates.defenseStyles;
  if (updates.yearsOfExperience !== undefined) patch.yearsOfExperience = updates.yearsOfExperience;
  if (updates.yearsOfTeaching !== undefined) patch.yearsOfTeaching = updates.yearsOfTeaching;
  if (updates.currentRank !== undefined) patch.currentRank = updates.currentRank;
  if (updates.aboutMe !== undefined) patch.aboutMe = updates.aboutMe;
  if (updates.aboutMeImageUrl !== undefined) patch.aboutMeImageUrl = updates.aboutMeImageUrl;
  if (updates.facebookLink !== undefined) patch.facebookLink = updates.facebookLink.trim();
  if (updates.instagramLink !== undefined) patch.instagramLink = updates.instagramLink.trim();
  if (updates.otherLink !== undefined) patch.otherLink = updates.otherLink.trim();
  const userPatch: Record<string, unknown> = {};
  if (updates.trainerProfileHidden !== undefined) userPatch.trainerProfileHidden = Boolean(updates.trainerProfileHidden);
  if (Object.keys(patch).length === 0 && Object.keys(userPatch).length === 0) return;
  await Promise.all([
    Object.keys(patch).length ? update(applicationRef, patch) : Promise.resolve(),
    Object.keys(userPatch).length ? update(ref(db, `users/${uid}`), userPatch) : Promise.resolve(),
  ]);
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
    credentialImageUrls: data.credentialImageUrls,
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
