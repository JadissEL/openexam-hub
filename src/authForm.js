// Client-side checks for the /app email form. These run before any Firebase Auth call so
// invalid addresses and short passwords never hit accounts:signUp / accounts:signIn /
// accounts:sendOobCode. Messages match the Firebase error wording already shown in AuthGate.

export const MIN_PASSWORD_LENGTH = 6;

/** Simple email shape: local@domain.tld, no spaces. Not a full RFC 5322 check. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {{ email?: string, password?: string, mode?: 'signup' | 'login' | 'reset' }} fields
 * @returns {{ field: 'email' | 'password', message: string } | null}
 */
export function authFormError({ email = '', password = '', mode = 'signup' } = {}) {
  const em = String(email).trim();
  if (!em) return { field: 'email', message: 'Please enter your email address.' };
  if (!EMAIL_PATTERN.test(em)) return { field: 'email', message: 'Please enter a valid email address.' };
  if (mode !== 'reset') {
    const pw = String(password);
    if (!pw) return { field: 'password', message: 'Please enter your password.' };
    if (pw.length < MIN_PASSWORD_LENGTH) {
      return { field: 'password', message: 'Please use a password with at least 6 characters.' };
    }
  }
  return null;
}
