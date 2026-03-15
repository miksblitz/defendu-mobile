/**
 * Jab-related pose logic for punching modules.
 * - jabFeedback: form rules, metrics, orthodox (left punch / right guard) checks
 * - jabRepDetector: lead jab and orthodox jab rep detection
 * - jabComparator: orthodox compare (distance + form)
 *
 * Import from here when you need jab-specific behavior under punching.
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
} from './jabFeedback';

export { createLeadJabRepDetector, createOrthodoxJabRepDetector } from './jabRepDetector';

export {
  compareRepWithFeedbackOrthodox,
  compareRepWithFeedbackAnyOrthodox,
} from './jabComparator';
