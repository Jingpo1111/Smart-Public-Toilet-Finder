/**
 * Privacy-preserving public name: first name plus last-name initial ("Sokha Chan" → "Sokha C.").
 * Used wherever another user's name appears publicly (e.g. reviews).
 */
export function publicDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ToiletGo user';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
