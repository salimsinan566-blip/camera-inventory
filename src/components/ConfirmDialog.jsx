import React from 'react';

/**
 * صندوق تأكيد بسيط قبل أي عملية حذف — يمنع الحذف بالخطأ.
 * props: title, message, onConfirm, onCancel
 */
export default function ConfirmDialog({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-ink-900 mb-2">{title}</h3>
        <p className="text-sm text-ink-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-ink-700 hover:text-ink-900"
          >
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-danger-500 hover:bg-danger-700 text-white rounded"
          >
            حذف
          </button>
        </div>
      </div>
    </div>
  );
}
