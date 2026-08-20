/**
 * ==========================================================
 * Schema المنتج — Firestore collection: "products"
 * ==========================================================
 *
 * مخزون مدمج: كل منتج مستند واحد، و SKU فريد بالكامل. لكل منتج
 * كميتان منفصلتان: المحل والمخزن، والمجموع يُحسب منهما تلقائياً.
 * ولكل موقع حدّه الأدنى المستقل للتنبيه.
 *
 * الحقول:
 * ----------------------------------------------------------
 * name          : string   - اسم المنتج (مطلوب)
 * sku           : string   - رقم تعريفي فريد للمنتج (مطلوب، مفتاح المطابقة)
 * cameraType    : string   - نوع المنتج (انظر CATEGORIES)
 * model         : string   - الموديل
 * storeQty         : number - كمية المحل (>= 0)
 * warehouseQty     : number - كمية المخزن (>= 0)
 * storeMinThreshold     : number - الحد الأدنى للمحل (افتراضي 5)
 * warehouseMinThreshold : number - الحد الأدنى للمخزن (افتراضي 5)
 * wholesalePrice: number   - سعر الجملة/التكلفة (>= 0)
 * profitMargin  : number   - نسبة الربح % (تُستخدم لحساب سعر المفرد تلقائياً)
 * retailPrice   : number   - سعر المفرد/البيع (>= 0)
 * imageUrl      : string|null - رابط صورة اختياري
 * barcode       : string|null - رقم باركود منفصل
 * createdAt     : Timestamp
 * updatedAt     : Timestamp
 * ----------------------------------------------------------
 * ملاحظة توافق: المنتجات القديمة كان عندها quantity + location +
 * minThreshold. دالة normalizeProduct() تحوّلها تلقائياً للبنية
 * الجديدة عند القراءة، حتى ما تنكسر البيانات الموجودة.
 */

export const LOCATIONS = {
  STORE: 'store', // المحل
  WAREHOUSE: 'warehouse', // المخزن
};

export const LOCATION_LABELS_AR = {
  [LOCATIONS.STORE]: 'المحل',
  [LOCATIONS.WAREHOUSE]: 'المخزن',
};

// نوع المنتج = أسماء أوراق ملف Excel حرفياً (18 ورقة كما هي بالملف)
export const CATEGORIES = [
  'IP Cameras',
  'Analog AHD & AOC Hybrid Cameras',
  'Car Cameras',
  'NVR Devices',
  'DVR Devices',
  'PoE Switches',
  'PoE Extenders',
  'Power Adapters',
  'UPS & Backup Power',
  'Audio Systems',
  'Video Intercom',
  'Networking Equipment',
  'Cables & Connectors',
  'Video Accessories',
  'Computer Accessories',
  'RAND',
  'Walkie Talkie',
  'BOX',
  'أخرى',
];

// اسم قديم محتفَظ به للتوافق مع أي كود سابق يشير له
export const CAMERA_TYPES = CATEGORIES;

export const STOCK_STATUS = {
  IN_STOCK: 'in_stock', // متوفر
  LOW_STOCK: 'low_stock', // منخفض
  OUT_OF_STOCK: 'out_of_stock', // نافذ
};

export const DEFAULT_MIN_THRESHOLD = 5;

/** يحسب سعر المفرد من سعر الجملة ونسبة الربح % */
export function calculateRetailPrice(wholesalePrice, profitMargin) {
  const wp = Number(wholesalePrice) || 0;
  const margin = Number(profitMargin) || 0;
  return Math.round((wp * (1 + margin / 100)) * 100) / 100;
}

/**
 * يوحّد شكل المنتج القادم من Firestore للبنية الجديدة.
 * لو المنتج قديم (فيه quantity/location بدل storeQty/warehouseQty)،
 * يحوّله: الكمية القديمة تُنسب لموقعها الأصلي، والموقع الآخر = 0.
 */
export function normalizeProduct(raw) {
  const p = { ...raw };
  const hasNewFields = p.storeQty !== undefined || p.warehouseQty !== undefined;

  if (!hasNewFields) {
    const oldQty = Number(p.quantity) || 0;
    const oldThreshold = Number(p.minThreshold) || DEFAULT_MIN_THRESHOLD;
    if (p.location === LOCATIONS.WAREHOUSE) {
      p.storeQty = 0;
      p.warehouseQty = oldQty;
    } else {
      p.storeQty = oldQty;
      p.warehouseQty = 0;
    }
    p.storeMinThreshold = oldThreshold;
    p.warehouseMinThreshold = oldThreshold;
  } else {
    p.storeQty = Number(p.storeQty) || 0;
    p.warehouseQty = Number(p.warehouseQty) || 0;
    p.storeMinThreshold =
      p.storeMinThreshold !== undefined ? Number(p.storeMinThreshold) : DEFAULT_MIN_THRESHOLD;
    p.warehouseMinThreshold =
      p.warehouseMinThreshold !== undefined
        ? Number(p.warehouseMinThreshold)
        : DEFAULT_MIN_THRESHOLD;
  }
  p.company = p.company || '';
  if (p.customOrder !== undefined && p.customOrder !== null) {
    p.customOrder = Number(p.customOrder);
  }
  return p;
}

/** المجموع الكلي لكميات منتج (محل + مخزن) */
export function getTotalQuantity(product) {
  return (Number(product.storeQty) || 0) + (Number(product.warehouseQty) || 0);
}

/** يبني كائن منتج افتراضي فارغ (لاستخدامه في نموذج الإضافة) */
export function createEmptyProduct() {
  return {
    name: '',
    sku: '',
    cameraType: CATEGORIES[0],
    model: '',
    company: '',
    sellMode: 'unit', // unit, meter, roll
    metersPerRoll: 305, // افتراضي لطول لفة الكيبل
    storeQty: 0,
    warehouseQty: 0,
    storeMinThreshold: DEFAULT_MIN_THRESHOLD,
    warehouseMinThreshold: DEFAULT_MIN_THRESHOLD,
    wholesalePrice: 0,
    profitMargin: 0,
    retailPrice: 0,
    imageUrl: null,
    barcode: null,
  };
}

/**
 * حالة المخزون لكمية واحدة مقابل حدّها الأدنى.
 * - نافذ: 0
 * - منخفض: > 0 و <= الحد الأدنى
 * - متوفر: غير ذلك
 */
function statusForQty(qty, threshold) {
  const q = Number(qty) || 0;
  const t = Number(threshold) || DEFAULT_MIN_THRESHOLD;
  if (q <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (q <= t) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}

/** حالة مخزون المحل */
export function getStoreStatus(product) {
  return statusForQty(product.storeQty, product.storeMinThreshold);
}

/** حالة مخزون المخزن */
export function getWarehouseStatus(product) {
  return statusForQty(product.warehouseQty, product.warehouseMinThreshold);
}

/**
 * الحالة الإجمالية للمنتج (الأسوأ بين الموقعين) — تُستخدم للفلترة
 * والتنبيهات العامة. لو أي موقع نافذ نعتبره يحتاج انتباه.
 */
export function getStockStatus(product) {
  const total = getTotalQuantity(product);
  if (total <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  
  const totalThreshold = (Number(product.storeMinThreshold) || 0) + (Number(product.warehouseMinThreshold) || 0);
  if (total <= totalThreshold && totalThreshold > 0) return STOCK_STATUS.LOW_STOCK;
  
  return STOCK_STATUS.IN_STOCK;
}

/**
 * تحقق أساسي من صحة بيانات المنتج قبل الحفظ في Firestore.
 * يرجع مصفوفة برسائل الأخطاء (فارغة = البيانات صحيحة).
 */
export function validateProduct(product) {
  const errors = [];
  if (!product.name || !product.name.trim()) {
    errors.push('اسم المنتج مطلوب');
  }
  if (!product.sku || !product.sku.trim()) {
    errors.push('رقم SKU مطلوب');
  }
  if (product.storeQty === '' || product.storeQty === null || Number(product.storeQty) < 0) {
    errors.push('كمية المحل يجب أن تكون رقماً صحيحاً >= 0');
  }
  if (
    product.warehouseQty === '' ||
    product.warehouseQty === null ||
    Number(product.warehouseQty) < 0
  ) {
    errors.push('كمية المخزن يجب أن تكون رقماً صحيحاً >= 0');
  }
  if (
    product.wholesalePrice === '' ||
    product.wholesalePrice === null ||
    Number(product.wholesalePrice) < 0
  ) {
    errors.push('سعر الجملة يجب أن يكون رقماً >= 0');
  }
  if (
    product.retailPrice === '' ||
    product.retailPrice === null ||
    Number(product.retailPrice) < 0
  ) {
    errors.push('سعر المفرد يجب أن يكون رقماً >= 0');
  }
  return errors;
}

/**
 * تنسيق عرض كمية المنتج حسب وضع البيع (قطع / لفات / أمتار)
 */
export function formatProductQty(product, qty) {
  const q = Number(qty) || 0;
  if (product?.sellMode === 'roll') {
    return `${q} لفة`;
  }
  if (product?.sellMode === 'meter') {
    return `${q} متر`;
  }
  return `${q} قطعة`;
}

