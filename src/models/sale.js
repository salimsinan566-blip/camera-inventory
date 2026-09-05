/**
 * ==========================================================
 * Schema الفاتورة/عملية البيع — Firestore collection: "sales"
 * ==========================================================
 *
 * كل عملية بيع تُنشئ مستنداً واحداً هنا. المستند يمر بحالتين:
 *
 * - status: "draft" (مؤقتة) — لسا ما أثّرت على المخزون، ولا أخذت
 *   رقم فاتورة رسمي. تقدر تعدّلها أو تحذفها براحتك.
 * - status: "confirmed" (مؤكدة) — بهذي اللحظة فقط تنقص الكمية من
 *   "products" ويتولّد رقم الفاتورة، داخل Firestore Transaction
 *   واحدة (نفس مبدأ الأمان: تحقق من توفر الكمية قبل أي خصم).
 *
 * الحقول:
 * ----------------------------------------------------------
 * status        : 'draft' | 'confirmed'
 * invoiceNumber : number|undefined - يظهر فقط بعد التأكيد
 * items         : Array<{ productId, sku, name, quantity, unitPrice, lineTotal }>
 * subtotal      : number   - مجموع كل بنود الفاتورة قبل أي خصم أو ضريبة
 * discount      : number   - قيمة خصم ثابتة تُطرح من subtotal (افتراضي 0)
 * taxRate       : number   - نسبة ضريبة % تُضاف بعد الخصم (افتراضي 0)
 * total         : number   - المجموع النهائي = (subtotal - discount) × (1 + taxRate/100)
 * customerId    : string|null - معرّف العميل (لو موجود بقائمة customers)
 * customerName  : string|null - اسم العميل كما أُدخل (حتى لو عميل جديد)
 * cashierEmail  : string   - إيميل المستخدم اللي سجّل البيع
 * createdAt     : Timestamp
 * updatedAt     : Timestamp - آخر تعديل على فاتورة مؤقتة
 * confirmedAt   : Timestamp - وقت التأكيد (لو مؤكدة)
 * ----------------------------------------------------------
 */

/** يبني عنصر سلة جديد من منتج تم مسحه بالباركود أو مختار من الشبكة */
export function createCartItem(product, quantity = 1, options = {}) {
  const source = options.source || (product.isCustodyItem ? 'custody' : (product.isWarehouseStock ? 'warehouse' : 'store'));
  const technicianId = options.technicianId || (source === 'custody' ? product.technicianId || null : null);
  const technicianName = options.technicianName || (source === 'custody' ? product.technicianName || '' : '');
  const cartItemId = options.cartItemId || `${product.id}_${source}_${technicianId || ''}`;

  return {
    cartItemId,
    productId: product.id,
    sku: product.sku || '',
    name: product.name || '',
    cameraType: product.cameraType || '',
    quantity: Math.max(1, Number(quantity) || 1),
    unitPrice: Number(product.retailPrice) || 0,
    originalPrice: Number(product.retailPrice) || 0,
    wholesalePrice: Number(product.wholesalePrice) || 0,
    availableQuantity: Number(product.storeQty) || 0,
    sellMode: product.sellMode || 'unit',
    isService: false,
    source, // 'store' | 'warehouse' | 'custody'
    technicianId,
    technicianName,
    isCustody: source === 'custody'
  };
}

/** يبني عنصر سلة جديد من خدمة / أجور عمل */
export function createLaborCartItem(labor) {
  return {
    cartItemId: `labor_${labor.id}`,
    productId: `labor_${labor.id}`,
    sku: '-',
    name: labor.name,
    quantity: 1,
    unitPrice: Number(labor.price) || 0,
    originalPrice: Number(labor.price) || 0,
    wholesalePrice: 0,
    availableQuantity: 999999, // خدمات غير محدودة
    sellMode: 'unit',
    isService: true,
    source: 'service',
    technicianId: null,
    technicianName: '',
    isCustody: false
  };
}

/** يحوّل عناصر فاتورة مؤقتة محفوظة إلى شكل سلة قابل للتعديل بشاشة نقطة البيع */
export function cartItemsFromDraft(draftItems, productsList = []) {
  return (draftItems || []).map((item) => {
    let ws = item.wholesalePrice;
    if ((ws === undefined || ws === null || ws === 0) && productsList.length > 0) {
      const prod = productsList.find(p => p.id === item.productId || p.sku === item.sku);
      if (prod) ws = Number(prod.wholesalePrice) || 0;
    }
    const source = item.source || (item.isCustody ? 'custody' : 'store');
    const technicianId = item.technicianId || null;
    const technicianName = item.technicianName || '';
    const cartItemId = item.cartItemId || `${item.productId}_${source}_${technicianId || ''}`;

    return {
      cartItemId,
      productId: item.productId,
      sku: item.sku || '',
      name: item.name || '',
      cameraType: item.cameraType || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      originalPrice: item.originalPrice || item.unitPrice,
      wholesalePrice: ws || 0,
      sellMode: item.sellMode || 'unit',
      isService: item.isService || false,
      source,
      technicianId,
      technicianName,
      isCustody: source === 'custody'
    };
  });
}

/** يحسب المجموع الفرعي لسلة البيع الحالية (قبل الخصم والضريبة) */
export function calculateCartTotal(cartItems) {
  return cartItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

/**
 * يحسب ملخص الطلب الكامل: المجموع الفرعي، بعد الخصم، الضريبة، والمجموع النهائي.
 * discount: قيمة ثابتة تُطرح من subtotal. taxRate: نسبة % تُضاف بعد الخصم.
 */
export function calculateOrderSummary(cartItems, discount = 0, taxRate = 0) {
  const subtotal = calculateCartTotal(cartItems);
  const safeDiscount = Math.min(Number(discount) || 0, subtotal); // الخصم ما يتجاوز المجموع
  const afterDiscount = subtotal - safeDiscount;
  const taxAmount = afterDiscount * ((Number(taxRate) || 0) / 100);
  const total = afterDiscount + taxAmount;
  return { subtotal, discount: safeDiscount, taxRate: Number(taxRate) || 0, taxAmount, total };
}
