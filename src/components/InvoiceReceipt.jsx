import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../hooks/useSettings';
import { useCustomers } from '../hooks/useCustomers';
import { updateCustomer } from '../services/customersService';
import { db } from '../firebase/config';
import { doc, updateDoc } from 'firebase/firestore';
import { getDisplayName } from '../utils/userUtils';
import html2pdf from 'html2pdf.js';
import { 
  getWhatsAppDirectUrl, 
  renderWhatsAppTemplate, 
  DEFAULT_WHATSAPP_TEMPLATES, 
  sendWhatsAppMessageViaGateway,
  sendWhatsAppDocumentViaGateway 
} from '../services/whatsappService';
import { createOffer } from '../services/offersService';
import { useUI } from '../contexts/UIContext';

export default function InvoiceReceipt({ sale, onClose, inlinePrintMode = false, isCustomerPortalView = false }) {
  if (!sale) return null;

  const { toast } = useUI();
  const { settings } = useSettings();
  const { customers } = useCustomers();
  const [isSending, setIsSending] = useState(false);
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  
  const printRef = useRef();

  // Find live customer by ID or Name
  const matchedCustomer = customers?.find(c => 
    (sale.customerId && c.id === sale.customerId) ||
    (c.name && sale.customerName && c.name.trim().toLowerCase() === sale.customerName.trim().toLowerCase())
  );

  const initialPhone = matchedCustomer?.phone1 || matchedCustomer?.phone2 || sale.customerPhone || sale.phone1 || sale.phone || '';
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [targetPhone, setTargetPhone] = useState(initialPhone);
  const [savePhoneToCustomer, setSavePhoneToCustomer] = useState(true);
  const [scheduleOption, setScheduleOption] = useState('now'); // 'now' | '5m' | '15m' | '30m' | '1h' | '2h' | 'custom'
  const [customDateTime, setCustomDateTime] = useState('');

  // Sync phone when customer loads
  useEffect(() => {
    if (initialPhone && (!targetPhone || targetPhone === sale.customerPhone)) {
      setTargetPhone(initialPhone);
    }
  }, [initialPhone]);

  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSaveAsOffer = async () => {
    if (sale.isOffer) {
      toast('هذا المستند محفوظ بالفعل كعرض سعر في النظام', 'info');
      return;
    }
    setIsSavingOffer(true);
    try {
      const generatedOfferName = `عرض سعر - ${sale.customerName || 'عميل عام'}`;
      const offerOptions = {
        offerName: generatedOfferName,
        customerName: sale.customerName || '',
        notes: sale.notes || '',
        discount: sale.discount || 0,
        taxRate: sale.taxRate || 0,
        cashierEmail: sale.cashierEmail || '',
      };
      const result = await createOffer(sale.items || [], offerOptions);
      toast(`تم حفظ الفاتورة بنجاح في قسم عروض الأسعار (#${result.offerNumber}) 📑✨`, 'success');
    } catch (err) {
      toast(`فشل حفظ عرض السعر: ${err.message}`, 'error');
    } finally {
      setIsSavingOffer(false);
    }
  };

  const handlePrint = async () => {
    const originalTitle = document.title;
    document.title = `فاتورة_${sale.invoiceNumber || 'safe_zone'}_عميل_${sale.customerName || 'عام'}`;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 500);
  };

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

  const invoiceContent = pages.map((pageItems, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;

    return (
      <div 
        key={pageIndex} 
        className="invoice-page relative w-full flex flex-col justify-between bg-transparent print:break-after-page" 
        style={{ minHeight: '100%', flexGrow: 1, boxSizing: 'border-box' }}
      >
        {/* القسم العلوي: الترويسة والمنتجات */}
        <div>
          {/* الترويسة الفنية */}
          <div className="flex items-center justify-between mb-4 border-b-2 border-[#C89B3C] pb-3">
            {/* اليمين: معلومات المتجر */}
            <div className="flex flex-col items-start text-right">
              <h1 className="text-3xl font-extrabold text-slate-900 mb-1" style={{ letterSpacing: '0px' }}>
                {(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName}
              </h1>
              {settings?.address && (
                <p className="text-sm text-slate-500 font-bold mt-1" style={{ letterSpacing: '0px', direction: 'rtl', margin: '4px 0 0 0', lineHeight: '1.5' }}>
                  <span style={{ color: '#C89B3C', marginLeft: '6px', fontSize: '13px', display: 'inline' }}>📍</span>
                  <span style={{ display: 'inline' }}>{settings.address}</span>
                </p>
              )}
            </div>
            
            {/* اليسار: الشعار وحالة الفاتورة */}
            <div className="flex flex-col items-end gap-1.5 pr-2 relative">
              {settings?.logoUrl ? (
                <div className="h-28 flex items-center justify-end">
                  <img 
                    src={settings.logoUrl} 
                    alt="الشعار" 
                    className="h-28 w-auto object-contain scale-[2.2] origin-left print:scale-[2]" 
                    crossOrigin="anonymous"
                  />
                </div>
              ) : (
                <div className="h-28 w-36 flex items-center justify-center text-slate-300 border-2 border-dashed border-slate-200 p-1 font-bold rounded text-center text-xs">
                  [الشعار]
                </div>
              )}
              
              {sale.isOffer ? (
                <span className="text-[12px] font-bold text-brand-800 bg-brand-50 border border-brand-300 px-4 py-1 rounded-full shadow-xs">
                  عرض سعر (Quotation)
                </span>
              ) : sale.isDraft ? (
                <span className="text-[11px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-300 px-3 py-0.5 rounded-full shadow-xs">
                  فاتورة غير مؤكدة
                </span>
              ) : null}
            </div>
          </div>

          {/* قسم معلومات العميل ومعلومات الفاتورة */}
          <div className="flex justify-between items-start mb-2.5">
            {/* يمين: فاتورة إلى */}
            <div className="text-sm text-right">
              <h3 className="font-bold text-slate-500 mb-0.5 text-xs" style={{ letterSpacing: '0px' }}>فاتورة إلى</h3>
              <p className="text-slate-900 font-extrabold text-xl sm:text-2xl" style={{ letterSpacing: '0px' }}>
                <bdi dir="auto">{sale.customerName || 'زبون عام'}</bdi>
              </p>
            </div>

            {/* يسار: أرقام وتواريخ الفاتورة */}
            <div className="text-xs sm:text-sm border-r border-transparent pl-2 text-right">
              <table className="text-right w-full">
                <tbody>
                  <tr>
                    <td className="py-0.5 pr-4 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                      {sale.isOffer ? 'رقم العرض:' : 'رقم الفاتورة:'} <span className="font-bold text-slate-900 mr-1">{sale.invoiceNumber || sale.offerNumber}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 pr-4 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                      تاريخ الإصدار: <span className="font-bold text-slate-900 mr-1">{dateLabel}</span>
                    </td>
                  </tr>
                  {sale.invoiceType === 'debt' && !sale.isOffer && (
                    <tr>
                      <td className="py-0.5 pr-4 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                        نوع الدفع: <span className="font-bold text-warn-600 mr-1">آجل (دين)</span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-0.5 pr-4 text-slate-500 font-medium" style={{ letterSpacing: '0px' }}>
                      البائع: <span className="font-bold text-slate-900 mr-1">{getDisplayName(sale.cashierEmail)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          
          {/* جدول المنتجات */}
          <table className="w-full border-collapse mt-2">
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
                <tr key={`${item.productId}-${i}`} className="border-b border-slate-100">
                  <td className="py-2 px-3 text-slate-800 font-bold break-words max-w-[280px] leading-snug text-right">
                    {item.isService && <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal ml-1.5 inline-block align-middle">أجور/خدمة</span>}
                    <bdi dir="auto" className="inline-block text-right" style={{ unicodeBidi: 'plaintext' }}>
                      {item.name}
                    </bdi>
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
                <div className="w-20 h-20 rounded-lg flex items-center justify-center ml-3 bg-white border border-slate-200 p-1 shrink-0">
                  <img src={settings.qrCodeUrl} alt="QR Code" className="w-full h-full object-contain" crossOrigin="anonymous" />
                </div>
              ) : (
                <div className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center bg-slate-50/50 ml-3 shrink-0">
                  <span className="text-xs text-slate-400 font-medium">QR</span>
                </div>
              )}
              
              <div className="w-[55%] max-w-[320px] bg-transparent">
                <div className="border border-slate-200 bg-white p-2 mb-1.5 rounded-t">
                  <table className="w-full text-xs font-bold text-slate-600">
                    <tbody>
                      {Number(sale.discount) > 0 ? (
                        <>
                          <tr>
                            <td className="text-right py-0.5 px-2">المجموع:</td>
                            <td className="text-left py-0.5 px-2 font-mono">{Number(sale.subtotal || sale.total + sale.discount).toLocaleString()}</td>
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
              <span className="text-xs text-[#C89B3C] font-bold">يتبع...</span>
            </div>
          )}

          {/* التذييل */}
          <div className={`pt-2 ${isLastPage ? "border-t border-slate-200" : ""}`}>
            {settings?.description && (
              <div className="text-[10px] text-slate-500 whitespace-pre-wrap mb-1 w-3/4 font-medium leading-tight">
                <strong className="text-slate-700 block mb-0.5">ملاحظات هامة:</strong>
                {settings.description}
              </div>
            )}
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px] text-slate-500 font-bold">
              <span>{(!settings?.storeName || settings.storeName.toUpperCase() === 'SAFE ZONE') ? 'المنطقة الامنة' : settings.storeName}</span>
              {settings?.address && <span>• {settings.address}</span>}
              <span>• شكراً لثقتكم بنا</span>
            </div>
            
            {isLastPage && sale.historyLogs && sale.historyLogs.length > 0 && (
              <div className="mt-4 bg-slate-50 border border-slate-200 p-3 rounded text-right relative z-20 print:hidden">
                <h4 className="text-xs font-bold text-slate-600 mb-1.5">سجل التعديلات السابقة (لا يُطبع):</h4>
                <ul className="text-[10px] text-slate-500 space-y-0.5">
                  {sale.historyLogs.map((log, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="font-mono opacity-70">[{formatDate(log.date)}]</span>
                      <span>{log.action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  });

  const [isSendingTelegram, setIsSendingTelegram] = useState(false);

  const generateInvoiceText = () => {
    let text = `📄 *فاتورة ${sale.isOffer ? 'عرض سعر' : 'مبيعات'}*\n`;
    text += `🏬 *${settings?.storeName || 'المنطقة الآمنة'}*\n`;
    text += `──────────────\n`;
    text += `🔢 رقم الفاتورة: ${sale.invoiceNumber || sale.id}\n`;
    text += `👤 العميل: ${sale.customerName || 'زبون عام'}\n`;
    text += `📅 التاريخ: ${dateLabel}\n`;
    text += `──────────────\n`;
    text += `📦 *المنتجات:*\n`;
    (sale.items || []).forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} (${item.quantity}) - ${(Number(item.lineTotal) || (item.unitPrice * item.quantity)).toLocaleString()} د.ع\n`;
    });
    text += `──────────────\n`;
    if (Number(sale.discount) > 0) {
      text += `🏷️ الخصم: ${Number(sale.discount).toLocaleString()} د.ع\n`;
    }
    text += `💰 *الإجمالي: ${Number(sale.total).toLocaleString()} د.ع*\n`;
    if (sale.invoiceType === 'debt') {
      const paid = Number(sale.paidAmount || 0);
      const rem = sale.remainingDebt !== undefined 
        ? Math.min(Number(sale.remainingDebt), Math.max(0, Number(sale.total) - paid)) 
        : Math.max(0, Number(sale.total) - paid);
      text += `💵 المدفوع: ${paid.toLocaleString()} د.ع\n`;
      text += `⏳ المتبقي (الدين): ${rem.toLocaleString()} د.ع\n`;
    }
    return text;
  };

  const captureInvoicePortalPdfBlob = async () => {
    const portalEl = document.getElementById('print-portal');
    if (!portalEl) throw new Error('لا يمكن العثور على محتوى الفاتورة');

    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '794px';
    overlay.style.height = 'auto';
    overlay.style.opacity = '0.005';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '-99999';
    overlay.style.overflow = 'hidden';
    overlay.dir = 'rtl';

    const container = document.createElement('div');
    container.style.width = '794px';
    container.style.backgroundColor = '#ffffff';
    container.style.boxSizing = 'border-box';
    container.style.margin = '0';
    container.style.padding = '0';
    container.dir = 'rtl';

    const clone = portalEl.cloneNode(true);
    clone.classList.remove('hidden', 'print:block');
    clone.style.display = 'block';
    clone.style.direction = 'rtl';
    clone.style.fontFamily = "'Cairo', 'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    
    // إزالة أي تباعد بين الحروف لضمان اتصال الكلمات العربية بشكل سليم تماماً
    clone.querySelectorAll('*').forEach(el => {
      el.style.letterSpacing = '0px';
      el.style.wordSpacing = 'normal';
      el.style.textTransform = 'none';
    });

    container.appendChild(clone);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (e) {}
    }
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      const opt = {
        margin: 0,
        filename: `فاتورة_${sale.invoiceNumber || 'draft'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2.5, 
          useCORS: true, 
          logging: false, 
          scrollY: 0, 
          windowWidth: 794,
          letterRendering: true,
          allowTaint: true
        },
        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      };

      const pdfBlob = await html2pdf().set(opt).from(container).output('blob');
      return pdfBlob;
    } finally {
      document.body.removeChild(overlay);
    }
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const pdfBlob = await captureInvoicePortalPdfBlob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `فاتورة_${sale.invoiceNumber || 'safe_zone'}_${sale.customerName || 'عميل'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (toast) toast('تم تحميل ملف الفاتورة PDF بنجاح! 📥', 'success');
    } catch (err) {
      console.error('PDF download error:', err);
      handlePrint();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const shareToTelegram = async () => {
    if (!settings?.telegramBotToken || !settings?.telegramChatId) {
      alert('يرجى إضافة توكن البوت ومعرف الجروب في الإعدادات أولاً.');
      return;
    }

    try {
      setIsSendingTelegram(true);
      const pdfBlob = await captureInvoicePortalPdfBlob();
      const text = generateInvoiceText();
      const formData = new FormData();
      formData.append('chat_id', settings.telegramChatId);
      formData.append('document', pdfBlob, `فاتورة_${sale.invoiceNumber || 'draft'}.pdf`);
      formData.append('caption', text);

      const res = await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.description || 'فشل الإرسال');
      }

      alert('تم إرسال الفاتورة إلى الجروب بنجاح!');
    } catch (err) {
      console.error(err);
      alert(`حدث خطأ أثناء الإرسال: ${err.message}`);
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const openWhatsAppModal = (e) => {
    if (e) e.preventDefault();
    const phoneToUse = matchedCustomer?.phone1 || matchedCustomer?.phone2 || sale.customerPhone || sale.phone1 || sale.phone || '';
    setTargetPhone(phoneToUse);
    setScheduleOption('now');
    setShowWhatsAppModal(true);
  };

  const executeShareToWhatsApp = async (phoneToSend) => {
    const rawPhone = (phoneToSend || targetPhone || '').trim();
    if (!rawPhone) {
      alert('يرجى إدخال رقم هاتف الواتساب للمستلم');
      return;
    }

    let delayMinutes = 0;
    let sendAt = null;

    if (scheduleOption === '5m') delayMinutes = 5;
    else if (scheduleOption === '15m') delayMinutes = 15;
    else if (scheduleOption === '30m') delayMinutes = 30;
    else if (scheduleOption === '1h') delayMinutes = 60;
    else if (scheduleOption === '2h') delayMinutes = 120;
    else if (scheduleOption === 'custom' && customDateTime) {
      sendAt = new Date(customDateTime).toISOString();
    }

    let text = generateInvoiceText(); // Default fallback text
    setIsSendingWhatsApp(true);
    try {
      // 1. Optionally save the updated phone number
      if (savePhoneToCustomer) {
        try {
          if (sale.id) {
            await updateDoc(doc(db, 'sales', sale.id), { customerPhone: rawPhone });
          }
          if (matchedCustomer?.id) {
            await updateCustomer(matchedCustomer.id, { 
              name: matchedCustomer.name,
              phone1: rawPhone,
              phone2: matchedCustomer.phone2 || ''
            });
          }
        } catch (saveErr) {
          console.warn('Could not update customer phone in database:', saveErr);
        }
      }

      const rawTargetPhone = String(targetPhone || sale.customerPhone || '').replace(/[^\d]/g, '');
      const last4 = rawTargetPhone.length >= 4 ? rawTargetPhone.slice(-4) : rawTargetPhone;
      const customerPin = last4 || 'آخر 4 أرقام من هاتفك';
      const pinParam = (customerPin && customerPin !== 'آخر 4 أرقام من هاتفك') ? `&pin=${customerPin}` : '';
      const idParam = rawTargetPhone ? `phone=${rawTargetPhone}` : `name=${encodeURIComponent(sale.customerName || '')}`;
      const portalUrl = `${window.location.origin}${window.location.pathname}?portal=customer&${idParam}${pinParam}`;
      
      let debtSection = '';
      if (sale.invoiceType === 'debt') {
        const paid = Number(sale.paidAmount || 0);
        const rem = sale.remainingDebt !== undefined 
          ? Math.min(Number(sale.remainingDebt), Math.max(0, Number(sale.total) - paid)) 
          : Math.max(0, Number(sale.total) - paid);
        debtSection = `⏳ المتبقي (الدين): ${rem.toLocaleString()} د.ع\n`;
      }

      const template = settings?.whatsappInvoiceTemplate || DEFAULT_WHATSAPP_TEMPLATES.invoice;
      text = renderWhatsAppTemplate(template, {
        customerName: sale.customerName || 'عزيزي العميل',
        username: sale.customerName || 'عزيزي العميل',
        password: customerPin,
        pin: customerPin,
        phone: targetPhone,
        storeName: settings?.storeName || 'المحل',
        invoiceNumber: sale.invoiceNumber || sale.id,
        invoiceDate: formatDate(sale.createdAt),
        total: Number(sale.total || 0).toLocaleString(),
        paidAmount: Number(sale.paidAmount || (sale.invoiceType === 'debt' ? 0 : sale.total)).toLocaleString(),
        debtSection: debtSection,
        statementLink: portalUrl
      });

      // 2. Extract exact clean full HTML of the print portal for native Chromium print engine
      const portalEl = document.getElementById('print-portal');
      let invoiceHtml = null;
      if (portalEl) {
        const clone = portalEl.cloneNode(true);
        clone.classList.remove('hidden', 'print:block');
        clone.style.display = 'block';
        clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"]').forEach(el => el.remove());
        
        let allHeadStyles = '';
        try {
          document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
            if (el.id === 'print-style' || el.innerHTML?.includes('body > :not(#print-portal)')) {
              return; // Exclude global print-hiding rule
            }
            allHeadStyles += el.outerHTML + '\n';
          });
        } catch (e) {}

        invoiceHtml = `<!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>فاتورة_${sale.invoiceNumber || 'draft'}</title>
          ${allHeadStyles}
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800;900&display=swap');
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box !important;
              letter-spacing: 0px !important;
              word-spacing: normal !important;
            }
            body {
              font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif !important;
              margin: 0 !important;
              padding: 8mm 12mm !important;
              background: #ffffff !important;
              direction: rtl !important;
              display: block !important;
              visibility: visible !important;
            }
            #print-portal {
              display: block !important;
              visibility: visible !important;
              width: 100% !important;
              background: #ffffff !important;
            }
            .print\\:hidden, [class*="print:hidden"] {
              display: none !important;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
          </style>
        </head>
        <body class="bg-white" dir="rtl">
          <div id="print-portal" class="w-full relative m-0 p-0 bg-white" dir="rtl">
            ${clone.innerHTML}
          </div>
        </body>
        </html>`;
      }

      // 3. Generate fallback client-side blob if needed
      const pdfBlob = await captureInvoicePortalPdfBlob();
      const pdfBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });

      // 4. Send or Schedule PDF document via WhatsApp Gateway
      try {
        const result = await sendWhatsAppDocumentViaGateway({
          phone: rawPhone,
          html: invoiceHtml,
          documentBase64: pdfBase64,
          filename: `فاتورة_${sale.invoiceNumber || sale.id}.pdf`,
          caption: text,
          delayMinutes,
          sendAt,
          settings
        });

        setShowWhatsAppModal(false);
        
        if (result?.scheduled) {
          alert(`⏰ تم جدولة إرسال الفاتورة بنجاح!\n📱 المستلم: ${rawPhone}\n📅 الموعد: ${result.message || 'في الوقت المحدد'}\n\nسيقوم خادم الواتساب بإرسالها تلقائياً في الموعد المحدد.`);
        } else {
          alert(`تم إرسال الفاتورة كملف PDF عالي الوضوح عبر خادم الواتساب إلى (${rawPhone}) بنجاح! 📄🚀`);
        }
      } catch (pdfErr) {
        console.warn('PDF document send failed, attempting direct text message via server:', pdfErr);
        // المحاولة الثانية عبر السيرفر: إرسال تفاصيل الفاتورة ورابطها كنص فوري عبر السيرفر
        try {
          await sendWhatsAppMessageViaGateway({
            phone: rawPhone,
            message: text,
            delayMinutes,
            sendAt,
            settings
          });
          setShowWhatsAppModal(false);
          alert(`تم إرسال تفاصيل الفاتورة ورابط كشف الحساب بنجاح عبر خادم الواتساب إلى (${rawPhone})! 🚀`);
        } catch (serverTextErr) {
          console.error('Server text dispatch error:', serverTextErr);
          alert(`تعذر الإرسال التلقائي عبر السيرفر: ${serverTextErr.message || pdfErr.message}\nيرجى التأكد من حالة اتصال خادم الواتساب في الإعدادات.`);
          setShowWhatsAppModal(false);
        }
      }
    } catch (err) {
      console.error('WhatsApp send error:', err);
      alert(`حدث خطأ أثناء تجهيز الفاتورة: ${err.message}`);
      setShowWhatsAppModal(false);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  if (inlinePrintMode) {
    return (
      <div className="w-full relative m-0 p-0 bg-transparent print:break-before-page" dir="rtl">
        {invoiceContent.map((page, idx) => (
          <div key={idx} className="relative bg-white print:break-inside-avoid print:break-after-page min-h-[280mm]">
            {settings?.logoUrl && (
              <img 
                src={settings.logoUrl} 
                alt="" 
                className="fixed top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] w-[80%] max-w-[600px] h-auto object-contain filter grayscale opacity-25 z-0 pointer-events-none" 
              />
            )}
            <div className="relative z-10">
              {page}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {/* --- Phone Input & Scheduling Confirmation Modal --- */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.815 11.815 0 018.413 3.487 11.821 11.821 0 013.48 8.413c-.003 6.558-5.338 11.893-11.893 11.893h-.005a11.882 11.882 0 01-5.683-1.448L.057 24z"/></svg>
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-800 text-lg">إرسال الفاتورة عبر واتساب</h3>
                  <p className="text-xs text-slate-500 font-medium">العميل: <strong className="text-slate-800">{sale.customerName || 'زبون عام'}</strong></p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowWhatsAppModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                رقم هاتف الواتساب للمستلم
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="مثال: 07701234567 أو 07801234567"
                  className="w-full text-left font-mono font-bold text-base px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                  dir="ltr"
                  autoFocus
                />
              </div>
            </div>

            {/* أزرار سريعة للأرقام المسجلة */}
            {(matchedCustomer?.phone1 || matchedCustomer?.phone2 || sale.customerPhone) && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <span className="text-[11px] text-slate-400 font-bold self-center ml-1">الأرقام المسجلة:</span>
                {matchedCustomer?.phone1 && (
                  <button
                    type="button"
                    onClick={() => setTargetPhone(matchedCustomer.phone1)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-mono border transition-all ${targetPhone === matchedCustomer.phone1 ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    📱 {matchedCustomer.phone1} (الرئيسي)
                  </button>
                )}
                {matchedCustomer?.phone2 && matchedCustomer.phone2 !== matchedCustomer.phone1 && (
                  <button
                    type="button"
                    onClick={() => setTargetPhone(matchedCustomer.phone2)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-mono border transition-all ${targetPhone === matchedCustomer.phone2 ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    📞 {matchedCustomer.phone2} (إضافي)
                  </button>
                )}
                {sale.customerPhone && sale.customerPhone !== matchedCustomer?.phone1 && sale.customerPhone !== matchedCustomer?.phone2 && (
                  <button
                    type="button"
                    onClick={() => setTargetPhone(sale.customerPhone)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-mono border transition-all ${targetPhone === sale.customerPhone ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    🏷️ {sale.customerPhone} (الفاتورة)
                  </button>
                )}
              </div>
            )}

            {/* قسم توقيت وجدولة الإرسال */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <span>⏰ توقيت الإرسال:</span>
                  <span className="text-emerald-700 font-extrabold">
                    {scheduleOption === 'now' && 'فوري (الآن)'}
                    {scheduleOption === '5m' && 'بعد 5 دقائق (تجربة سريعة)'}
                    {scheduleOption === '15m' && 'بعد 15 دقيقة'}
                    {scheduleOption === '30m' && 'بعد نصف ساعة'}
                    {scheduleOption === '1h' && 'بعد ساعة بالضبط (60 دقيقة)'}
                    {scheduleOption === '2h' && 'بعد ساعتين'}
                    {scheduleOption === 'custom' && 'وقت وتاريخ مخصص'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setScheduleOption('now')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === 'now' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  ⚡ الآن
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOption('5m')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === '5m' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  ⏱️ 5 دقائق
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOption('15m')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === '15m' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  ⏱️ 15 دقيقة
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOption('30m')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === '30m' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  ⏱️ 30 دقيقة
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOption('1h')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === '1h' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  ⏳ بعد ساعة
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleOption('2h')}
                  className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === '2h' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  ⏳ بعد ساعتين
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleOption('custom');
                    if (!customDateTime) {
                      const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
                      defaultTime.setMinutes(defaultTime.getMinutes() - defaultTime.getTimezoneOffset());
                      setCustomDateTime(defaultTime.toISOString().slice(0, 16));
                    }
                  }}
                  className={`col-span-2 py-1.5 px-2 rounded-lg text-xs font-bold transition-all border ${scheduleOption === 'custom' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'}`}
                >
                  📅 وقت مخصص...
                </button>
              </div>

              {scheduleOption === 'custom' && (
                <div className="pt-1">
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                    className="w-full text-sm font-mono px-3 py-2 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              )}

              {scheduleOption !== 'now' && (
                <div className="text-[11px] text-emerald-800 bg-emerald-50/80 border border-emerald-200 rounded-lg p-2 flex items-center gap-1.5">
                  <span>ℹ️ سيقوم خادم الواتساب بإرسال الفاتورة تلقائياً في الخلفية في الموعد المحدد.</span>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={savePhoneToCustomer}
                onChange={(e) => setSavePhoneToCustomer(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
              />
              <span>تحديث وحفظ هذا الرقم في سجل العميل للمستقبل</span>
            </label>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWhatsAppModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 transition-colors"
                disabled={isSendingWhatsApp}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => executeShareToWhatsApp(targetPhone)}
                disabled={isSendingWhatsApp || !targetPhone?.trim()}
                className={`flex-[2] py-2.5 px-4 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 shadow-md transition-all ${isSendingWhatsApp || !targetPhone?.trim() ? 'bg-emerald-400 opacity-75 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg active:scale-[0.98]'}`}
              >
                {isSendingWhatsApp ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>جارٍ الجدولة / الإرسال...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {scheduleOption === 'now' 
                        ? 'إرسال الفاتورة الآن (PDF) 🚀' 
                        : scheduleOption === '1h'
                        ? 'جدولة الإرسال بعد ساعة ⏰'
                        : `جدولة الإرسال ⏰`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Screen Modal --- */}
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden" dir="rtl">
        <div className="bg-white shadow-2xl w-full max-w-4xl h-auto max-h-[95vh] overflow-y-auto flex flex-col relative">
          
          {/* شريط الإغلاق والأدوات في الأعلى */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 sm:gap-3">
            {isCustomerPortalView ? (
              <>
                
                <button
                  onClick={handlePrint}
                  className="px-3.5 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-xl shadow-xs text-xs font-bold flex items-center gap-1.5 transition-all border border-brand-200 cursor-pointer hover:shadow-md active:scale-95"
                  title="طباعة / حفظ كـ PDF"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                  <span>طباعة / PDF</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={shareToTelegram}
                  disabled={isSendingTelegram}
                  className={`p-2.5 rounded-full shadow-sm transition-colors border ${isSendingTelegram ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-[#0088cc]/10 text-[#0088cc] hover:bg-[#0088cc]/20 border-[#0088cc]/20'}`}
                  title={isSendingTelegram ? "جارٍ الإرسال..." : "إرسال إلى جروب تيليجرام"}
                >
                  {isSendingTelegram ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.11.03-1.84 1.18-5.22 3.47-.49.34-.94.5-1.35.49-.45-.01-1.31-.25-1.95-.46-.78-.26-1.4-.4-1.35-.85.03-.23.35-.47.96-.73 3.75-1.63 6.25-2.71 7.5-3.23 3.56-1.47 4.31-1.73 4.8-1.74.11 0 .35.03.49.14.12.09.15.22.16.32.01.1-.01.23-.03.32z"/></svg>
                  )}
                </button>
                <button
                  onClick={openWhatsAppModal}
                  disabled={isSendingWhatsApp}
                  className={`p-2.5 rounded-full shadow-sm transition-colors border ${isSendingWhatsApp ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 border-[#25D366]/20'}`}
                  title={isSendingWhatsApp ? "جارٍ الإرسال عبر الواتساب..." : "إرسال الفاتورة تلقائياً عبر واتساب"}
                >
                  {isSendingWhatsApp ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 00-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  )}
                </button>
                {!sale.isOffer && (
                  <button
                    onClick={handleSaveAsOffer}
                    disabled={isSavingOffer}
                    className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 rounded-full shadow-2xs transition-all border border-indigo-200 text-xs font-black flex items-center gap-1.5 cursor-pointer hover:shadow-xs"
                    title="حفظ هذه المواد كعرض سعر رسمي في قسم عروض الأسعار"
                  >
                    <span>📑</span>
                    <span>{isSavingOffer ? 'جارٍ الحفظ...' : 'حفظ كعرض سعر'}</span>
                  </button>
                )}
                
                <button
                  onClick={handlePrint}
                  className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-full shadow-sm transition-colors border border-brand-200 cursor-pointer"
                  title="طباعة / حفظ كـ PDF"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                </button>
              </>
            )}
            <button 
              onClick={onClose} 
              className="p-2.5 bg-slate-100 text-slate-600 hover:bg-danger-50 hover:text-danger-600 rounded-full shadow-sm transition-colors border border-slate-200 cursor-pointer"
              title="إغلاق"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>

          <div className="bg-slate-100 w-full mx-auto p-4 md:p-8 flex flex-col gap-8 items-center rounded overflow-y-auto">
            {/* عرض الصفحات المقطعة بشكل متتالي */}
            {invoiceContent.map((page, idx) => (
              <div 
                key={idx} 
                id={idx === 0 ? "invoice-receipt-capture-area" : undefined}
                className="bg-white p-8 relative shadow-sm w-full max-w-[210mm] min-h-[297mm] flex flex-col"
              >
                {/* العلامة المائية للشاشة فقط */}
                {settings?.logoUrl && (
                  <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-20 overflow-hidden">
                    <img src={settings.logoUrl} alt="" className="w-[75%] max-w-[500px] h-auto object-contain filter grayscale" />
                  </div>
                )}
                <div className="relative z-10 flex-grow flex flex-col">
                  {page}
                  {/* ملاحظات العرض */}
                  {sale.isOffer && sale.notes && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <h4 className="text-[11px] font-bold text-slate-800 mb-1">ملاحظات العرض:</h4>
                      <p className="text-[10px] text-slate-600 leading-relaxed whitespace-pre-wrap">{sale.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- Print Version (Portaled outside the app root to avoid all CSS conflicts) --- */}
      {createPortal(
        <div id="print-portal" className="hidden print:block w-full relative m-0 p-0 bg-transparent" dir="rtl">
          {invoiceContent.map((page, idx) => (
            <div key={idx} className="relative bg-white print:break-inside-avoid print:break-after-page min-h-[280mm] p-8 flex flex-col">
              {/* العلامة المائية للطباعة فقط (تتكرر وتتوسط في كل صفحة PDF) */}
              {settings?.logoUrl && (
                <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-20 overflow-hidden">
                  <img 
                    src={settings.logoUrl} 
                    alt="" 
                    className="w-[75%] max-w-[500px] h-auto object-contain filter grayscale" 
                    crossOrigin="anonymous"
                  />
                </div>
              )}
              <div className="relative z-10 flex-grow flex flex-col">
                {page}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}

      {/* Global print styles to hide everything except our print portal */}
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body > :not(#print-portal) {
            display: none !important;
          }
          #print-portal {
            display: block !important;
            width: 100%;
            
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          bdi, [dir="auto"] {
            unicode-bidi: plaintext !important;
          }
        }
      `}</style>
    </>
  );
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('ar-IQ');
}
