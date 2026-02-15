// Mirrors defendu-app User model for same Realtime Database shape

/**
 * @typedef {'individual'|'trainer'|'admin'} UserRole
 */

/**
 * @typedef {Object} User
 * @property {string} uid
 * @property {string} email
 * @property {string} username
 * @property {string} firstName
 * @property {string} lastName
 * @property {Date} createdAt
 * @property {string} [role]
 * @property {boolean} [hasCompletedSkillProfile]
 * @property {boolean} [trainerApproved]
 */

/**
 * @typedef {Object} RegisterData
 * @property {string} email
 * @property {string} password
 * @property {string} username
 * @property {string} firstName
 * @property {string} lastName
 */

export default {};
