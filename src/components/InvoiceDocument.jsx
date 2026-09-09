import React from 'react';
import defaultLogo from '../assets/logo.png';
import { getDisplayName } from '../utils/userUtils';

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ar-IQ');
}

export default function InvoiceDocument({ 
  sale, 
  settings, 
  isPrintOnly = false,
  showWatermark = true,
  className = ''
}) {
  if (!sale) return null;

  const dateLabel = formatDate(sale.createdAt);
  const products = sale.items?.filter(item => !item.isService) || [];
  const services = sale.items?.filter(item => item.isService) || [];

  const ITEMS_PER_PAGE = 12;
  const allItems = [...products, ...services];
  const pages = [];
  
  for (let i = 0; i < allItems.length; i += ITEMS_PER_PAGE) {
    pages.push(allItems.slice(i, i + ITEMS_PER_PAGE));
  }

  if (pages.length === 0) {
    pages.push([]);
  }

  const invoiceNotes = (sale.notes || sale.offerNotes || sale.invoiceNotes || '').trim();

  return (
    <div className={`invoice-document-wrapper flex flex-col gap-6 w-full ${className}`} dir="rtl">
      {pages.map((pageItems, pageIndex) => {
        const isLastPage = pageIndex === pages.length - 1;

        return (
          <div 
            key={pageIndex} 
            className={`invoice-a4-sheet relative bg-white w-full max-w-[210mm] mx-auto p-6 sm:p-8 flex flex-col justify-between box-border ${
              isPrintOnly 
                ? 'print:break-inside-avoid print:break-after-page min-h-[280mm]' 
                : 'min-h-[297mm] shadow-md border border-slate-200 rounded-xl'
            }`}
            style={{ boxSizing: 'border-box' }}
          >
            {/* العلامة المائية */}
            {showWatermark && settings?.logoUrl && (
              <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-15 overflow-hidden">
                <img 
                  src={settings.logoUrl} 
                  alt="" 
                  className="w-[75%] max-w-[500px] h-auto object-contain filter grayscale" 
                  crossOrigin="anonymous"
                />
              </div>
            )}

            <div className="relative z-10 flex-grow flex flex-col justify-between">
              {/* القسم العلوي: الترويسة والمنتجات */}
              <div>
                {/* الترويسة الرسمية */}
                <div className="flex items-center justify-between mb-4 border-b-2 border-[#C89B3C] pb-3">
                  {/* اليمين: معلومات المتجر */}
                  <div className="flex flex-col items-start text-right">
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mb-1" style={{ letterSpacing: '0px' }}>
                      {(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName}
                    </h1>
                    {settings?.address && (
                      <p className="text-xs sm:text-sm text-slate-500 font-bold mt-0.5" style={{ letterSpacing: '0px', direction: 'rtl', margin: '4px 0 0 0', lineHeight: '1.5' }}>
                        <span style={{ color: '#C89B3C', marginLeft: '6px', fontSize: '13px', display: 'inline' }}>📍</span>
                        <span style={{ display: 'inline' }}>{settings.address}</span>
                      </p>
                    )}
                    {settings?.phone && (
                      <p className="text-xs text-slate-500 font-bold mt-0.5" style={{ direction: 'rtl' }}>
                        <span style={{ color: '#C89B3C', marginLeft: '6px', display: 'inline' }}>📞</span>
                        <span className="font-mono">{settings.phone}</span>
                      </p>
                    )}
                  </div>
                  
                  {/* اليسار: الشعار وحالة الفاتورة */}
                  <div className="flex flex-col items-end gap-1.5 pr-2 relative">
                    <div className="h-20 sm:h-24 flex items-center justify-start relative">
                      <img 
                        src={settings?.logoUrl || defaultLogo} 
                        alt="الشعار" 
                        className="h-20 sm:h-24 w-auto object-contain scale-[1.8] sm:scale-[2] origin-left" 
                        crossOrigin="anonymous"
                      />
                    </div>
                    
                    {sale.isOffer ? (
                      <span className="text-[11px] font-bold text-brand-800 bg-brand-50 border border-brand-300 px-3 py-0.5 rounded-full shadow-xs">
                        عرض سعر (Quotation)
                      </span>
                    ) : sale.isDraft ? (
                      <span className="text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-300 px-2.5 py-0.5 rounded-full shadow-xs">
                        فاتورة غير مؤكدة
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* قسم معلومات العميل ومعلومات الفاتورة */}
                <div className="flex justify-between items-start mb-2.5">
                  {/* يمين: فاتورة إلى */}
                  <div className="text-sm text-right">
                    <h3 className="font-bold text-slate-500 mb-0.5 text-xs" style={{ letterSpacing: '0px' }}>فاتورة إلى:</h3>
                    <p className="text-slate-900 font-extrabold text-lg sm:text-xl" style={{ letterSpacing: '0px' }}>
                      <bdi dir="auto">{sale.customerName || 'زبون عام'}</bdi>
                    </p>
                    {sale.customerPhone && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5" dir="ltr">
                        {sale.customerPhone}
                      </p>
                    )}
                  </div>

                  {/* يسار: أرقام وتواريخ الفاتورة */}
                  <div className="text-xs sm:text-sm pl-2 text-right">
                    <table className="text-right w-full">
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-3 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                            {sale.isOffer ? 'رقم العرض:' : 'رقم الفاتورة:'} 
                            <span className="font-extrabold text-slate-900 mr-1 font-mono">#{sale.invoiceNumber || sale.offerNumber}</span>
                          </td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-3 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                            تاريخ الإصدار: <span className="font-bold text-slate-900 mr-1">{dateLabel}</span>
                          </td>
                        </tr>
                        {sale.invoiceType === 'debt' && !sale.isOffer && (
                          <tr>
                            <td className="py-0.5 pr-3 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                              نوع الدفع: <span className="font-bold text-rose-600 mr-1">آجل (دين)</span>
                            </td>
                          </tr>
                        )}
                        {sale.cashierEmail && (
                          <tr>
                            <td className="py-0.5 pr-3 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                              البائع: <span className="font-bold text-slate-900 mr-1">{getDisplayName(sale.cashierEmail)}</span>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* جدول المنتجات */}
                <table className="w-full border-collapse mt-2 text-right">
                  <thead className="bg-[#f8fafc] text-slate-700 text-xs font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-bold w-[48%] text-right" style={{ letterSpacing: '0px' }}>الوصف</th>
                      <th className="py-2.5 px-2 font-bold text-center w-[14%]" style={{ letterSpacing: '0px' }}>الكمية</th>
                      <th className="py-2.5 px-2 font-bold text-right w-[19%]" style={{ letterSpacing: '0px' }}>السعر</th>
                      <th className="py-2.5 px-3 font-bold text-left w-[19%]" style={{ letterSpacing: '0px' }}>المبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="align-top text-xs sm:text-[13px] text-right">
                    {pageItems.map((item, i) => (
                      <tr key={`${item.productId || i}-${i}`} className="border-b border-slate-100">
                        <td className="py-2 px-3 text-slate-800 font-bold break-words max-w-[280px] leading-snug text-right">
                          {item.isService && !item.isCustom && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal ml-1.5 inline-block align-middle">
                              أجور/خدمة
                            </span>
                          )}
                          <bdi dir="auto" className="inline-block text-right" style={{ unicodeBidi: 'plaintext' }}>
                            {item.name}
                          </bdi>
                          {item.notes && (
                            <span className="inline-block text-[10px] text-slate-600 font-medium leading-tight mt-1 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5">
                              📝 {item.notes}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center text-slate-800 font-bold">
                          {item.quantity}
                          {!item.isService && item.sellMode && item.sellMode !== 'unit' && (
                            <span className="text-[9px] text-slate-500 mr-1 font-normal">
                              ({item.sellMode === 'meter' ? 'متر' : 'لفة'})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-slate-800 font-mono text-right">
                          {item.originalPrice && item.originalPrice > item.unitPrice ? (
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-slate-400 line-through leading-none">{Number(item.originalPrice).toLocaleString()}</span>
                              <span className="text-red-600 font-bold leading-none mt-0.5">{Number(item.unitPrice || 0).toLocaleString()}</span>
                            </div>
                          ) : (
                            Number(item.unitPrice || 0).toLocaleString()
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-800 font-mono font-bold text-left">
                          {(Number(item.lineTotal) || (Number(item.unitPrice || 0) * Number(item.quantity || 1))).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* القسم السفلي: المجاميع (في الصفحة الأخيرة فقط) + التذييل */}
              <div className="mt-auto w-full pt-4">
                {isLastPage ? (
                  <div className="flex justify-between items-end mb-4 pt-2">
                    {/* QR Code */}
                    {settings?.qrCodeUrl ? (
                      <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-lg flex items-center justify-center ml-3 bg-white border border-slate-200 p-1 shrink-0">
                        <img src={settings.qrCodeUrl} alt="QR Code" className="w-full h-full object-contain" crossOrigin="anonymous" />
                      </div>
                    ) : (
                      <div className="w-18 h-18 sm:w-20 sm:h-20 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50/50 ml-3 shrink-0">
                        <span className="text-xs text-slate-400 font-medium">QR</span>
                      </div>
                    )}
                    
                    {/* جدول الإجماليات */}
                    <div className="w-[55%] max-w-[320px] bg-transparent">
                      <div className="border border-slate-200 bg-white p-2 mb-1.5 rounded-t">
                        <table className="w-full text-xs font-bold text-slate-600">
                          <tbody>
                            {Number(sale.discount) > 0 ? (
                              <>
                                <tr>
                                  <td className="text-right py-0.5 px-2">المجموع:</td>
                                  <td className="text-left py-0.5 px-2 font-mono">{Number(sale.subtotal || (Number(sale.total) + Number(sale.discount))).toLocaleString()}</td>
                                </tr>
                                <tr className="text-red-500 border-b border-slate-100 pb-0.5">
                                  <td className="text-right py-0.5 px-2">الخصم:</td>
                                  <td className="text-left py-0.5 px-2">
                                    <span dir="ltr" className="font-mono font-bold text-red-600 inline-block">-{Number(sale.discount).toLocaleString()}</span>
                                  </td>
                                </tr>
                                <tr>
                                  <td className="text-right py-0.5 px-2">الإجمالي بعد الخصم:</td>
                                  <td className="text-left py-0.5 px-2 font-mono text-slate-900">{Number(sale.total).toLocaleString()}</td>
                                </tr>
                              </>
                            ) : (
                              <tr>
                                <td className="text-right py-0.5 px-2">المجموع:</td>
                                <td className="text-left py-0.5 px-2 font-mono text-slate-900">{Number(sale.total).toLocaleString()}</td>
                              </tr>
                            )}

                            {sale.invoiceType === 'debt' && (
                              <>
                                <tr className="text-emerald-700 border-t border-slate-200">
                                  <td className="text-right pt-0.5 px-2">المدفوع:</td>
                                  <td className="text-left pt-0.5 px-2 font-mono">{Number(sale.paidAmount || 0).toLocaleString()} د.ع</td>
                                </tr>
                                <tr className="text-rose-700 font-black">
                                  <td className="text-right py-0.5 px-2">المتبقي (الدين):</td>
                                  <td className="text-left py-0.5 px-2 font-mono">
                                    {Number(sale.remainingDebt !== undefined 
                                      ? Math.min(Number(sale.remainingDebt), Math.max(0, Number(sale.total) - Number(sale.paidAmount || 0))) 
                                      : Math.max(0, Number(sale.total) - Number(sale.paidAmount || 0))
                                    ).toLocaleString()} د.ع
                                  </td>
                                </tr>
                              </>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      <table className="w-full bg-[#C89B3C] text-white p-2 print:bg-[#C89B3C] print:!text-white rounded-b">
                        <tbody>
                          <tr>
                            <td className="text-right py-1.5 px-2.5 font-bold text-xs sm:text-sm">
                              {sale.invoiceType === 'debt' ? 'إجمالي الفاتورة' : 'المبلغ المستحق'}
                            </td>
                            <td className="text-left py-1.5 px-2.5 font-bold text-base sm:text-lg font-mono">
                              {Number(sale.total).toLocaleString()} د.ع
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex justify-end items-center border-t border-slate-200 pt-2 mb-2">
                    <span className="text-xs text-[#C89B3C] font-bold">يتبع الصفحة التالية...</span>
                  </div>
                )}

                {/* التذييل والملاحظات */}
                <div className={`pt-3 ${isLastPage ? "border-t border-slate-200" : ""}`} style={{ letterSpacing: '0px', direction: 'rtl' }}>
                  {isLastPage && invoiceNotes && (
                    <div className="text-[12px] text-slate-800 mb-3 p-3 bg-amber-50/80 border border-amber-300 rounded-xl leading-relaxed text-right shadow-2xs">
                      <strong className="text-amber-950 flex items-center gap-1.5 mb-1 font-bold text-xs">
                        <span>📝</span>
                        <span>{sale.isOffer ? 'ملاحظات وشروط العرض:' : 'ملاحظات الفاتورة:'}</span>
                      </strong>
                      <p className="whitespace-pre-wrap font-semibold text-slate-800 text-[11px] leading-relaxed pr-1">
                        {invoiceNotes}
                      </p>
                    </div>
                  )}
                  {isLastPage && (
                    <div className="mt-3 text-center border-t border-slate-200/80 pt-3" style={{ letterSpacing: '0px' }}>
                      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 leading-relaxed">
                        <p className="font-extrabold text-slate-900 text-xs flex items-center justify-center gap-1.5 mb-0.5">
                          <span>🔒</span>
                          <span>أمانكم واستقرار أعمالكم هو أولويتنا الأولى.</span>
                        </p>
                        <p className="text-[11px] text-slate-600 font-medium leading-relaxed max-w-xl mx-auto">
                          نسعى دائماً لتقديم أحدث تقنيات المراقبة الذكية وحلول الحماية المتقدمة بأعلى معايير الجودة والاعتمادية.
                        </p>
                        <p className="text-[11px] text-[#C89B3C] font-bold mt-1.5">
                          شكراً لاختياركم المنطقة الامنة لأنظمة المراقبة.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
