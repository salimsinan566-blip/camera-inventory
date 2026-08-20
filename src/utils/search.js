// بحث ذكي بسيط: يقسم كلمات البحث إلى أجزاء، ويطابق أي منتج تحتوي بياناته
// (الاسم، SKU، الموديل، نوع المنتج، الباركود) على كل الأجزاء — بأي ترتيب،
// بدون حساسية لحالة الأحرف. مثال: "لونجسي 5mp" يطابق منتج LONGSE فيه "5MP"
// حتى لو مو بنفس ترتيب الكتابة بالاسم.

function normalize(value) {
  return String(value || '').toLowerCase();
}

export function searchProducts(products, searchTerm) {
  const term = normalize(searchTerm).trim();
  if (!term) return products;

  const tokens = term.split(/\s+/).filter(Boolean);

  return products.filter((product) => {
    const haystack = normalize(
      `${product.name} ${product.sku} ${product.model} ${product.cameraType} ${product.barcode || ''}`
    );
    return tokens.every((token) => haystack.includes(token));
  });
}
