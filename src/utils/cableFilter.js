/**
 * أداة فحص واستثناء الكابلات (Cat6 والكوكسيل والأسلاك ومبيعات الأمتار واللفات)
 * Cable Filtering Utility for Sales & Product Analytics
 */

import { isCableProduct } from '../models/product';

/**
 * فحص ما إذا كان العنصر يمثل كيبل كات 6 (Cat6)
 * @param {string} text 
 * @returns {boolean}
 */
export function isCat6Cable(text = '') {
  if (!text) return false;
  const s = String(text).toLowerCase();
  return (
    s.includes('cat6') ||
    s.includes('cat 6') ||
    s.includes('cat-6') ||
    s.includes('cat6e') ||
    s.includes('cat 6e') ||
    s.includes('cat6a') ||
    s.includes('cat 6a') ||
    s.includes('كات 6') ||
    s.includes('كات6') ||
    s.includes('كات-6') ||
    s.includes('utp') ||
    s.includes('ftp') ||
    s.includes('sftp')
  );
}

/**
 * فحص ما إذا كان العنصر يمثل كيبل كوكسيل (Coaxial / RG59 / RG6)
 * @param {string} text 
 * @returns {boolean}
 */
export function isCoaxialCable(text = '') {
  if (!text) return false;
  const s = String(text).toLowerCase();
  return (
    s.includes('coaxial') ||
    s.includes('coax') ||
    s.includes('كوكسيل') ||
    s.includes('كواكسيل') ||
    s.includes('كواكسل') ||
    s.includes('كوكسل') ||
    s.includes('كوأكسيل') ||
    s.includes('كوكسيال') ||
    s.includes('كواكسيال') ||
    s.includes('rg59') ||
    s.includes('rg-59') ||
    s.includes('rg 59') ||
    s.includes('rg6') ||
    s.includes('rg-6') ||
    s.includes('rg 6') ||
    s.includes('سيامي')
  );
}

/**
 * يتحقق مما إذا كان الصنف كيبلاً يجب استثناؤه من قائمة القطع الأكثر مبيعاً
 * يستثني تلقائياً: كابلات Cat6، كابلات Coaxial، والكيبلات المباعة بالمتر أو اللفة
 * 
 * @param {object} item عنصر الفاتورة أو المنتج
 * @param {object|null} prodLookup بيانات المنتج من جدول المنتجات العام
 * @returns {boolean} true إذا كان كيبل يجب استثناؤه
 */
export function isExcludedCable(item = {}, prodLookup = null) {
  if (!item && !prodLookup) return false;

  // 1. فحص نمط البيع (أمتار أو لفات)
  if (item?.sellMode === 'meter' || item?.sellMode === 'roll') return true;
  if (prodLookup?.sellMode === 'meter' || prodLookup?.sellMode === 'roll') return true;

  // 2. فحص نموذج المنتج الأصلي
  if (isCableProduct(item) || isCableProduct(prodLookup)) return true;

  // 3. تجميع النصوص (الاسم، الرمز، التصنيف، الفئة)
  const fullText = [
    item?.name,
    item?.sku,
    item?.category,
    item?.cameraType,
    item?.type,
    prodLookup?.name,
    prodLookup?.sku,
    prodLookup?.category,
    prodLookup?.cameraType,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  // فحص صريح للـ Cat6 والـ Coaxial
  if (isCat6Cable(fullText) || isCoaxialCable(fullText)) {
    return true;
  }

  // فحص الكلمات الدلالية العامة للكابلات والأسلاك
  if (
    fullText.includes('كيبل') ||
    fullText.includes('كبل') ||
    fullText.includes('سلك') ||
    fullText.includes('cable') ||
    fullText.includes('cables') ||
    fullText.includes('wire') ||
    fullText.includes('لفه كبل') ||
    fullText.includes('لفة كيبل')
  ) {
    return true;
  }

  return false;
}
