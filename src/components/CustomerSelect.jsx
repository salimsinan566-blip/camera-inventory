import React, { useMemo, useState } from 'react';
import { useCustomers } from '../hooks/useCustomers';

function normalizeArabic(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, ''); // Remove tashkeel/diacritics
}

/**
 * حقل عميل الفاتورة / الإيراد:
 * اكتب أي حرف للبحث بالعملاء الموجودين مع مطابقة ذكية، أو اختر من القائمة مباشرة.
 */
export default function CustomerSelect({ 
  value, 
  onChange, 
  onSelect, 
  label = 'العميل (اختياري)', 
  placeholder = 'ابحث عن عميل أو اكتب اسماً جديداً...' 
}) {
  const { customers } = useCustomers();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = useMemo(() => {
    if (!value || !value.trim()) {
      return customers.slice(0, 8); // Display first/top customers on click
    }
    const normTerm = normalizeArabic(value);
    return customers
      .filter((c) => {
        const normName = normalizeArabic(c.name);
        const phone1 = String(c.phone1 || '');
        const phone2 = String(c.phone2 || '');
        return normName.includes(normTerm) || phone1.includes(normTerm) || phone2.includes(normTerm);
      })
      .slice(0, 10);
  }, [customers, value]);

  const exactMatch = value && value.trim() && customers.some(c => normalizeArabic(c.name) === normalizeArabic(value));
  const showNewCustomerOption = value && value.trim() && !exactMatch;

  return (
    <div className="relative">
      {label && <label className="block text-xs font-bold text-ink-700 mb-1">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
          placeholder={placeholder}
          className="input pl-8"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setShowSuggestions(true);
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer"
            title="مسح"
          >
            ✕
          </button>
        )}
      </div>

      {showSuggestions && (suggestions.length > 0 || showNewCustomerOption) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-brand-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100">
          {suggestions.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (onSelect) {
                  onSelect(c);
                } else {
                  onChange(c.name);
                }
                setShowSuggestions(false);
              }}
              className="w-full text-right px-3.5 py-2.5 text-xs hover:bg-brand-50 flex items-center justify-between transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-6 h-6 rounded-lg bg-brand-100 text-brand-800 text-[11px] font-bold flex items-center justify-center shrink-0">
                  👤
                </span>
                <span className="font-bold text-slate-900 group-hover:text-brand-900 truncate">
                  {c.name}
                </span>
              </div>

              {c.phone1 && (
                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0" dir="ltr">
                  {c.phone1}
                </span>
              )}
            </button>
          ))}

          {showNewCustomerOption && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setShowSuggestions(false);
              }}
              className="w-full text-right px-3.5 py-2.5 text-xs hover:bg-emerald-50 text-emerald-800 font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <span>➕</span>
              <span>استخدام كعميل جديد: "{value.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
