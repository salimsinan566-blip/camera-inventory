import React, { useState, useRef } from 'react';
import { compressImageToSafeDataUrl } from '../../services/storageService';

function formatIQD(num) {
  return Number(Math.round(num || 0)).toLocaleString('en-US');
}

/** Check if attachment is a PDF */
function isPdfAttachment(url, fileType) {
  if (fileType === 'pdf') return true;
  if (!url) return false;
  return url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf');
}

export default function OpeningDebtModal({
  isOpen,
  onClose,
  knownSuppliers = [],
  onSubmitOpeningDebt,
  submitting = false,
  onViewAttachment,
}) {
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [debtAmount, setDebtAmount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [fileName, setFileName] = useState('');
  const [imagePreview, setImagePreview] = useState(null);

  const [compressingFile, setCompressingFile] = useState(false);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  if (!isOpen) return null;

  const filteredSuppliers = !supplierName.trim()
    ? knownSuppliers
    : knownSuppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(supplierName.toLowerCase().trim()) ||
          (s.phone && s.phone.includes(supplierName.trim()))
      );

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      if (file.size > 700 * 1024) {
        alert('⚠️ حجم ملف الـ PDF كبير جداً (أكثر من 700 كيلوبايت) ويتجاوز حد التخزين المسموح به في قاعدة البيانات (1 ميجابايت).\n\nيرجى تصوير الفاتورة أو المستند كصورة، أو استخدام ملف PDF أصغر حجماً.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64Result = reader.result;
        setImageUrl(base64Result);
        setImagePreview(base64Result);
        setFileType('pdf');
        setFileName(file.name);
      };
    } else {
      try {
        setCompressingFile(true);
        const compressedBase64 = await compressImageToSafeDataUrl(file);
        setImageUrl(compressedBase64);
        setImagePreview(compressedBase64);
        setFileType('image');
        setFileName(file.name);
      } catch (err) {
        console.error(err);
        alert('فشل ضغط الصورة: ' + (err?.message || 'حدث خطأ أثناء معالجة الصورة'));
      } finally {
        setCompressingFile(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const numDebt = Number(debtAmount);
    if (!supplierName.trim() || !numDebt || numDebt <= 0) return;

    const numPaid = paidAmount ? Number(paidAmount) : 0;
    if (numPaid < 0 || numPaid > numDebt) return;

    let safeAttachmentUrl = imageUrl;
    if (safeAttachmentUrl && typeof safeAttachmentUrl === 'string') {
      if (safeAttachmentUrl.startsWith('data:image/') && safeAttachmentUrl.length > 650000) {
        safeAttachmentUrl = await compressImageToSafeDataUrl(safeAttachmentUrl);
      } else if (safeAttachmentUrl.startsWith('data:application/pdf') && safeAttachmentUrl.length > 1000000) {
        alert('⚠️ ملف الـ PDF المرفق كبير جداً ويتجاوز سعة التخزين (1 ميجابايت).');
        return;
      }
    }

    onSubmitOpeningDebt({
      supplierName: supplierName.trim(),
      supplierPhone: supplierPhone.trim(),
      debtAmount: numDebt,
      paidAmount: numPaid,
      invoiceNumber: invoiceNumber.trim(),
      notes: notes.trim(),
      date: date ? new Date(date).toISOString() : new Date().toISOString(),
      invoiceImageUrl: safeAttachmentUrl,
      invoiceFileType: fileType,
      invoiceFileName: fileName,
    });
  };

  const netRemaining = Math.max(0, (Number(debtAmount) || 0) - (Number(paidAmount) || 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header - رسمي ومختصر */}
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-black">تسجيل رصيد افتتاحي (دين سابق)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto max-h-[75vh] text-xs">
          {/* Supplier Autocomplete */}
          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700">
                اسم المورد / الشركة الدائنة *
              </label>
              {knownSuppliers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                  className="text-[10px] text-slate-500 hover:text-slate-900 font-bold underline cursor-pointer"
                >
                  {showSupplierDropdown ? 'إغلاق ✕' : `الموردون المسجلون (${knownSuppliers.length}) ▼`}
                </button>
              )}
            </div>

            <input
              type="text"
              required
              value={supplierName}
              onFocus={() => setShowSupplierDropdown(true)}
              onChange={(e) => {
                setSupplierName(e.target.value);
                setShowSupplierDropdown(true);
              }}
              placeholder="مثال: شركة الرواد، داهوا العراق..."
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />

            {showSupplierDropdown && filteredSuppliers.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-44 overflow-y-auto z-30 divide-y divide-slate-100">
                {filteredSuppliers.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setSupplierName(s.name);
                      if (s.phone) setSupplierPhone(s.phone);
                      setShowSupplierDropdown(false);
                    }}
                    className="p-2.5 flex items-center justify-between hover:bg-amber-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span>🏢</span>
                      <span className="text-xs font-bold text-slate-800">{s.name}</span>
                      {s.phone && (
                        <span className="text-[11px] text-slate-400 font-mono" dir="ltr">
                          ({s.phone})
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                      اختيار
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رقم الهاتف (اختياري)
            </label>
            <input
              type="text"
              value={supplierPhone}
              onChange={(e) => setSupplierPhone(e.target.value)}
              placeholder="0770XXXXXXX"
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              dir="ltr"
            />
          </div>

          {/* Debt & Paid Amounts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-amber-50/60 rounded-xl border border-amber-200">
            <div>
              <label className="block text-xs font-black text-rose-900 mb-1">
                إجمالي الدين السابق (د.ع) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  min="1"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  placeholder="500000"
                  className="w-full p-2.5 bg-white border border-rose-300 rounded-xl text-sm font-black font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">د.ع</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المسدد منه سابقاً (د.ع)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max={debtAmount || undefined}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">د.ع</span>
              </div>
            </div>

            {Number(debtAmount) > 0 && (
              <div className="sm:col-span-2 pt-2 border-t border-amber-200/60 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">صافي الدين المستحق المتبقي:</span>
                <span className="font-black font-mono text-rose-700 text-sm">
                  {formatIQD(netRemaining)} د.ع
                </span>
              </div>
            )}
          </div>

          {/* Reference & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الوصل أو المرجع (اختياري)
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="وصل قديم / دفتر #4"
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الدين</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              ملاحظات وتفاصيل الدين (اختياري)
            </label>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثال: حساب بضاعة سابقة قبل النظام تم الاتفاق على السداد..."
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {/* Attachment */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              مرفق كشف الحساب أو الوصل القديم (صورة أو PDF)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*,application/pdf,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>📁</span>
                <span>{imagePreview ? 'تغيير الملف' : 'رفع ملف / صورة'}</span>
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>📷</span>
                <span>تصوير</span>
              </button>

              {imagePreview && (
                <div className="flex items-center gap-2 mr-auto bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                  {isPdfAttachment(imageUrl, fileType) ? (
                    <span
                      onClick={() =>
                        onViewAttachment?.({
                          url: imageUrl,
                          type: 'pdf',
                          title: fileName || 'ملف PDF المرفق',
                        })
                      }
                      className="text-xs font-bold text-indigo-600 underline cursor-pointer"
                    >
                      📑 {fileName || 'ملف PDF'}
                    </span>
                  ) : (
                    <img
                      src={imagePreview}
                      alt="Receipt"
                      onClick={() =>
                        onViewAttachment?.({
                          url: imageUrl,
                          type: 'image',
                          title: 'معاينة المستند',
                        })
                      }
                      className="w-7 h-7 rounded object-cover cursor-pointer hover:opacity-80 border"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl(null);
                      setImagePreview(null);
                      setFileType(null);
                      setFileName('');
                    }}
                    className="text-xs text-red-500 font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || !supplierName.trim() || !Number(debtAmount)}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-all disabled:opacity-50"
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ الرصيد الافتتاحي'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
