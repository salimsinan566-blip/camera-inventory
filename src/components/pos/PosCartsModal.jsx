import React, { useState } from 'react';

export default function PosCartsModal({
  isOpen,
  onClose,
  carts = [],
  activeCartId,
  onSelectCart,
  onAddNewCart,
  onRenameCart,
  onDeleteCart,
}) {
  const [editingCartId, setEditingCartId] = useState(null);
  const [tempName, setTempName] = useState('');

  if (!isOpen) return null;

  const startRename = (cart, e) => {
    e.stopPropagation();
    setEditingCartId(cart.id);
    setTempName(cart.name);
  };

  const handleSaveRename = (cartId) => {
    if (tempName.trim()) {
      onRenameCart(cartId, tempName.trim());
    }
    setEditingCartId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs select-none" dir="rtl">
      <div 
        className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛒</span>
            <div>
              <h3 className="font-bold text-slate-800 text-base">السلات المفتوحة</h3>
              <p className="text-xs text-slate-400">إدارة السلات المعلقة والتنقل بينها بحرية</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-sm transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* List of Carts */}
        <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
          {carts.map((cart) => {
            const isActive = cart.id === activeCartId;
            const items = cart.items || [];
            const itemsCount = items.length;
            const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
            const totalAmount = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);
            const isEditing = editingCartId === cart.id;

            return (
              <div
                key={cart.id}
                onClick={() => {
                  onSelectCart(cart.id);
                  onClose();
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-indigo-50/60 border-indigo-300 shadow-xs ring-2 ring-indigo-500/20'
                    : 'bg-white hover:bg-slate-50 border-slate-200/80'
                }`}
              >
                {/* Left/Main Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                    isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {isActive ? '✓' : '🛒'}
                  </div>

                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(cart.id);
                            if (e.key === 'Escape') setEditingCartId(null);
                          }}
                          autoFocus
                          className="bg-white border border-indigo-400 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 outline-none w-32"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(cart.id)}
                          className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold"
                        >
                          حفظ
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800 truncate">
                          {cart.name}
                        </span>
                        {cart.customerName && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium truncate max-w-[100px]">
                            {cart.customerName}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => startRename(cart, e)}
                          className="text-slate-400 hover:text-slate-600 text-xs px-1"
                          title="تعديل اسم السلة"
                        >
                          ✏️
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-medium">
                      <span>{itemsCount} أصناف ({totalUnits} قطعة)</span>
                      <span>•</span>
                      <span className="font-mono text-indigo-600 font-bold">
                        {totalAmount.toLocaleString()} د.ع
                      </span>
                      <span>•</span>
                      <span>{cart.customerType === 'offer' ? 'عرض سعر' : (cart.customerType === 'client' ? 'عميل' : 'زبون')}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {carts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteCart(cart.id)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                      title="حذف هذه السلة"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer / Add New Cart Button */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onAddNewCart();
              onClose();
            }}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <span>➕</span>
            <span>فتح سلة جديدة فارغة</span>
          </button>
        </div>
      </div>
    </div>
  );
}
