import React, { useState, useEffect, useMemo } from 'react';

/**
 * Days of week list in Arabic (Saturday through Friday)
 */
export const DAYS_OF_WEEK = [
  { id: 'saturday', short: 'س', label: 'السبت' },
  { id: 'sunday', short: 'ح', label: 'الأحد' },
  { id: 'monday', short: 'ن', label: 'الإثنين' },
  { id: 'tuesday', short: 'ث', label: 'الثلاثاء' },
  { id: 'wednesday', short: 'ر', label: 'الأربعاء' },
  { id: 'thursday', short: 'خ', label: 'الخميس' },
  { id: 'friday', short: 'ج', label: 'الجمعة' },
];

/**
 * Quick monthly presets
 */
export const MONTHLY_PRESETS = [
  { day: 1, label: 'بداية الشهر (1)', desc: 'فاتورة أول الشهر' },
  { day: 8, label: 'يوم 8 بالشهر (8)', desc: 'موعد دوري مخصص' },
  { day: 15, label: 'منتصف الشهر (15)', desc: 'منتصف الدورة' },
  { day: 25, label: 'موعد الرواتب (25)', desc: 'الأكثر شيوعاً' },
];

/**
 * Quick time presets
 */
export const TIME_PRESETS = [
  { time: '10:00', label: '10:00 ص', desc: 'صباحاً', icon: '☀️' },
  { time: '14:00', label: '02:00 م', desc: 'ظهراً', icon: '🌤️' },
  { time: '17:00', label: '05:00 م', desc: 'عصراً', icon: '🌇' },
  { time: '20:00', label: '08:00 م', desc: 'ساعة 8 مساءً', icon: '🌙' },
  { time: '21:30', label: '09:30 م', desc: 'ليلاً', icon: '✨' },
];

/**
 * Format 24-hour time string into readable Arabic
 */
export function formatTimeArabic(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return timeStr;

  const isPM = h >= 12;
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  const mFormatted = m > 0 ? `:${m < 10 ? '0' + m : m}` : ':00';
  return `الساعة ${displayH}${mFormatted} ${isPM ? 'مساءً' : 'صباحاً'}`;
}

/**
 * Format short time badge
 */
export function formatTimeShort(timeStr) {
  if (!timeStr) return '';
  const parts = String(timeStr).split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return timeStr;

  const isPM = h >= 12;
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  const mFormatted = m > 0 ? `:${m < 10 ? '0' + m : m}` : '';
  return `${displayH}${mFormatted} ${isPM ? 'م' : 'ص'}`;
}

/**
 * AppleSchedulePicker
 * A sleek iOS / Apple Human Interface Design inspired schedule & exact time customizer.
 */
export default function AppleSchedulePicker({
  value = 'default',
  onChange,
  defaultStoreDay = 'thursday',
  defaultStoreTime = '20:00',
  showTimeSelector = true,
  timeValue = null,
  onTimeChange
}) {
  // Parse current value into mode, date params & time
  const parsed = useMemo(() => {
    let raw = String(value || 'default');
    let extractedTime = timeValue || defaultStoreTime || '20:00';

    if (raw.includes('@')) {
      const [schedPart, timePart] = raw.split('@');
      raw = schedPart;
      if (timePart && timePart.includes(':')) {
        extractedTime = timePart;
      }
    }

    if (!raw || raw === 'default') {
      return { mode: 'default', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: 25, customDays: 7, customHours: 2, customMinutes: 15, time: extractedTime };
    }
    if (raw === 'disabled') {
      return { mode: 'disabled', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: 25, customDays: 7, customHours: 2, customMinutes: 15, time: extractedTime };
    }
    if (raw.startsWith('minutely_') || (raw.startsWith('custom_') && (raw.includes('_mins') || raw.includes('_min')))) {
      const minutes = parseInt(raw.replace('minutely_', '').replace('custom_', '').replace('_minutes', '').replace('_mins', '').replace('_min', ''), 10) || 15;
      return { mode: 'minutes', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: 25, customDays: 7, customHours: 2, customMinutes: minutes, time: extractedTime };
    }
    if (raw.startsWith('hourly_') || (raw.startsWith('custom_') && raw.includes('_hours'))) {
      const hours = parseInt(raw.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 2;
      return { mode: 'hourly', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: 25, customDays: 7, customHours: hours, customMinutes: 15, time: extractedTime };
    }
    if (DAYS_OF_WEEK.some(d => d.id === raw)) {
      return { mode: 'weekly', dayOfWeek: raw, dayOfMonth: 25, customDays: 7, customHours: 2, customMinutes: 15, time: extractedTime };
    }
    if (raw.startsWith('monthly_')) {
      const day = parseInt(raw.replace('monthly_', ''), 10) || 25;
      return { mode: 'monthly', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: day, customDays: 7, customHours: 2, customMinutes: 15, time: extractedTime };
    }
    if (raw.startsWith('custom_')) {
      const days = parseInt(raw.replace('custom_', '').replace('_days', ''), 10) || 7;
      return { mode: 'custom', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: 25, customDays: days, customHours: 2, customMinutes: 15, time: extractedTime };
    }
    return { mode: 'default', dayOfWeek: defaultStoreDay || 'thursday', dayOfMonth: 25, customDays: 7, customHours: 2, customMinutes: 15, time: extractedTime };
  }, [value, defaultStoreDay, defaultStoreTime, timeValue]);

  const [mode, setMode] = useState(parsed.mode);
  const [selectedDay, setSelectedDay] = useState(parsed.dayOfWeek);
  const [selectedMonthDay, setSelectedMonthDay] = useState(parsed.dayOfMonth);
  const [customDays, setCustomDays] = useState(parsed.customDays);
  const [customHours, setCustomHours] = useState(parsed.customHours || 2);
  const [customMinutes, setCustomMinutes] = useState(parsed.customMinutes || 15);
  const [selectedTime, setSelectedTime] = useState(parsed.time);

  // Sync internal state when external value changes
  useEffect(() => {
    setMode(parsed.mode);
    setSelectedDay(parsed.dayOfWeek);
    setSelectedMonthDay(parsed.dayOfMonth);
    setCustomDays(parsed.customDays);
    setCustomHours(parsed.customHours || 2);
    setCustomMinutes(parsed.customMinutes || 15);
    setSelectedTime(parsed.time);
  }, [parsed]);

  // Emit change when any sub-control changes
  const updateSchedule = (newMode, newDay, newMonthDay, newCustomDays, newCustomHours, newCustomMinutes, newTime) => {
    const t = newTime !== undefined ? newTime : selectedTime;
    let baseValue = 'default';
    if (newMode === 'default') {
      baseValue = 'default';
    } else if (newMode === 'minutes') {
      baseValue = `minutely_${newCustomMinutes || 15}`;
    } else if (newMode === 'hourly') {
      baseValue = `hourly_${newCustomHours || 2}`;
    } else if (newMode === 'weekly') {
      baseValue = newDay || 'thursday';
    } else if (newMode === 'monthly') {
      baseValue = `monthly_${newMonthDay || 25}`;
    } else if (newMode === 'custom') {
      baseValue = `custom_${newCustomDays || 7}_days`;
    } else if (newMode === 'disabled') {
      baseValue = 'disabled';
    }

    let finalValue = baseValue;
    if (baseValue !== 'default' && baseValue !== 'disabled' && !baseValue.startsWith('hourly_') && !baseValue.startsWith('minutely_') && t) {
      finalValue = `${baseValue}@${t}`;
    }

    if (onChange) onChange(finalValue);
    if (onTimeChange) onTimeChange(t);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    updateSchedule(newMode, selectedDay, selectedMonthDay, customDays, customHours, customMinutes, selectedTime);
  };

  const handleCustomMinutesChange = (delta) => {
    const next = Math.max(1, Math.min(180, customMinutes + delta));
    setCustomMinutes(next);
    updateSchedule('minutes', selectedDay, selectedMonthDay, customDays, customHours, next, selectedTime);
  };

  const handleHourlyHoursChange = (delta) => {
    const next = Math.max(1, Math.min(48, customHours + delta));
    setCustomHours(next);
    updateSchedule('hourly', selectedDay, selectedMonthDay, customDays, next, customMinutes, selectedTime);
  };

  const handleDaySelect = (dayId) => {
    setSelectedDay(dayId);
    updateSchedule('weekly', dayId, selectedMonthDay, customDays, customHours, customMinutes, selectedTime);
  };

  const handleMonthDaySelect = (dayNum) => {
    const clamped = Math.max(1, Math.min(31, dayNum));
    setSelectedMonthDay(clamped);
    updateSchedule('monthly', selectedDay, clamped, customDays, customHours, customMinutes, selectedTime);
  };

  const handleCustomDaysChange = (delta) => {
    const next = Math.max(1, Math.min(90, customDays + delta));
    setCustomDays(next);
    updateSchedule('custom', selectedDay, selectedMonthDay, next, customHours, customMinutes, selectedTime);
  };

  const handleTimeSelect = (t) => {
    setSelectedTime(t);
    const targetMode = mode === 'disabled' ? 'weekly' : mode;
    if (mode === 'disabled') setMode('weekly');
    updateSchedule(targetMode, selectedDay, selectedMonthDay, customDays, customHours, customMinutes, t);
  };

  // Human friendly summary text
  const scheduleSummary = useMemo(() => {
    const timeFormatted = formatTimeArabic(selectedTime);

    if (mode === 'disabled') {
      return {
        icon: '🚫',
        title: 'التذكير الآلي معطل',
        desc: 'لن يرسل النظام أي رسائل تلقائية لهذا العميل (يمكنك الإرسال يدوياً متى شئت).',
        badge: 'معطل',
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200'
      };
    }
    if (mode === 'minutes') {
      return {
        icon: '⚡',
        title: `تذكير دوري بالدقائق: بعد / كل ${customMinutes} دقيقة`,
        desc: `يتم حساب الفارق الزمني بالدقائق بالضبط من آخر إرسال وإطلاق التذكير فوراً (ممتاز للتجارب).`,
        badge: `كل ${customMinutes} دقيقة`,
        badgeColor: 'bg-amber-50 text-amber-800 border-amber-300'
      };
    }
    if (mode === 'hourly') {
      const hText = customHours === 1 ? 'ساعة واحدة' : customHours === 2 ? 'ساعتين' : customHours <= 10 ? `${customHours} ساعات` : `${customHours} ساعة`;
      return {
        icon: '⏱️',
        title: `تذكير دوري بالساعات: كل ${hText}`,
        desc: `يتم حساب الفارق الزمني وإرسال تذكير بالواتساب كل ${hText} بدقة دون التقيد بيوم واحد (ممتاز للتجارب).`,
        badge: `كل ${hText}`,
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
      };
    }
    if (mode === 'default') {
      const defDay = DAYS_OF_WEEK.find(d => d.id === (defaultStoreDay || 'thursday'))?.label || 'الخميس';
      return {
        icon: '🏢',
        title: `حسب موعد المحل العام (كل ${defDay} - ${timeFormatted})`,
        desc: 'يتبع الجدولة العامة وتوقيت الإرسال المحدد في إعدادات النظام الرئيسية.',
        badge: 'تلقائي عام',
        badgeColor: 'bg-brand-50 text-brand-700 border-brand-200'
      };
    }
    if (mode === 'weekly') {
      const dayName = DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label || 'الخميس';
      return {
        icon: '📅',
        title: `تذكير أسبوعي: كل يوم ${dayName} - ${timeFormatted}`,
        desc: `يتم إرسال تذكير بالدين أسبوعياً في يوم ${dayName} عند ${timeFormatted} تماماً.`,
        badge: `أسبوعي (${formatTimeShort(selectedTime)})`,
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    }
    if (mode === 'monthly') {
      return {
        icon: '🗓️',
        title: `تذكير شهري: يوم ${selectedMonthDay} بالشهر - ${timeFormatted}`,
        desc: `يتم إرسال التذكير شهرياً بتاريخ ${selectedMonthDay} من كل شهر ميلادي في ${timeFormatted} بالضبط.`,
        badge: `يوم ${selectedMonthDay} (${formatTimeShort(selectedTime)})`,
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    }
    if (mode === 'custom') {
      return {
        icon: '⏳',
        title: `تذكير دوري: كل ${customDays} ${customDays === 1 ? 'يوم' : customDays === 2 ? 'يومين' : customDays <= 10 ? 'أيام' : 'يوماً'} - ${timeFormatted}`,
        desc: `يتم حساب الفارق الزمني وإرسال تذكير كل ${customDays} يوماً في ${timeFormatted}.`,
        badge: `كل ${customDays} أيام (${formatTimeShort(selectedTime)})`,
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    }
    return { icon: '⏰', title: 'مجدول', desc: '', badge: '', badgeColor: '' };
  }, [mode, selectedDay, selectedMonthDay, customDays, customHours, customMinutes, selectedTime, defaultStoreDay]);

  return (
    <div className="space-y-3" dir="rtl">
      
      {/* 1. Apple Segmented Control (iOS Pill Switcher) */}
      <div className="bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 flex items-center gap-1 shadow-2xs select-none">
        
        <button
          type="button"
          onClick={() => handleModeChange('default')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'default'
              ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🏢</span>
          <span className="truncate">المحل</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('minutes')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'minutes'
              ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-600/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⚡</span>
          <span className="truncate">دقائق</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('hourly')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'hourly'
              ? 'bg-white text-purple-700 shadow-sm ring-1 ring-purple-600/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⏱️</span>
          <span className="truncate">ساعات</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('weekly')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'weekly'
              ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-600/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>📅</span>
          <span className="truncate">أسبوعي</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('monthly')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'monthly'
              ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-600/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🗓️</span>
          <span className="truncate">شهري</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('custom')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'custom'
              ? 'bg-white text-amber-700 shadow-sm ring-1 ring-amber-600/10'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>⏳</span>
          <span className="truncate">أيام</span>
        </button>

        <button
          type="button"
          onClick={() => handleModeChange('disabled')}
          className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
            mode === 'disabled'
              ? 'bg-rose-50 text-rose-700 shadow-sm ring-1 ring-rose-300'
              : 'text-slate-400 hover:text-rose-600'
          }`}
          title="تعطيل التذكير التلقائي"
        >
          <span>🚫</span>
          <span className="hidden sm:inline">معطل</span>
        </button>

      </div>

      {/* 2. Interactive Sub-Controls with Apple HIG Precision */}

      {/* A. Minutes Interval Selector (Apple Presets: 15, 30, 45 mins + Stepper) */}
      {mode === 'minutes' && (
        <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-950">تكرار الإرسال بالدقائق (مخصص للتجارب المباشرة):</span>
            <span className="text-xs font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 font-mono">
              كل {customMinutes} دقيقة
            </span>
          </div>

          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-amber-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              <div>
                <span className="text-xs font-bold text-slate-900 block">إرسال رسالة تذكير بعد / كل:</span>
                <span className="text-[11px] text-slate-500">حساب الفارق بالدقائق بالضبط من آخر إرسال</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCustomMinutesChange(-5)}
                disabled={customMinutes <= 1}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                -
              </button>
              <div className="text-center min-w-[65px]">
                <span className="text-base font-black font-mono text-amber-700 block leading-tight">{customMinutes}</span>
                <span className="text-[10px] text-slate-500 font-bold">دقيقة ⏱️</span>
              </div>
              <button
                type="button"
                onClick={() => handleCustomMinutesChange(5)}
                disabled={customMinutes >= 180}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Minute Chips */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {[1, 5, 10, 15, 20, 30, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setCustomMinutes(m);
                  updateSchedule('minutes', selectedDay, selectedMonthDay, customDays, customHours, m, selectedTime);
                }}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                  customMinutes === m
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-200'
                }`}
              >
                {m} د
              </button>
            ))}
          </div>
        </div>
      )}

      {/* B. Hourly Interval Selector (Apple Presets + Stepper) */}
      {mode === 'hourly' && (
        <div className="bg-purple-50/60 border border-purple-200/80 rounded-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-950">تكرار الإرسال بالساعات (مخصص للتجارب):</span>
            <span className="text-xs font-black text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-300 font-mono">
              كل {customHours === 1 ? 'ساعة' : customHours === 2 ? 'ساعتين' : customHours <= 10 ? `${customHours} ساعات` : `${customHours} ساعة`}
            </span>
          </div>

          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-purple-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⏱️</span>
              <div>
                <span className="text-xs font-bold text-slate-900 block">إرسال رسالة تذكير كل:</span>
                <span className="text-[11px] text-slate-500">حساب الفارق الزمني بالساعات من آخر إرسال</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleHourlyHoursChange(-1)}
                disabled={customHours <= 1}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                -
              </button>
              <div className="text-center min-w-[60px]">
                <span className="text-base font-black font-mono text-purple-700 block leading-tight">{customHours}</span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {customHours === 1 ? 'ساعة' : customHours === 2 ? 'ساعتين' : customHours <= 10 ? 'ساعات' : 'ساعة'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleHourlyHoursChange(1)}
                disabled={customHours >= 48}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Hourly Chips */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {[1, 2, 3, 4, 6, 12, 24].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => {
                  setCustomHours(h);
                  updateSchedule('hourly', selectedDay, selectedMonthDay, customDays, h, selectedTime);
                }}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                  customHours === h
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white hover:bg-purple-100 text-purple-800 border-purple-200'
                }`}
              >
                {h === 1 ? '1 س' : h === 2 ? '2 س' : `${h} س`}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* B. Weekly Day-of-Week Apple Circular Capsules */}
      {mode === 'weekly' && (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">اختر يوم الإرسال الأسبوعي:</span>
            <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              كل يوم {DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1.5 pt-1">
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDay === day.id;
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => handleDaySelect(day.id)}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white font-black shadow-md scale-105 ring-2 ring-emerald-600/30'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200/80 font-bold'
                  }`}
                >
                  <span className="text-xs">{day.label.slice(0, 3)}</span>
                  <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {day.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* C. Monthly Day Selector (Apple Presets + Stepper) */}
      {mode === 'monthly' && (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">تاريخ الإرسال في الشهر:</span>
            <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 font-mono">
              يوم {selectedMonthDay} بالشهر
            </span>
          </div>

          {/* Quick Presets (Includes Day 8!) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MONTHLY_PRESETS.map((preset) => {
              const isSelected = selectedMonthDay === preset.day;
              return (
                <button
                  key={preset.day}
                  type="button"
                  onClick={() => handleMonthDaySelect(preset.day)}
                  className={`p-2 rounded-xl text-right transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-600/20'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="block text-xs font-bold">{preset.label}</span>
                  <span className={`text-[10px] block mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                    {preset.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Day Apple Stepper */}
          <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-600">أو حدد يوماً آخر (1 - 31):</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMonthDaySelect(selectedMonthDay - 1)}
                disabled={selectedMonthDay <= 1}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-800 font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max="31"
                value={selectedMonthDay}
                onChange={(e) => handleMonthDaySelect(Number(e.target.value))}
                className="w-12 text-center font-mono font-black text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg py-1 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => handleMonthDaySelect(selectedMonthDay + 1)}
                disabled={selectedMonthDay >= 31}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-800 font-bold flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

      {/* D. Custom Interval Stepper (Days) */}
      {mode === 'custom' && (
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <span className="text-xs font-bold text-slate-700 block">تكرار الإرسال كل عدد محدد من الأيام:</span>
          
          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⏳</span>
              <div>
                <span className="text-xs font-bold text-slate-900 block">إرسال تذكير كل:</span>
                <span className="text-[11px] text-slate-500">حساب الفارق الزمني من تاريخ آخر إرسال</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCustomDaysChange(-1)}
                disabled={customDays <= 1}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                -
              </button>
              <div className="text-center min-w-[60px]">
                <span className="text-base font-black font-mono text-amber-700 block leading-tight">{customDays}</span>
                <span className="text-[10px] text-slate-500 font-bold">أيام</span>
              </div>
              <button
                type="button"
                onClick={() => handleCustomDaysChange(1)}
                disabled={customDays >= 90}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 text-slate-900 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick interval chips */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {[3, 5, 7, 10, 14, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setCustomDays(d);
                  updateSchedule('custom', selectedDay, selectedMonthDay, d, customHours, selectedTime);
                }}
                className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer border ${
                  customDays === d
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {d} أيام
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3. Apple Exact Time Selector (الساعة والدقيقة بدقة - يظهر للأوضاع اليومية والأسبوعية والشهرية) */}
      {mode !== 'disabled' && mode !== 'hourly' && showTimeSelector && (
        <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <span>⏰</span>
              <span>وقت الإرسال بالساعة والدقيقة:</span>
            </span>
            <span className="text-xs font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 font-mono">
              {formatTimeArabic(selectedTime)}
            </span>
          </div>

          {/* Quick Time Pills */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {TIME_PRESETS.map((preset) => {
              const isSelected = selectedTime === preset.time;
              return (
                <button
                  key={preset.time}
                  type="button"
                  onClick={() => handleTimeSelect(preset.time)}
                  className={`py-1.5 px-2 rounded-xl text-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-black'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
                  }`}
                >
                  <span className="block text-xs font-mono">{preset.label}</span>
                  <span className={`text-[10px] block mt-0.5 truncate ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {preset.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Custom Time Input */}
          <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 gap-2">
            <span className="text-xs font-bold text-slate-600">أو حدد ساعة مخصصة بالضبط:</span>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => handleTimeSelect(e.target.value || '20:00')}
              className="px-3 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* 4. Apple Live Inset Summary Card */}
      <div className={`p-3 rounded-2xl border transition-all flex items-start gap-2.5 ${scheduleSummary.badgeColor}`}>
        <span className="text-xl shrink-0 mt-0.5">{scheduleSummary.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <strong className="text-xs font-black block truncate">{scheduleSummary.title}</strong>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/80 shrink-0 shadow-2xs">
              {scheduleSummary.badge}
            </span>
          </div>
          <p className="text-[11px] opacity-80 mt-0.5 leading-snug">
            {scheduleSummary.desc}
          </p>
        </div>
      </div>

    </div>
  );
}

/**
 * Format any schedule code into clean Arabic label
 */
export function formatAppleScheduleLabel(schedule, defaultStoreDay = 'thursday') {
  if (!schedule || schedule === 'default') {
    const dayLabel = DAYS_OF_WEEK.find(d => d.id === defaultStoreDay)?.label || 'الخميس';
    return `موعد المحل (كل ${dayLabel})`;
  }
  if (schedule === 'disabled') return 'معطل 🚫';
  
  let sched = schedule;
  let timePart = '';
  if (sched.includes('@')) {
    const parts = sched.split('@');
    sched = parts[0];
    timePart = parts[1];
  }

  let label = '';
  if (sched.startsWith('hourly_') || (sched.startsWith('custom_') && sched.includes('_hours'))) {
    const h = parseInt(sched.replace('hourly_', '').replace('custom_', '').replace('_hours', ''), 10) || 1;
    label = h === 1 ? 'كل ساعة ⏱️' : h === 2 ? 'كل ساعتين ⏱️' : h <= 10 ? `كل ${h} ساعات ⏱️` : `كل ${h} ساعة ⏱️`;
    return label;
  }

  const dayMatch = DAYS_OF_WEEK.find(d => d.id === sched);
  if (dayMatch) {
    label = `كل ${dayMatch.label}`;
  } else if (sched.startsWith('monthly_')) {
    const day = sched.replace('monthly_', '');
    label = `يوم ${day} بالشهر`;
  } else if (sched.startsWith('custom_')) {
    const days = sched.replace('custom_', '').replace('_days', '');
    label = `كل ${days} أيام`;
  } else {
    label = sched;
  }

  if (timePart) {
    const timeFormatted = formatTimeShort(timePart);
    if (timeFormatted) {
      label += ` (${timeFormatted})`;
    }
  }

  return label;
}

