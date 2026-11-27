/** Visible account name, with a stable fallback when profile fields are missing. */
export function accountDisplayName(user) {
  if (!user || typeof user !== 'object') return 'Member';
  const name = typeof user.displayName === 'string' ? user.displayName.trim() : '';
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return name || email || 'Member';
}

/** Accessible name for the signed-in account chip (includes the visible name). */
export function accountChipLabel(user) {
  return `Your account, ${accountDisplayName(user)}`;
}
