/**
 * إعدادات ومصفوفة أقسام النظام المركزية
 * Central Navigation Configuration
 * 
 * لإضافة أي قسم جديد للنظام، يكفي إضافة كائن جديد إلى مصفوفة NAVIGATION_SECTIONS
 */

export const NAVIGATION_SECTIONS = [
  {
    id: 'dashboard',
    label: 'لوحة القيادة',
    description: 'مؤشرات النشاط اليومي، النقد، وتدفق الصندوق',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    category: 'core',
    color: 'indigo',
  },
  {
    id: 'pos',
    label: 'نقطة البيع',
    description: 'إصدار الفواتير الفورية وإدارة سلة المبيعات',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
    category: 'sales',
    color: 'emerald',
  },
  {
    id: 'purchases',
    label: 'المشتريات والموردين',
    description: 'فواتير الموردين ومتابعة الديون والدفعات',
    icon: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z',
    category: 'finance',
    color: 'blue',
  },
  {
    id: 'inventory',
    label: 'إدارة المخزون',
    description: 'جرد المواد، الباركودات، وحركات المنتجات',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    category: 'inventory',
    color: 'violet',
  },
  {
    id: 'sales_archive',
    label: 'فواتير المبيعات',
    description: 'كشوفات المبيعات وسجل الفواتير والأرباح',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    category: 'sales',
    color: 'teal',
  },
  {
    id: 'reports',
    label: 'التقارير',
    description: 'استخراج وتصدير تقارير PDF لكافة أقسام النظام',
    icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    category: 'reports',
    color: 'cyan',
  },
  {
    id: 'expenses',
    label: 'المصاريف التشغيلية',
    description: 'تسجيل النفقات اليومية ومصاريف المكتب',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    category: 'finance',
    color: 'rose',
  },
  {
    id: 'offers',
    label: 'عروض الأسعار',
    description: 'إنشاء عروض الأسعار ومتابعتها وطباعتها',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    category: 'sales',
    color: 'orange',
  },
  {
    id: 'customers',
    label: 'دليل العملاء',
    description: 'بيانات العملاء وأرصدة الديون وكشوفات الحساب',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    category: 'sales',
    color: 'sky',
  },
];

export const SYSTEM_UTILITY_SECTIONS = [
  {
    id: 'trash',
    label: 'سلة المحذوفات',
    description: 'استرجاع الفواتير والمواد المحذوفة',
    icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    category: 'system',
    color: 'red',
    badgeKey: 'trashCount',
  },
  {
    id: 'settings',
    label: 'الإعدادات والنسخ',
    description: 'إعدادات المتجر، السيرفر، والنسخ الاحتياطي',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    category: 'system',
    color: 'slate',
  },
];

export const ALL_NAVIGATION_SECTIONS = [...NAVIGATION_SECTIONS, ...SYSTEM_UTILITY_SECTIONS];
