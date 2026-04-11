/**
 * Rear high kick — MP **left** hip/knee/ankle (mirrored selfie ≈ orthodox **rear** leg; on the body
 * that is often the right leg, opposite the lead-high chain). Same high-kick thresholds as lead
 * high kick via `oneLegHighKickShape`. Support = right ankle.
 */

import type { PoseFrame } from '../../../types';
import { MP, MN17 } from '../lead-low-kick/leadLowKickGeometry';
import { oneLegHighKickShape } from '../lead-high-kick/leadHighKickGeometry';

export function inRearHighKickStrikePose(frame: PoseFrame, idx: typeof MP | typeof MN17): boolean {
  return oneLegHighKickShape(frame, idx, idx.lh, idx.lk, idx.la, idx.ra);
}
