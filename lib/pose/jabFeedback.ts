/**
 * Jab feedback and form rules. Re-exported from modules/punching/jab for backward compatibility.
 * Prefer importing from lib/pose/modules/punching/jab when adding new jab-related code.
 */

export {
  leadArm,
  computeJabMetrics,
  compareJabMetrics,
  getJabFeedback,
  getJabFeedbackOrthodox,
  isImpactFormAcceptable,
  isImpactFormAcceptableOrthodox,
  type JabMetrics,
} from './modules/punching/jab/jabFeedback';
