/**
 * Cryptographic constants for AES-256-GCM encryption
 */

// AES-GCM configuration
export const AES_ALGORITHM = 'AES-GCM';
export const AES_KEY_LENGTH = 256; // bits

// IV (Initialization Vector) configuration
// 12 bytes (96 bits) is the recommended size for AES-GCM
export const IV_LENGTH = 12; // bytes

// PBKDF2 configuration for key derivation
export const PBKDF2_ALGORITHM = 'PBKDF2';
export const PBKDF2_HASH = 'SHA-256';
export const PBKDF2_ITERATIONS = 600000; // OWASP 2024 recommendation
/** The most KEK iterations accepted from the server (more would only freeze the tab). */
export const PBKDF2_MAX_ITERATIONS = 2_000_000;
export const PBKDF2_SALT_LENGTH = 16; // bytes

// Recovery key configuration
export const RECOVERY_KEY_LENGTH = 32; // bytes (256 bits)
export const RECOVERY_PBKDF2_ITERATIONS = 600000; // Match KEK iterations for consistent security
