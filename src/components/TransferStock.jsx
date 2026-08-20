import React, { useState } from 'react';
import { LOCATIONS, LOCATION_LABELS_AR } from '../models/product';
import { transferStock } from '../services/productsService';
import { useAuth } from '../hooks/useAuth';

/**
 * نافذة نقل كمية بين المحل والمخزن لمنتج معيّن.
 * props: product, onClose
 */
export default function TransferStock({ product, onClose }) {
  const { user } = useAuth();
  const [from, setFrom] = useState(LOCATIONS.WAREHOUSE); // الافتراضي: من المخزن للمحل
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const to = from === LOCATIONS.WAREHOUSE ? LOCATIONS.STORE : LOCATIONS.WAREHOUSE;
  const availableInSource =
    from === LOCATIONS.STORE ? product.storeQty : product.warehouseQty;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const qty = Number(amount) || 0;
    if (qty <= 0) {
      setError('الكمية يجب أن تكون أكبر من صفر');
      return;
    }
    if (qty > availableInSource) {
      setError(`الكمية المتوفرة في ${LOCATION_LABELS_AR[from]} هي ${availableInSource} فقط`);
      return;
    }
    setSaving(true);
    try {
      await transferStock(product.id, from, to, qty, user?.email || '', reason);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" dir="rtl">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-ink-900 mb-1">نقل كمية</h2>
        <p className="text-sm text-ink-500 mb-4">{product.name}</p>

        <div className="bg-brand-50 border border-brand-100 rounded-lg p-3 mb-4 text-sm text-ink-700 flex justify-between">
          <span>المحل: <span className="font-bold">{product.storeQty}</span></span>
          <span>المخزن: <span className="font-bold">{product.warehouseQty}</span></span>
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-500 text-danger-700 text-sm rounded p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-ink-700 mb-1">اتجاه النقل</label>
          <div className="flex gap-3 mb-4">
            <button
              type="button"
              onClick={() => setFrom(LOCATIONS.WAREHOUSE)}
              className={`flex-1 py-2 rounded-lg text-sm border ${
                from === LOCATIONS.WAREHOUSE
                  ? 'bg-brand-500 border-brand-500 text-ink-900 font-bold'
                  : 'border-brand-100 text-ink-500'
              }`}
            >
              من المخزن ← المحل
            </button>
            <button
              type="button"
              onClick={() => setFrom(LOCATIONS.STORE)}
              className={`flex-1 py-2 rounded-lg text-sm border ${
                from === LOCATIONS.STORE
                  ? 'bg-brand-500 border-brand-500 text-ink-900 font-bold'
                  : 'border-brand-100 text-ink-500'
              }`}
            >
              من المحل ← المخزن
            </button>
          </div>

          <label className="block text-sm text-ink-700 mb-1">الكمية المنقولة</label>
          <input
            type="number"
            min="1"
            max={availableInSource}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input mb-2"
          />
          <p className="text-xs text-ink-500 mb-3">
            المتوفر في {LOCATION_LABELS_AR[from]}: {availableInSource}
          </p>

          <label className="block text-xs font-bold text-ink-700 mb-1">ملاحظة / سبب النقل (اختياري)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: تغذية المحل، إعادة للمخزن..."
            className="input text-xs mb-4"
          />

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-700 hover:text-ink-900"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-ink-900 font-bold rounded-lg disabled:opacity-60"
            >
              {saving ? 'جارٍ النقل...' : 'نقل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
