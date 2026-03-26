import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled GIFs for warmup exercises (PublishModuleScreen / module warmupExercises strings).
 * Filenames live under assets/images/guides/.
 */
const ARM_CIRCLES = require('../assets/images/guides/arm circles.gif');
const HIP_CIRCLES = require('../assets/images/guides/Hip Circles.gif');
const LEG_SWING = require('../assets/images/guides/Leg Swing.gif');
const JOG_IN_PLACE = require('../assets/images/guides/jon in place.gif');
const JUMPING_JACKS = require('../assets/images/guides/Jumping jacks.gif');
const SQUATS = require('../assets/images/guides/Squats.gif');
const PUSH_UPS = require('../assets/images/guides/Push ups.gif');
const LUNGES = require('../assets/images/guides/Lunges.gif');
const STANDING_SIDE_STRETCH = require('../assets/images/cooldown_guides/Standing side stretch.gif');
const STANDING_HAMSTRING_STRETCH = require('../assets/images/cooldown_guides/Standing hamstring stretch.gif');
const SHOULDER_STRETCH = require('../assets/images/cooldown_guides/shoulder stretch.gif');
const QUAD_STRETCH = require('../assets/images/cooldown_guides/Quad stretch.gif');
const KNEE_HUG = require('../assets/images/cooldown_guides/knee hug.gif');

/** Exact labels saved from PublishModuleScreen. */
const BY_EXACT_LABEL: Record<string, ImageSourcePropType> = {
  'ARM CIRCLES': ARM_CIRCLES,
  'HIP CIRCLES': HIP_CIRCLES,
  'HIP CIRCLES (like doing a hula hoop)': HIP_CIRCLES,
  'LEG SWINGS': LEG_SWING,
  'MARCH -OR- JOG IN PLACE': JOG_IN_PLACE,
  'JUMPING JACKS': JUMPING_JACKS,
  'BODYWEIGHT SQUATS': SQUATS,
  'REGULAR PUSH-UPS': PUSH_UPS,
  LUNGES: LUNGES,
};

/**
 * Resolve a bundled guide image for a warmup exercise name, or null if unknown.
 */
export function getWarmupGuideSource(label: string): ImageSourcePropType | null {
  const t = label.trim();
  const direct = BY_EXACT_LABEL[t];
  if (direct) return direct;

  const low = t.toLowerCase();
  if (low.includes('arm circle')) return ARM_CIRCLES;
  if (low.includes('hip circle') || low.includes('hula')) return HIP_CIRCLES;
  if (low.includes('leg swing')) return LEG_SWING;
  if (low.includes('march') || low.includes('jog') || low.includes('place')) return JOG_IN_PLACE;
  if (low.includes('jumping jack')) return JUMPING_JACKS;
  if (low.includes('squat')) return SQUATS;
  if (low.includes('push') && low.includes('up')) return PUSH_UPS;
  if (low.includes('lunge')) return LUNGES;

  return null;
}

/** Exact labels saved from PublishModuleScreen for cooldowns. */
const COOLDOWN_BY_EXACT_LABEL: Record<string, ImageSourcePropType> = {
  'STANDING SIDE STRETCH': STANDING_SIDE_STRETCH,
  'STANDING HAMSTRING STRETCH': STANDING_HAMSTRING_STRETCH,
  'SHOULDER STRETCH': SHOULDER_STRETCH,
  'QUAD STRETCH': QUAD_STRETCH,
  'KNEE HUG': KNEE_HUG,
};

/**
 * Resolve a bundled guide image for a cooldown exercise name, or null if unknown.
 */
export function getCooldownGuideSource(label: string): ImageSourcePropType | null {
  const t = label.trim();
  const direct = COOLDOWN_BY_EXACT_LABEL[t];
  if (direct) return direct;

  const low = t.toLowerCase();
  if (low.includes('side') && low.includes('stretch')) return STANDING_SIDE_STRETCH;
  if (low.includes('hamstring')) return STANDING_HAMSTRING_STRETCH;
  if (low.includes('shoulder') && low.includes('stretch')) return SHOULDER_STRETCH;
  if (low.includes('quad') && low.includes('stretch')) return QUAD_STRETCH;
  if (low.includes('knee') && low.includes('hug')) return KNEE_HUG;

  return null;
}
