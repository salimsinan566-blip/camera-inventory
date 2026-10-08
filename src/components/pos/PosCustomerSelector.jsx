import React, { useState, useRef, useEffect, useMemo } from 'react';

export default function PosCustomerSelector({
  customerName = '',
  customerPhone = '',
  customerType = 'retail',
  customers = [],
  onSelectCustomer,
  onSetNewCustomer,
  onClearCustomer,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(customerName || '');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync internal input value with prop customerName
  useEffect(() => {
    setInputValue(customerName || '');
  }, [customerName]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        // If user typed something new and clicked outside, commit it
        const trimmed = inputValue.trim();
        if (trimmed && trimmed !== (customerName || '').trim()) {
          onSetNewCustomer(trimmed, customerType);
        } else if (!trimmed && customerName) {
          onClearCustomer();
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue, customerName, customerType, onSetNewCustomer, onClearCustomer]);

  // Matching customers
  const matchingCustomers = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) {
      return (customers || []).slice(0, 6);
    }
    return (customers || []).filter((c) => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone1 || c.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    }).slice(0, 8);
  }, [customers, inputValue]);

  // Exact match check
  const exactMatch = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return null;
    return (customers || []).find((c) => (c.name || '').trim().toLowerCase() === q);
  }, [customers, inputValue]);

  const handleSelectExisting = (cust) => {
    setInputValue(cust.name || '');
    onSelectCustomer(cust);
    setIsOpen(false);
  };

  const handlePickNewCustomer = (type) => {
    const name = inputValue.trim();
    if (!name) return;
    onSetNewCustomer(name, type);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onClearCustomer();
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (matchingCustomers.length > 0 && inputValue.trim().toLowerCase() === matchingCustomers[0].name.toLowerCase()) {
        handleSelectExisting(matchingCustomers[0]);
      } else if (matchingCustomers.length === 1) {
        handleSelectExisting(matchingCustomers[0]);
      } else {
        const trimmed = inputValue.trim();
        if (trimmed) {
          onSetNewCustomer(trimmed, customerType);
          setIsOpen(false);
        }
      }
    }
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isGeneric = !customerName || customerName.trim() === 'زبون عام' || customerName.trim() === 'زبون نقدي';

  return (
    <div ref={containerRef} className="relative w-56 sm:w-64 md:w-72 shrink-0">
      {/* شريط تسجيل اسم العميل المباشر (Input Bar) */}
      <div className="relative flex items-center h-10">
        <span className="absolute right-3 text-sm text-slate-400 pointer-events-none">
          👤
        </span>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onBlur={() => {
            const trimmed = inputValue.trim();
            if (trimmed && trimmed !== (customerName || '').trim()) {
              onSetNewCustomer(trimmed, customerType);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="اكتب اسم العميل أو الزبون..."
          className={`w-full h-10 bg-slate-100 hover:bg-white focus:bg-white border rounded-xl pr-9 pl-14 text-xs md:text-sm font-bold text-slate-800 placeholder-slate-400 outline-none transition-all shadow-2xs ${
            isOpen ? 'border-indigo-500 bg-white ring-2 ring-indigo-500/10' : 'border-slate-200'
          }`}
        />

        {/* أزرار الإجراءات داخل شريط التسجيل: شارة الفئة وزر الحذف */}
        <div className="absolute left-2 flex items-center gap-1">
          {!isGeneric && (
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                customerType === 'vip'
                  ? 'bg-amber-500 text-white shadow-2xs'
                  : customerType === 'client'
                  ? 'bg-indigo-600 text-white'
                  : customerType === 'offer'
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {customerType === 'vip' ? '⭐ مميز' : customerType === 'client' ? 'عميل' : customerType === 'offer' ? 'عرض' : 'زبون'}
            </span>
          )}

          {inputValue && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-rose-600 text-xs px-1 cursor-pointer font-bold transition-colors"
              title="تفريغ الاسم والرجوع لزبون عام"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* القائمة الذكية المنسدلة للعملاء المسجلين والعميل الجديد */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-80 md:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50 animate-scale-in text-right">
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {/* خيار "زبون نقدي عام" السريع */}
            <div
              onClick={handleClear}
              className="p-2.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">👥</span>
                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">
                  زبون نقدي عام (افتراضي)
                </span>
              </div>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
                مفرد
              </span>
            </div>

            {/* قائمة العملاء المطابقين للبحث */}
            {matchingCustomers.length > 0 && (
              <div>
                <div className="px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400">
                  {inputValue.trim() ? 'العملاء المسجلون المطابقون:' : 'العملاء المسجلون مسبقاً:'}
                </div>
                {matchingCustomers.map((cust) => {
                  const isVip = cust.customerType === 'vip';
                  const isClient = cust.customerType === 'client';
                  const hasDebt = Number(cust.totalDebt || 0) > 0;

                  return (
                    <div
                      key={cust.id}
                      onClick={() => handleSelectExisting(cust)}
                      className="p-2.5 hover:bg-indigo-50/70 transition-colors cursor-pointer flex items-center justify-between gap-2 group"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-xs text-slate-800 group-hover:text-indigo-600 block leading-snug break-words">
                          {cust.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                          {cust.phone1 && <span className="font-mono">{cust.phone1}</span>}
                          {hasDebt && (
                            <span className="text-rose-600 font-bold font-mono">
                              دين: {Number(cust.totalDebt).toLocaleString()} د.ع
                            </span>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                          isVip
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : isClient
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {isVip ? '⭐ عميل مميز' : isClient ? 'عميل (خاص)' : 'زبون (مفرد)'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* خيار سريع لتحديد فئة الاسم الجديد المكتوب مباشرة */}
            {inputValue.trim() && !exactMatch && (
              <div className="p-3 bg-amber-50/80 border-t border-amber-200/60">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 mb-1">
                  <span>✨</span>
                  <span>عميل جديد: <strong className="underline text-amber-950 font-black break-words">{inputValue.trim()}</strong></span>
                </div>
                <p className="text-[11px] text-amber-800/80 mb-2 font-medium leading-tight">
                  حدد فئة هذا العميل لتطبيق فئة السعر المناسبة فوراً:
                </p>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePickNewCustomer('vip')}
                    className="py-1.5 px-1.5 bg-amber-500 hover:bg-amber-600 border border-amber-600 rounded-xl text-[11px] font-bold text-white shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>⭐</span>
                    <span>مميز (VIP)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickNewCustomer('client')}
                    className="py-1.5 px-1.5 bg-indigo-600 hover:bg-indigo-700 border border-indigo-600 rounded-xl text-[11px] font-bold text-white shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>🏢</span>
                    <span>عميل (خاص)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePickNewCustomer('retail')}
                    className="py-1.5 px-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-[11px] font-bold text-slate-800 shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>👤</span>
                    <span>زبون (مفرد)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
