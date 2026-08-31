export function getDisplayName(user) {
  if (!user) return 'سالم سنان';
  
  if (typeof user === 'object') {
    if (user.displayName && !user.displayName.includes('@')) {
      return user.displayName;
    }
    user = user.email || user.name || '';
  }

  const raw = String(user || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return 'سالم سنان';

  // إذا كان اسماً عادياً وليس إيميل
  if (!raw.includes('@') && !raw.includes('.com') && !raw.includes('.net')) {
    return raw;
  }

  // مطابقة أسماء فريق العمل
  if (lower.startsWith('hamza') || lower.includes('hamza@')) return 'حمزة';
  if (lower.startsWith('ahmed') || lower.includes('ahmed@')) return 'أحمد';
  if (lower.startsWith('sarmad') || lower.includes('sarmad.')) return 'سرمد';
  if (lower.startsWith('salim') || lower.includes('salimsinan') || lower.includes('salem')) return 'سالم سنان';
  if (lower.startsWith('ali') || lower.includes('ali@')) return 'علي';
  if (lower.startsWith('mustafa') || lower.includes('mustafa@')) return 'مصطفى';
  if (lower.startsWith('karrar') || lower.includes('karrar@')) return 'كرار';
  if (lower.startsWith('hussein') || lower.includes('hussein@')) return 'حسين';

  // اسم البائع الافتراضي
  return 'سالم سنان';
}
