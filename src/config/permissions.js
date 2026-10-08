/**
 * إعدادات وصلاحيات الموظفين المركزية
 * Employee Permissions & Roles Configuration
 */

export const ROLE_PRESETS = {
  admin: {
    id: 'admin',
    name: 'مدير عام (مسؤول كامل)',
    icon: '👑',
    color: 'amber',
    desc: 'صلاحيات كاملة لجميع شاشات وأقسام النظام والعمليات الحساسة وإلغاء وتعديل الفواتير والأسعار.',
    allowedSections: {
      dashboard: true,
      pos: true,
      purchases: true,
      inventory: true,
      reports: true,
      expenses: true,
      offers: true,
      customers: true,
      settings: true,
      trash: true,
    },
    advanced: {
      canViewCosts: true,
      canEditPrices: true,
      canDeleteSales: true,
    }
  },
  cashier: {
    id: 'cashier',
    name: 'كاشير / مبيعات',
    icon: '🛒',
    color: 'emerald',
    desc: 'نقطة البيع + عروض الأسعار + دليل العملاء فقط. حظر رؤية رأس المال والتكاليف والمشتريات والمصاريف والإعدادات.',
    allowedSections: {
      dashboard: false,
      pos: true,
      purchases: false,
      inventory: false,
      reports: false,
      expenses: false,
      offers: true,
      customers: true,
      settings: false,
      trash: false,
    },
    advanced: {
      canViewCosts: false,
      canEditPrices: false,
      canDeleteSales: false,
    }
  },
  inventory: {
    id: 'inventory',
    name: 'أمين مخزن وتوريد',
    icon: '📦',
    color: 'violet',
    desc: 'إدارة المخزون + المشتريات والموردين + عروض الأسعار. حظر كشوفات الأرباح والتقارير المالية والمصاريف.',
    allowedSections: {
      dashboard: false,
      pos: false,
      purchases: true,
      inventory: true,
      reports: false,
      expenses: false,
      offers: true,
      customers: false,
      settings: false,
      trash: false,
    },
    advanced: {
      canViewCosts: true,
      canEditPrices: false,
      canDeleteSales: false,
    }
  },
  accountant: {
    id: 'accountant',
    name: 'محاسب مالي',
    icon: '💼',
    color: 'blue',
    desc: 'لوحة القيادة + نقطة البيع + المشتريات + الفواتير والتقارير + المصاريف + العملاء. حظر إعدادات النظام.',
    allowedSections: {
      dashboard: true,
      pos: true,
      purchases: true,
      inventory: false,
      reports: true,
      expenses: true,
      offers: true,
      customers: true,
      settings: false,
      trash: false,
    },
    advanced: {
      canViewCosts: true,
      canEditPrices: true,
      canDeleteSales: false,
    }
  },
  custom: {
    id: 'custom',
    name: 'تخصيص يدوي',
    icon: '⚙️',
    color: 'slate',
    desc: 'تحديد مخصص للأقسام والصلاحيات بشكل يدوي لكل موظف وفق حاجة العمل.',
  }
};

export const SYSTEM_SECTIONS_META = [
  { id: 'dashboard', label: 'لوحة القيادة', icon: '📊', desc: 'مؤشرات النشاط اليومي والنقد وتدفق الصندوق' },
  { id: 'pos', label: 'نقطة البيع (POS)', icon: '🛒', desc: 'إصدار الفواتير الفورية وسلة المبيعات' },
  { id: 'purchases', label: 'المشتريات والموردين', icon: '🏢', desc: 'فواتير الموردين ومتابعة الديون والدفعات' },
  { id: 'inventory', label: 'إدارة المخزون', icon: '📦', desc: 'جرد المواد، الباركودات، وحركات المنتجات' },
  { id: 'reports', label: 'الفواتير والتقارير', icon: '📑', desc: 'كشوفات المبيعات والأرباح والتحليلات' },
  { id: 'expenses', label: 'المصاريف التشغيلية', icon: '💸', desc: 'تسجيل النفقات اليومية ومصاريف المكتب' },
  { id: 'offers', label: 'عروض الأسعار', icon: '🏷️', desc: 'إنشاء عروض الأسعار ومتابعتها وطباعتها' },
  { id: 'customers', label: 'دليل العملاء', icon: '👥', desc: 'بيانات العملاء وأرصدة الديون وكشوفات الحساب' },
  { id: 'settings', label: 'الإعدادات والنسخ السحابي', icon: '⚙️', desc: 'إعدادات المتجر والسيرفر وإدارة الموظفين' },
  { id: 'trash', label: 'سلة المحذوفات', icon: '🗑️', desc: 'استرجاع الفواتير والمواد المحذوفة' },
];

export const ADVANCED_PERMISSIONS_META = [
  {
    id: 'canViewCosts',
    label: 'رؤية أسعار التكلفة والأرباح',
    desc: 'السماح برؤية سعر الشراء/التكلفة، أرباح الفواتير، وتقارير رأس المال.',
    icon: '👁️',
  },
  {
    id: 'canEditPrices',
    label: 'تعديل الأسعار يدويًا عند البيع',
    desc: 'إمكانية تغيير سعر المادة أو تخفيضه في سلة نقطة البيع (POS).',
    icon: '✏️',
  },
  {
    id: 'canDeleteSales',
    label: 'حذف وتعديل الفواتير المحفوظة',
    desc: 'السماح بإلغاء أو حذف الفواتير ومسودات البيع السابقة.',
    icon: '🗑️',
  },
];
