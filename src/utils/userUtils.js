export function getDisplayName(user) {
  if (!user) return 'سالم سنان';
  
  if (typeof user === 'object' && user.displayName) {
    return user.displayName;
  }

  const raw = typeof user === 'string' ? user : (user.email || user.name || '');
  const trimmed = (raw || '').trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) return 'سالم سنان';

  // If it's already a plain name without '@', return it directly
  if (!trimmed.includes('@')) {
    return trimmed;
  }

  // Predefined Staff Mappings
  if (lower.startsWith('hamza') || lower.includes('hamza@')) return 'حمزة';
  if (lower.startsWith('ahmed') || lower.includes('ahmed@')) return 'أحمد';
  if (lower.startsWith('sarmad') || lower.includes('sarmad.')) return 'سرمد';
  if (lower.startsWith('salim') || lower.includes('salimsinan') || lower.includes('salem')) return 'سالم سنان';
  if (lower.startsWith('ali') || lower.includes('ali@')) return 'علي';
  if (lower.startsWith('mustafa') || lower.includes('mustafa@')) return 'مصطفى';
  if (lower.startsWith('karrar') || lower.includes('karrar@')) return 'كرار';
  if (lower.startsWith('hussein') || lower.includes('hussein@')) return 'حسين';

  // For any other email, extract username before '@' and format cleanly
  const username = trimmed.split('@')[0].replace(/[._-]/g, ' ');
  return username.charAt(0).toUpperCase() + username.slice(1);
}
