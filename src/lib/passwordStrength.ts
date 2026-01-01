/**
 * Password strength validation utilities
 * Enforces strong passwords to protect the master encryption key
 */

/**
 * Calculate the entropy of a password based on character set size
 */
export function calculatePasswordEntropy(password: string): number {
  if (!password) return 0;

  // Determine character set size based on characters used
  const charsetSize =
    (/[a-z]/.test(password) ? 26 : 0) +
    (/[A-Z]/.test(password) ? 26 : 0) +
    (/[0-9]/.test(password) ? 10 : 0) +
    (/[^a-zA-Z0-9]/.test(password) ? 32 : 0);

  if (charsetSize === 0) return 0;

  // Entropy = log2(charset^length)
  return Math.log2(Math.pow(charsetSize, password.length));
}

/**
 * Check for common weak password patterns
 */
function hasWeakPatterns(password: string): string | null {
  // Check for repeated characters (3+ in a row)
  if (/(.)\1{2,}/.test(password)) {
    return 'Password contains repeated characters (e.g., "aaa")';
  }

  // Check for sequential characters (e.g., "abc", "123")
  const sequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i;
  if (sequential.test(password)) {
    return 'Password contains sequential characters (e.g., "abc", "123")';
  }

  // Check for keyboard patterns
  const keyboardPatterns = /qwerty|asdfgh|zxcvbn|qazwsx|password|letmein|welcome|admin/i;
  if (keyboardPatterns.test(password)) {
    return 'Password contains common keyboard patterns';
  }

  return null;
}

export interface PasswordStrengthResult {
  valid: boolean;
  entropy: number;
  strength: 'weak' | 'fair' | 'good' | 'strong';
  message?: string;
  suggestions: string[];
}

/**
 * Validate password strength for protecting encryption keys
 * Requires ~80 bits of entropy for resistance to offline attacks
 */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  const suggestions: string[] = [];
  const entropy = calculatePasswordEntropy(password);

  // Check minimum length (enforced separately, but also here)
  if (password.length < 12) {
    suggestions.push('Use at least 12 characters');
  }

  // Check for character variety
  if (!/[a-z]/.test(password)) {
    suggestions.push('Add lowercase letters');
  }
  if (!/[A-Z]/.test(password)) {
    suggestions.push('Add uppercase letters');
  }
  if (!/[0-9]/.test(password)) {
    suggestions.push('Add numbers');
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    suggestions.push('Add special characters (!@#$%^&*)');
  }

  // Check for weak patterns
  const weakPattern = hasWeakPatterns(password);
  if (weakPattern) {
    return {
      valid: false,
      entropy,
      strength: 'weak',
      message: weakPattern,
      suggestions,
    };
  }

  // Determine strength based on entropy
  // 40 bits = weak, 60 bits = fair, 80 bits = good, 100+ bits = strong
  let strength: 'weak' | 'fair' | 'good' | 'strong';
  if (entropy < 40) {
    strength = 'weak';
  } else if (entropy < 60) {
    strength = 'fair';
  } else if (entropy < 80) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  // For encryption, we require at least 60 bits (fair) to be valid
  // but recommend 80+ bits (good) for best security
  if (entropy < 60) {
    return {
      valid: false,
      entropy,
      strength,
      message: 'Password is too weak for protecting encrypted data. Use a longer password with more character variety.',
      suggestions,
    };
  }

  if (entropy < 80) {
    return {
      valid: true,
      entropy,
      strength,
      message: 'Password is acceptable but could be stronger. Consider making it longer.',
      suggestions,
    };
  }

  return {
    valid: true,
    entropy,
    strength,
    suggestions: [],
  };
}

/**
 * Get a visual representation of password strength
 */
export function getStrengthColor(strength: 'weak' | 'fair' | 'good' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return '#ef4444'; // red
    case 'fair':
      return '#f59e0b'; // amber
    case 'good':
      return '#22c55e'; // green
    case 'strong':
      return '#059669'; // emerald
  }
}

/**
 * Get strength percentage for progress bar
 */
export function getStrengthPercentage(entropy: number): number {
  // 0-40 = 0-25%, 40-60 = 25-50%, 60-80 = 50-75%, 80+ = 75-100%
  if (entropy <= 0) return 0;
  if (entropy < 40) return Math.round((entropy / 40) * 25);
  if (entropy < 60) return 25 + Math.round(((entropy - 40) / 20) * 25);
  if (entropy < 80) return 50 + Math.round(((entropy - 60) / 20) * 25);
  return Math.min(100, 75 + Math.round(((entropy - 80) / 40) * 25));
}
