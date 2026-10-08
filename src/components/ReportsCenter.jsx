import React, { useState, useEffect } from 'react';
import SuppliersReportsTab from './reports/SuppliersReportsTab';
import InventoryReportsTab from './reports/InventoryReportsTab';
import CustomersReportsTab from './reports/CustomersReportsTab';
import { useSettings } from '../hooks/useSettings';
import { getDisplayName } from '../utils/userUtils';

const REPORT_DEPARTMENTS = [
  { 
    id: 'suppliers', 
    code: 'SEC-PUR-01',
    label: 'تقارير الموردين والمشتريات', 
    isReady: true, 
    countText: '4 كشوفات معتمدة',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  { 
    id: 'sales', 
    code: 'SEC-SAL-01',
    label: 'تقارير المبيعات والأرباح', 
    isReady: false, 
    countText: 'قيد الإعداد',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  { 
    id: 'inventory', 
    code: 'SEC-INV-01',
    label: 'المخزون', 
    isReady: true, 
    countText: 'تقريران معتمدان',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  { 
    id: 'customers', 
    code: 'SEC-CUS-01',
    label: 'قسم الزبائن والعملاء', 
    isReady: true, 
    countText: '5 كشوفات معتمدة',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  { 
    id: 'expenses', 
    code: 'SEC-EXP-01',
    label: 'تقارير المصاريف والمالية', 
    isReady: false, 
    countText: 'قيد الإعداد',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
];

export default function ReportsCenter({ user, onNavigate, onUpdateNav }) {
  const { settings } = useSettings();
  const userName = getDisplayName(user);
  
  // Department selected: null (shows main department cards) | 'suppliers' | 'inventory' | 'customers'
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  // Report selected inside the active department
  const [selectedReport, setSelectedReport] = useState(null);
  // Metadata for the active report: { code, title, onPrint }
  const [reportMeta, setReportMeta] = useState(null);

  const currentDepartment = REPORT_DEPARTMENTS.find(d => d.id === selectedDepartment);

  // زر رجوع أساسي موحد: يرجع خطوة واحدة بالضبط في كل نقرة
  const handleSingleBack = () => {
    if (selectedReport) {
      setSelectedReport(null);
      setReportMeta(null);
    } else if (selectedDepartment) {
      setSelectedDepartment(null);
      setSelectedReport(null);
      setReportMeta(null);
    }
  };

  const handleSelectDept = (deptId) => {
    setSelectedDepartment(deptId);
    setSelectedReport(null);
    setReportMeta(null);
  };

  // المزامنة الفورية لحالة الرأس وزر الرجوع المعتمد مع الشريط العلوي العام TopNav
  useEffect(() => {
    if (!onUpdateNav) return;

    if (selectedReport && reportMeta) {
      onUpdateNav({
        title: reportMeta.title || 'كشف تفصيلي',
        code: reportMeta.code || null,
        onPrint: reportMeta.onPrint || null,
        canGoBack: true,
        onBack: handleSingleBack,
      });
    } else if (selectedDepartment && currentDepartment) {
      onUpdateNav({
        title: currentDepartment.label,
        code: currentDepartment.code,
        onPrint: null,
        canGoBack: true,
        onBack: handleSingleBack,
      });
    } else {
      onUpdateNav({
        title: 'التقارير',
        code: null,
        onPrint: null,
        canGoBack: false,
        onBack: null,
      });
    }
  }, [selectedDepartment, selectedReport, reportMeta, currentDepartment, onUpdateNav]);

  return (
    <div className="min-h-full bg-slate-50 flex flex-col p-1 sm:p-2 select-none" dir="rtl">
      <div className="max-w-7xl w-full mx-auto space-y-3">
        {/* 1. المستوى الأول: عرض كارتات الأقسام الرئيسية مباشرة في أعلى الصفحة */}
        {!selectedDepartment && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 animate-fade-in">
            {REPORT_DEPARTMENTS.map((dept) => (
              <div
                key={dept.id}
                onClick={() => {
                  if (dept.isReady) {
                    handleSelectDept(dept.id);
                  }
                }}
                className={`group bg-white rounded-2xl border-2 p-5 transition-all duration-200 flex flex-col justify-between gap-4 select-none relative overflow-hidden ${
                  dept.isReady
                    ? 'border-slate-300 hover:border-slate-900 shadow-2xs hover:shadow-md cursor-pointer active:scale-[0.99]'
                    : 'border-slate-200 opacity-60 bg-slate-50/60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-colors shadow-2xs ${
                    dept.isReady
                      ? 'bg-slate-100 text-slate-800 border-slate-300 group-hover:bg-slate-900 group-hover:text-white'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    {dept.icon}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                      {dept.code}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                      dept.isReady 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {dept.countText}
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className={`text-base font-black transition-colors ${
                    dept.isReady ? 'text-slate-900 group-hover:text-indigo-900' : 'text-slate-500'
                  }`}>
                    {dept.label}
                  </h3>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-black">
                  {dept.isReady ? (
                    <>
                      <span className="text-slate-700 group-hover:text-slate-900 font-bold">
                        فتح القسم
                      </span>
                      <span className="text-slate-900 group-hover:translate-x-[-4px] transition-transform">
                        ➔
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400 font-medium">
                      قيد التطوير
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. المستوى الثاني: فتح كشوفات وخيارات الموردين */}
        {selectedDepartment === 'suppliers' && (
          <SuppliersReportsTab 
            storeSettings={settings} 
            userName={userName}
            selectedReport={selectedReport}
            onSelectReport={setSelectedReport}
            setReportMeta={setReportMeta}
            onBackToDepartments={handleSingleBack}
          />
        )}

        {/* 3. المستوى الثاني: فتح كشوفات وخيارات المخزون */}
        {selectedDepartment === 'inventory' && (
          <InventoryReportsTab 
            storeSettings={settings} 
            userName={userName}
            selectedReport={selectedReport}
            onSelectReport={setSelectedReport}
            setReportMeta={setReportMeta}
            onBackToDepartments={handleSingleBack}
          />
        )}

        {/* 4. المستوى الثاني: فتح كشوفات وخيارات الزبائن */}
        {selectedDepartment === 'customers' && (
          <CustomersReportsTab 
            storeSettings={settings} 
            userName={userName}
            selectedReport={selectedReport}
            onSelectReport={setSelectedReport}
            setReportMeta={setReportMeta}
            onBackToDepartments={handleSingleBack}
          />
        )}
      </div>
    </div>
  );
}
