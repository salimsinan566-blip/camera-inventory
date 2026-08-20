import React, { useState } from 'react';
import { parseExcelFile } from '../utils/excelImport';
import { syncImportedProducts } from '../services/importService';


/**
 * نافذة استيراد ملف Excel:
 * 1) رفع الملف وتحليله محلياً (معاينة فقط، بدون أي كتابة على Firestore)
 * 2) عرض ملخص: كم منتج جديد / كم تحديث / تحذيرات (SKU مكرر، صفوف بدون SKU)
 * 3) المستخدم يختار الموقع الافتراضي للمنتجات الجديدة فقط، ثم يؤكد المزامنة
 */
export default function ImportExcel({ onClose }) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null); // { products, duplicateSkusInFile, rowsSkipped }

  const [parsing, setParsing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null); // { created, updated }
  const [error, setError] = useState('');

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    setParsed(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      const data = parseExcelFile(buffer);
      setParsed(data);
    } catch (err) {
      setError(`فشل قراءة الملف: ${err.message}`);
    } finally {
      setParsing(false);
    }
  }

  async function handleConfirmSync() {
    if (!parsed) return;
    setSyncing(true);
    setError('');
    try {
      const summary = await syncImportedProducts(parsed.products);
      setResult(summary);
    } catch (err) {
      setError(`فشلت المزامنة: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-bold text-ink-900 mb-4">استيراد منتجات من Excel</h2>

          {!result && (
            <>
              <Field label="اختر ملف Excel (.xlsx)">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="input"
                />
              </Field>

              {parsing && <p className="text-ink-500 text-sm mt-3">جارٍ تحليل الملف...</p>}

              {error && (
                <div className="bg-danger-50 border border-danger-500 text-danger-700 text-sm rounded p-3 mt-4">
                  {error}
                </div>
              )}

              {parsed && (
                <div className="mt-4 space-y-4">
                  <div className="bg-brand-50 border border-brand-100 rounded p-4 text-sm text-ink-900 space-y-1">
                    <p>📄 الملف: {fileName}</p>
                    <p>✅ عدد المنتجات الصالحة للاستيراد: {parsed.products.length}</p>
                    {parsed.rowsSkipped > 0 && (
                      <p className="text-warn-700">
                        ⚠️ تم تجاهل {parsed.rowsSkipped} صف بدون رقم SKU
                      </p>
                    )}
                    {parsed.duplicateSkusInFile.length > 0 && (
                      <p className="text-warn-700">
                        ⚠️ تم تجاهل {parsed.duplicateSkusInFile.length} صف مكرر بنفس SKU (تم
                        الاحتفاظ بأول ظهور فقط): {parsed.duplicateSkusInFile.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 text-sm text-ink-700">
                    المنتجات الجديدة تُضاف كميتها إلى <span className="font-bold">المخزن</span>،
                    وكمية المحل تبدأ صفر (تنقل منها للمحل لاحقاً حسب الحاجة).
                  </div>

                  <p className="text-xs text-ink-500">
                    ملاحظة: المنتجات الموجودة مسبقاً (بنفس SKU) يُحدَّث اسمها ونوعها وأسعارها
                    فقط — كميات المحل والمخزن ما تتغيّر، حفاظاً على بياناتك الفعلية.
                  </p>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="bg-brand-50 border border-brand-100 rounded p-4 text-sm text-ink-900 space-y-1">
              <p>✅ تمت المزامنة بنجاح</p>
              <p>منتجات جديدة أُضيفت: {result.created}</p>
              <p>منتجات موجودة تحدّثت: {result.updated}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-6 mt-2 border-t border-brand-100">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-700 hover:text-ink-900"
            >
              {result ? 'إغلاق' : 'إلغاء'}
            </button>
            {parsed && !result && (
              <button
                onClick={handleConfirmSync}
                disabled={syncing || parsed.products.length === 0}
                className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-ink-900 font-bold rounded-lg disabled:opacity-60"
              >
                {syncing ? 'جارٍ المزامنة...' : `تأكيد استيراد ${parsed.products.length} منتج`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm text-ink-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
