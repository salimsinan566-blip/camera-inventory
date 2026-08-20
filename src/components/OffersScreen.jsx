import React, { useState } from 'react';
import { useOffers } from '../hooks/useOffers';
import { deleteOffer, markOfferAsConverted } from '../services/offersService';
import { useUI } from '../contexts/UIContext';
import InvoiceReceipt from './InvoiceReceipt';

export default function OffersScreen({ onEditOffer, onCreateOffer, onConvertOfferToSale }) {
  const { offers, loading, error } = useOffers();
  const { toast, confirm } = useUI();
  
  const [printingOffer, setPrintingOffer] = useState(null);

  const handleDelete = (offer) => {
    confirm(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف عرض السعر "${offer.offerName}"؟`,
      async () => {
        try {
          await deleteOffer(offer.id);
          toast('تم حذف العرض بنجاح', 'success');
        } catch (err) {
          toast('حدث خطأ أثناء الحذف: ' + err.message, 'error');
        }
      }
    );
  };

  const handlePrint = (offer) => {
    // To print, we create a pseudo-sale object
    const pseudoSale = {
      ...offer,
      invoiceNumber: offer.offerNumber,
      isOffer: true
    };
    setPrintingOffer(pseudoSale);
  };

  if (loading) {
    return <div className="p-8 text-center text-ink-500">جاري تحميل العروض...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-danger-500">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-brand-100">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">عروض الأسعار</h1>
          <p className="text-ink-500 text-sm mt-1">إدارة وإنشاء عروض أسعار للعملاء (لا تؤثر على المخزون)</p>
        </div>
        <button
          onClick={onCreateOffer}
          className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-sm transition-all flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
          إنشاء عرض جديد
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-ink-200 overflow-hidden">
        {offers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-brand-50 text-brand-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-ink-900">لا توجد عروض أسعار</h3>
            <p className="text-ink-500 mt-2">انقر على الزر أعلاه لإنشاء أول عرض سعر.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-ink-50 text-ink-600 font-bold border-b border-ink-200">
                <tr>
                  <th className="px-6 py-4">رقم العرض</th>
                  <th className="px-6 py-4">اسم العرض</th>
                  <th className="px-6 py-4">اسم العميل</th>
                  <th className="px-6 py-4">تاريخ الإنشاء</th>
                  <th className="px-6 py-4">الإجمالي</th>
                  <th className="px-6 py-4">الحالة</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {offers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-brand-50/50 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-ink-900">#{offer.offerNumber || '---'}</td>
                    <td className="px-6 py-4 font-bold text-brand-700">{offer.offerName}</td>
                    <td className="px-6 py-4 text-ink-700">{offer.customerName || '-'}</td>
                    <td className="px-6 py-4 text-ink-500" dir="ltr">{offer.createdAt.toLocaleDateString('en-GB')}</td>
                    <td className="px-6 py-4 font-bold text-ink-900">{Number(offer.total).toLocaleString()} د.ع</td>
                    <td className="px-6 py-4">
                      {offer.status === 'converted' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">مُحوّل لمبيعات</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-brand-100 text-brand-800 border border-brand-200">نشط</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handlePrint(offer)}
                          className="p-2 text-ink-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="طباعة عرض السعر"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2-2v4h10z" />
                          </svg>
                        </button>
                        
                        <button
                          onClick={() => onEditOffer(offer)}
                          className="p-2 text-ink-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="تعديل العرض"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>

                        <button
                          onClick={() => handleDelete(offer)}
                          className="p-2 text-ink-500 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                          title="حذف العرض"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>

                        <button
                          onClick={() => onConvertOfferToSale(offer)}
                          className="px-3 py-1.5 ml-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
                          title="تحويل العرض إلى نقطة البيع للمحاسبة وخصم المخزون"
                        >
                          تحويل لفاتورة
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {printingOffer && (
        <InvoiceReceipt 
          sale={printingOffer} 
          onClose={() => setPrintingOffer(null)} 
        />
      )}
    </div>
  );
}
