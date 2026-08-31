import React, { useState, useEffect, useMemo } from 'react';
import { useSettings } from '../hooks/useSettings';
import { useAuth } from '../hooks/useAuth';
import { getStoreSettings, updateStoreSettings } from '../services/settingsService';
import { useLaborCharges } from '../hooks/useLaborCharges';
import { addLaborCharge, updateLaborCharge, deleteLaborCharge } from '../services/laborChargesService';
import { useUI } from '../contexts/UIContext';
import { uploadProductImage } from '../services/storageService';
import { generateFullBackupBundle, downloadBackupZip, uploadBackupToGoogleDrive } from '../services/googleDriveService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { connectUserGoogleDrive } from '../services/googleDriveClientUpload';
import { useProducts } from '../hooks/useProducts';
import { renameCategoryInProducts } from '../services/productsService';
import { CATEGORIES } from '../models/product';
import { 
  DEFAULT_WHATSAPP_TEMPLATES, 
  testWhatsAppGatewayConnection,
  checkEvolutionConnectionState,
  getEvolutionQRCode,
  logoutEvolutionInstance,
  normalizeServerBaseUrl
} from '../services/whatsappService';

export default function SettingsScreen() {
  const { user } = useAuth();
  const { toast, confirm, backupTask, startBackgroundBackup } = useUI();
  const { settings, loading: settingsLoading } = useSettings();
  const { laborCharges, loading: laborLoading } = useLaborCharges();

  const [activeTab, setActiveTab] = useState('store'); // 'store' | 'users' | 'categories' | 'labor' | 'whatsapp' | 'backup'
  
  // WhatsApp Settings state
  const [whatsappConfig, setWhatsappConfig] = useState({
    whatsappProvider: 'evolution',
    whatsappAutoReminders: true,
    whatsappDefaultDay: 'thursday',
    whatsappReminderTime: '20:00',
    whatsappInstanceId: 'SafeZone',
    whatsappToken: 'SafeZone2026',
    whatsappApiUrl: 'http://13.61.182.143:8080',
    whatsappInvoiceTemplate: DEFAULT_WHATSAPP_TEMPLATES.invoice,
    whatsappDebtReminderTemplate: DEFAULT_WHATSAPP_TEMPLATES.debtReminder,
  });
  const [testPhone, setTestPhone] = useState('');
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [loggingOutWhatsApp, setLoggingOutWhatsApp] = useState(false);
  
  // Live Server & QR Code State
  const [localServerState, setLocalServerState] = useState({
    checking: false,
    connected: false,
    phone: '',
    name: '',
    state: 'unknown',
    serverUrl: 'http://13.61.182.143:8080'
  });

  const [qrModal, setQrModal] = useState({
    isOpen: false,
    loading: false,
    qrBase64: null,
    pairingCode: null,
    error: null,
  });

  const checkLocalServer = async (silent = false) => {
    if (!silent) setLocalServerState(prev => ({ ...prev, checking: true }));
    try {
      const rawApiUrl = (whatsappConfig?.whatsappApiUrl || settings?.whatsappApiUrl || '').trim();
      const baseUrl = normalizeServerBaseUrl(rawApiUrl) || 'http://13.61.182.143:8080';
      const instance = whatsappConfig?.whatsappInstanceId || settings?.whatsappInstanceId || 'SafeZone';
      const token = whatsappConfig?.whatsappToken || settings?.whatsappToken || 'SafeZone2026';
      const provider = whatsappConfig?.whatsappProvider || settings?.whatsappProvider || 'evolution';

      if (provider === 'evolution' || (!rawApiUrl.includes('/messages/chat') && !rawApiUrl.includes('ultramsg.com'))) {
        const evoRes = await checkEvolutionConnectionState({
          baseUrl,
          instanceName: instance,
          apiKey: token
        });

        setLocalServerState({
          checking: false,
          connected: Boolean(evoRes.connected),
          phone: evoRes.phone || '',
          name: evoRes.name || instance,
          state: evoRes.state || 'unknown',
          serverUrl: baseUrl,
        });

        if (evoRes.connected && qrModal.isOpen) {
          setQrModal(prev => ({ ...prev, isOpen: false }));
          toast(`✅ تم مسح الـ QR والاتصال بنجاح برقم: +${evoRes.phone}`, 'success');
        } else if (!silent) {
          if (evoRes.connected) {
            toast(`✅ سيرفر Evolution متصل بنجاح برقم: +${evoRes.phone} (${evoRes.name || instance})`, 'success');
          } else {
            toast(`⚠️ سيرفر Evolution يعمل وبانتظار مسح رمز الـ QR Code`, 'info');
          }
        }
      } else {
        // Fallback for custom / legacy gateway
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(`${baseUrl}/status`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        
        setLocalServerState({
          checking: false,
          connected: Boolean(data.connected),
          phone: data.phone || '',
          name: data.name || '',
          state: data.connected ? 'open' : 'close',
          serverUrl: baseUrl,
        });

        if (!silent) {
          if (data.connected) {
            toast(`✅ سيرفر الواتساب متصل بنجاح برقم: +${data.phone}`, 'success');
          } else {
            toast(`⚠️ السيرفر يعمل وبانتظار مسح رمز الـ QR Code`, 'info');
          }
        }
      }
    } catch (e) {
      setLocalServerState({
        checking: false,
        connected: false,
        phone: '',
        name: '',
        state: 'disconnected',
        serverUrl: whatsappConfig?.whatsappApiUrl || 'http://13.61.182.143:8080',
      });
      if (!silent) {
        toast(`تعذر الوصول لسيرفر الواتساب (${e.message})`, 'error');
      }
    }
  };

  // Live periodic polling when QR modal is open
  useEffect(() => {
    let timer = null;
    if (qrModal.isOpen && !localServerState.connected) {
      timer = setInterval(() => {
        checkLocalServer(true);
      }, 3500);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [qrModal.isOpen, localServerState.connected, whatsappConfig]);

  // Request & Display Live QR Code
  const handleOpenQRCodeModal = async () => {
    setQrModal({ isOpen: true, loading: true, qrBase64: null, pairingCode: null, error: null });
    try {
      const rawApiUrl = (whatsappConfig?.whatsappApiUrl || settings?.whatsappApiUrl || '').trim();
      const baseUrl = normalizeServerBaseUrl(rawApiUrl) || 'http://13.61.182.143:8080';
      const instance = whatsappConfig?.whatsappInstanceId || settings?.whatsappInstanceId || 'SafeZone';
      const token = whatsappConfig?.whatsappToken || settings?.whatsappToken || 'SafeZone2026';

      const qrResult = await getEvolutionQRCode({
        baseUrl,
        instanceName: instance,
        apiKey: token
      });

      if (qrResult.base64 || qrResult.code) {
        setQrModal({
          isOpen: true,
          loading: false,
          qrBase64: qrResult.base64 || qrResult.code,
          pairingCode: qrResult.pairingCode,
          error: null,
        });
      } else {
        // Maybe already connected or generating
        await checkLocalServer(true);
        setQrModal(prev => ({
          ...prev,
          loading: false,
          error: 'تم إنشاء الجلسة، جاري فحص الاتصال...'
        }));
      }
    } catch (err) {
      console.error('Failed to get QR code:', err);
      setQrModal(prev => ({
        ...prev,
        loading: false,
        error: err.message || 'فشل جلب رمز الـ QR Code. تأكد من تشغيل سيرفر Evolution API وعنوان الرابط.'
      }));
    }
  };

  // Logout / Disconnect Instance
  const handleLogoutSession = async () => {
    const confirmed = await confirm({
      title: 'تسجيل الخروج من الواتساب',
      message: 'هل أنت متأكد من رغبتك في تسجيل الخروج وفصل جلسة الواتساب الحالية؟ ستحتاج لمسح رمز الـ QR مرة أخرى لإعادة التوصيل.',
      confirmText: 'نعم، افصل الجلسة',
      cancelText: 'إلغاء',
      isDanger: true,
    });
    if (!confirmed) return;

    setLoggingOutWhatsApp(true);
    try {
      const rawApiUrl = (whatsappConfig?.whatsappApiUrl || settings?.whatsappApiUrl || '').trim();
      const baseUrl = normalizeServerBaseUrl(rawApiUrl) || 'http://13.61.182.143:8080';
      const instance = whatsappConfig?.whatsappInstanceId || settings?.whatsappInstanceId || 'SafeZone';
      const token = whatsappConfig?.whatsappToken || settings?.whatsappToken || 'SafeZone2026';

      await logoutEvolutionInstance({
        baseUrl,
        instanceName: instance,
        apiKey: token
      });

      setLocalServerState(prev => ({ ...prev, connected: false, phone: '', name: '', state: 'close' }));
      toast('تم فصل جلسة الواتساب وتسجيل الخروج بنجاح 👍', 'success');
    } catch (err) {
      toast(`فشل فصل الجلسة: ${err.message}`, 'error');
    } finally {
      setLoggingOutWhatsApp(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'whatsapp') {
      checkLocalServer();
    }
  }, [activeTab]);
  
  // Backup & Google Drive state
  const [backupStats, setBackupStats] = useState(null);
  const [driveConfig, setDriveConfig] = useState({
    serviceAccountJson: '',
    folderId: '12Zp9WDO8dcChWCWxQdmsqUL8SSTMh_fg',
    connectedEmail: '',
    autoDailyBackup: true,
    backupHour: 23,
    backupMinute: 0,
    notifyTelegram: true,
  });
  const [savingDriveConfig, setSavingDriveConfig] = useState(false);
  const [showDriveGuide, setShowDriveGuide] = useState(false);
  const [showFileList, setShowFileList] = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [testingSinglePdf, setTestingSinglePdf] = useState(false);
  
  // Store info state
  const [storeInfo, setStoreInfo] = useState({
    storeName: '',
    address: '',
    description: '',
    logoUrl: null,
    qrCodeUrl: null,
  });
  const [savingStore, setSavingStore] = useState(false);

  // Categories management state
  const { products = [] } = useProducts();
  const [editingCategory, setEditingCategory] = useState({ oldName: '', newName: '' });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [savingCategoryAction, setSavingCategoryAction] = useState(false);

  useEffect(() => {
    if (settings) {
      const initialCats = Array.isArray(settings.categories) && settings.categories.length > 0 
        ? settings.categories 
        : CATEGORIES;

      setStoreInfo({
        storeName: settings.storeName || '',
        address: settings.address || '',
        description: settings.description || '',
        logoUrl: settings.logoUrl || null,
        categories: initialCats,
        telegramBotToken: settings.telegramBotToken || '',
        telegramChatId: settings.telegramChatId || '',
        qrCodeUrl: settings.qrCodeUrl || null,
      });

      setWhatsappConfig({
        whatsappProvider: settings.whatsappProvider || 'evolution',
        whatsappAutoReminders: settings.whatsappAutoReminders !== false,
        whatsappDefaultDay: settings.whatsappDefaultDay || 'thursday',
        whatsappReminderTime: settings.whatsappReminderTime || '20:00',
        whatsappInstanceId: settings.whatsappInstanceId || 'SafeZone',
        whatsappToken: settings.whatsappToken || 'SafeZone2026',
        whatsappApiUrl: settings.whatsappApiUrl || 'http://13.61.182.143:8080',
        whatsappInvoiceTemplate: settings.whatsappInvoiceTemplate || DEFAULT_WHATSAPP_TEMPLATES.invoice,
        whatsappDebtReminderTemplate: settings.whatsappDebtReminderTemplate || DEFAULT_WHATSAPP_TEMPLATES.debtReminder,
      });
    }

    // Load Google Drive config and backup stats
    async function loadBackupData() {
      try {
        const driveDoc = await getDoc(doc(db, 'settings', 'google_drive_config'));
        if (driveDoc.exists()) {
          setDriveConfig(driveDoc.data());
        }
        const statsDoc = await getDoc(doc(db, 'settings', 'backup_stats'));
        if (statsDoc.exists()) {
          setBackupStats(statsDoc.data());
        }
      } catch (e) {
        console.error('Error loading backup settings:', e);
      }
    }
    loadBackupData();
  }, [settings]);

  const handleConnectGoogleDrive = async () => {
    setConnectingOAuth(true);
    try {
      const { email } = await connectUserGoogleDrive();
      setDriveConfig(prev => ({ ...prev, connectedEmail: email }));
      toast(`تم ربط حساب Google Drive بنجاح: ${email} ☁️🎉`, 'success');
    } catch (err) {
      console.error('Google Auth Failed:', err);
      toast(`فشل ربط حساب Google: ${err.message}`, 'error');
    } finally {
      setConnectingOAuth(false);
    }
  };

  const handleSaveDriveConfig = async (e) => {
    e.preventDefault();
    setSavingDriveConfig(true);
    try {
      await setDoc(doc(db, 'settings', 'google_drive_config'), driveConfig, { merge: true });
      toast('تم حفظ إعدادات Google Drive بنجاح!', 'success');
    } catch (err) {
      toast(`فشل حفظ الإعدادات: ${err.message}`, 'error');
    } finally {
      setSavingDriveConfig(false);
    }
  };

  const handleTestSinglePdf = async () => {
    setTestingSinglePdf(true);
    toast('جاري توليد تقرير رأس المال فورياً للتجربة... 📄', 'info');
    try {
      const { fetchFullDatabase } = await import('../services/googleDriveService');
      const { generateCapitalPDF } = await import('../utils/backupPdfGenerator');
      const dbData = await fetchFullDatabase();
      const pdfBlob = await generateCapitalPDF(dbData.products, dbData.drafts, dbData.settings?.store);
      
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'تجربة_رأس_المال_وجرد_المخزون.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast('تم تحميل ملف التجربة بنجاح! افحص جودة الخطوط الآن 🎉', 'success');
    } catch (err) {
      console.error('Test PDF Error:', err);
      toast(`فشل تجربة الملف: ${err.message}`, 'error');
    } finally {
      setTestingSinglePdf(false);
    }
  };

  const handleDownloadLocalBackup = () => {
    startBackgroundBackup('local');
  };

  const handleCloudDriveBackup = async () => {
    const savedToken = sessionStorage.getItem('gdrive_access_token') || localStorage.getItem('gdrive_access_token');
    if (!savedToken && !driveConfig?.serviceAccountJson) {
      try {
        toast('يرجى اختيار حساب Google Drive للمتابعة...', 'info');
        const { connectUserGoogleDrive } = await import('../services/googleDriveClientUpload');
        const res = await connectUserGoogleDrive();
        setDriveConfig(prev => ({ ...prev, connectedEmail: res.email }));
        toast(`تم ربط حساب (${res.email}) بنجاح! جاري رفع النسخة الاحتياطية في الخلفية... ☁️`, 'success');
      } catch (err) {
        toast(`فشل ربط حساب Google: ${err.message}`, 'error');
        return;
      }
    }
    startBackgroundBackup('drive');
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await uploadProductImage(file, true);
      const newStoreInfo = { ...storeInfo, logoUrl: dataUrl };
      setStoreInfo(newStoreInfo);
      
      // Auto-save immediately
      await updateStoreSettings(newStoreInfo);
      toast('تم رفع وحفظ الشعار بنجاح!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleQrCodeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await uploadProductImage(file, true);
      const newStoreInfo = { ...storeInfo, qrCodeUrl: dataUrl };
      setStoreInfo(newStoreInfo);
      
      // Auto-save immediately to prevent user error
      await updateStoreSettings(newStoreInfo);
      toast('تم رفع وحفظ الـ QR Code بنجاح!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleSaveStoreInfo = async (e) => {
    e.preventDefault();
    setSavingStore(true);
    try {
      await updateStoreSettings(storeInfo);
      toast('تم حفظ إعدادات المتجر بنجاح!', 'success');
    } catch (err) {
      toast(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setSavingStore(false);
    }
  };

  const handleSaveWhatsAppConfig = async (e) => {
    if (e) e.preventDefault();
    setSavingWhatsApp(true);
    try {
      let cleanApiUrl = String(whatsappConfig.whatsappApiUrl || '').trim().replace(/[,;\s]+$/, '');
      if (whatsappConfig.whatsappProvider === 'custom' && cleanApiUrl.startsWith('http') && !cleanApiUrl.includes('/messages/')) {
        cleanApiUrl = cleanApiUrl.replace(/\/+$/, '') + '/messages/chat';
      }

      const updatedConfig = {
        ...whatsappConfig,
        whatsappApiUrl: cleanApiUrl,
      };
      setWhatsappConfig(updatedConfig);

      const updatedStoreInfo = {
        ...storeInfo,
        ...updatedConfig,
      };
      setStoreInfo(updatedStoreInfo);
      await updateStoreSettings(updatedStoreInfo);
      toast('تم حفظ إعدادات وقوالب الواتساب بنجاح! 📱✨', 'success');
      // فحص فوري لحالة الاتصال بالسيرفر الجديد
      checkLocalServer(true);
    } catch (err) {
      toast(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleTestWhatsAppMessage = async () => {
    if (!testPhone.trim()) {
      toast('يرجى كتابة رقم هاتف لإرسال الرسالة التجريبية إليه', 'warning');
      return;
    }
    setTestingWhatsApp(true);
    try {
      await testWhatsAppGatewayConnection(testPhone, {
        ...storeInfo,
        ...whatsappConfig
      });
      toast('تم إرسال الرسالة التجريبية بنجاح! تفقد الواتساب على هاتفك 🚀', 'success');
    } catch (err) {
      toast(`فشل الإرسال: ${err.message}`, 'error');
    } finally {
      setTestingWhatsApp(false);
    }
  };

  const [activatingTelegram, setActivatingTelegram] = useState(false);

  const handleActivateTelegramWebhook = async () => {
    const token = (storeInfo.telegramBotToken || '').trim();
    if (!token) {
      toast('يرجى إدخال توكن البوت أولاً (Bot Token)', 'warning');
      return;
    }

    setActivatingTelegram(true);
    try {
      const webhookUrl = `${window.location.origin}/api/telegram-webhook`;
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.description || 'فشل ضبط الويب هوك');
      }

      // Also set commands
      await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'pos', description: '🛒 فتح نقطة البيع المصغرة (Mini App)' },
            { command: 'offer', description: '📑 إنشاء وتصدير عرض سعر رسمي' },
            { command: 'income', description: '💰 تقرير الدخل والصندوق وحساب اليوم' },
            { command: 'debtors', description: '👥 قائمة ديون العملاء (المدينون)' },
            { command: 'creditors', description: '🏢 ديون الموردين (الدائنون)' },
            { command: 'shortages', description: '📊 تقرير النواقص في المخزون' },
            { command: 'start', description: '🌟 القائمة الرئيسية والمساعدة' }
          ]
        })
      }).catch(() => {});

      // Also set Chat Menu Button for bottom left button in Telegram
      await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_button: {
            type: 'web_app',
            text: '🛒 نقطة البيع (POS)',
            web_app: {
              url: `${window.location.origin}/?portal=pos`
            }
          }
        })
      }).catch(() => {});

      // Save token to Firestore settings
      try {
        await updateStoreSettings({ telegramBotToken: token });
      } catch (e) {}

      toast('تم نقل وربط بوت التليجرام مع هذا المشروع بنجاح! 🤖🎉 جرب إرسال /start الآن في البوت.', 'success');
    } catch (err) {
      toast(`فشل تفعيل البوت: ${err.message}`, 'error');
    } finally {
      setActivatingTelegram(false);
    }
  };

  const handleAddLabor = async (e) => {
    e.preventDefault();
    if (!newLabor.name || !newLabor.price) {
      toast('الرجاء إدخال اسم الخدمة والسعر', 'error');
      return;
    }
    try {
      await addLaborCharge({ name: newLabor.name, price: Number(newLabor.price) });
      setNewLabor({ name: '', price: '' });
      toast('تمت إضافة الخدمة بنجاح', 'success');
    } catch (err) {
      toast(`فشل إضافة الخدمة: ${err.message}`, 'error');
    }
  };

  const handleUpdateLabor = async (e) => {
    e.preventDefault();
    try {
      await updateLaborCharge(editingLaborId, { name: editLabor.name, price: Number(editLabor.price) });
      setEditingLaborId(null);
      toast('تم تحديث الخدمة بنجاح', 'success');
    } catch (err) {
      toast(`فشل تحديث الخدمة: ${err.message}`, 'error');
    }
  };

  const handleDeleteLabor = (id) => {
    confirm('حذف الخدمة', 'هل أنت متأكد أنك تريد حذف هذه الخدمة؟', async () => {
      try {
        await deleteLaborCharge(id);
        toast('تم حذف الخدمة', 'success');
      } catch (err) {
        toast(`فشل الحذف: ${err.message}`, 'error');
      }
    });
  };

  // Helper to get all categories (defaults + custom + existing in products - deleted)
  const currentCategoriesList = useMemo(() => {
    const customCategories = storeInfo.categories || settings?.categories || [];
    const deletedList = settings?.deletedCategories || [];
    
    // Combine base CATEGORIES + custom added categories + categories in products
    const combined = new Set([
      ...CATEGORIES,
      ...customCategories,
      ...products.map(p => p.cameraType || p.category).filter(Boolean)
    ]);

    // Filter out explicitly deleted categories (only if they have 0 products)
    deletedList.forEach(delCat => {
      const hasProducts = products.some(p => (p.cameraType === delCat || p.category === delCat));
      if (!hasProducts) {
        combined.delete(delCat);
      }
    });

    return Array.from(combined).filter(Boolean);
  }, [storeInfo.categories, settings?.categories, settings?.deletedCategories, products]);

  // Filtered categories for search
  const displayedCategories = useMemo(() => {
    if (!categorySearch.trim()) return currentCategoriesList;
    const term = categorySearch.toLowerCase().trim();
    return currentCategoriesList.filter(c => c.toLowerCase().includes(term));
  }, [currentCategoriesList, categorySearch]);

  // Add new category
  const handleAddCategory = async (e) => {
    if (e) e.preventDefault();
    const val = newCategoryName.trim();
    if (!val) {
      toast('يرجى كتابة اسم القسم', 'warning');
      return;
    }
    if (currentCategoriesList.some(c => c.toLowerCase() === val.toLowerCase())) {
      toast('هذا القسم موجود مسبقاً!', 'error');
      return;
    }

    setSavingCategoryAction(true);
    try {
      const updatedCategories = [...currentCategoriesList, val];
      const deletedCategories = (settings?.deletedCategories || []).filter(c => c.toLowerCase() !== val.toLowerCase());
      const newStoreInfo = { 
        ...storeInfo, 
        categories: updatedCategories,
        deletedCategories
      };
      setStoreInfo(newStoreInfo);
      await updateStoreSettings(newStoreInfo);
      setNewCategoryName('');
      toast(`تمت إضافة قسم «${val}» بنجاح! 🎉`, 'success');
    } catch (err) {
      toast(`فشل إضافة القسم: ${err.message}`, 'error');
    } finally {
      setSavingCategoryAction(false);
    }
  };

  // Save edited category name
  const handleSaveEditCategory = async (oldName, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed) {
      toast('يرجى إدخال اسم القسم', 'error');
      return;
    }
    if (trimmed.toLowerCase() === oldName.toLowerCase()) {
      setEditingCategory({ oldName: '', newName: '' });
      return;
    }
    if (currentCategoriesList.some(c => c.toLowerCase() === trimmed.toLowerCase() && c.toLowerCase() !== oldName.toLowerCase())) {
      toast('يوجد قسم آخر بنفس هذا الاسم بالفعل!', 'error');
      return;
    }

    setSavingCategoryAction(true);
    try {
      // 1. Update in settings
      const updatedCategories = currentCategoriesList.map(c => c === oldName ? trimmed : c);
      const deletedCategories = Array.from(new Set([...(settings?.deletedCategories || []), oldName])).filter(c => c !== trimmed);
      
      const newStoreInfo = { 
        ...storeInfo, 
        categories: updatedCategories,
        deletedCategories
      };
      setStoreInfo(newStoreInfo);
      await updateStoreSettings(newStoreInfo);

      // 2. Update in all products in Firestore
      const count = await renameCategoryInProducts(oldName, trimmed);

      setEditingCategory({ oldName: '', newName: '' });
      toast(`تم تعديل اسم القسم إلى «${trimmed}» وتحديث ${count} منتج مرتبط به بنجاح! ✨`, 'success');
    } catch (err) {
      toast(`فشل تعديل القسم: ${err.message}`, 'error');
    } finally {
      setSavingCategoryAction(false);
    }
  };

  // Delete category with guard if products exist
  const handleDeleteCategory = (cat) => {
    const linkedProducts = products.filter(p => (p.cameraType === cat || p.category === cat));
    if (linkedProducts.length > 0) {
      toast(`⚠️ لا يمكن حذف قسم «${cat}» لأنه يحتوي على ${linkedProducts.length} منتج مرتبطة به! يرجى نقل أو تعديل المنتجات أولاً.`, 'error');
      return;
    }

    confirm('حذف القسم', `هل أنت متأكد من حذف قسم «${cat}» نهائياً؟`, async () => {
      setSavingCategoryAction(true);
      try {
        const updatedCategories = currentCategoriesList.filter(c => c !== cat);
        const deletedCategories = Array.from(new Set([...(settings?.deletedCategories || []), cat]));
        
        const newStoreInfo = { 
          ...storeInfo, 
          categories: updatedCategories,
          deletedCategories
        };
        setStoreInfo(newStoreInfo);
        await updateStoreSettings(newStoreInfo);
        toast(`تم حذف قسم «${cat}» بنجاح`, 'success');
      } catch (err) {
        toast(`فشل حذف القسم: ${err.message}`, 'error');
      } finally {
        setSavingCategoryAction(false);
      }
    });
  };

  // Authorized Emails (Whitelist) state
  const [newAllowedEmail, setNewAllowedEmail] = useState('');
  const [savingAllowedEmail, setSavingAllowedEmail] = useState(false);
  const allowedEmailsList = useMemo(() => {
    return Array.isArray(settings?.allowedEmails) ? settings.allowedEmails : [];
  }, [settings]);
  const isWhitelistEnforced = settings?.enforceEmailWhitelist !== false;

  const handleAddAllowedEmail = async (e) => {
    if (e) e.preventDefault();
    const clean = newAllowedEmail.trim().toLowerCase();
    if (!clean) {
      toast('يرجى كتابة البريد الإلكتروني', 'warning');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clean)) {
      toast('يرجى كتابة بريد إلكتروني صالح (مثال: staff@gmail.com)', 'warning');
      return;
    }
    if (allowedEmailsList.map(em => em.toLowerCase()).includes(clean)) {
      toast('هذا البريد مضاف بالفعل إلى قائمة الموظفين المصرح لهم', 'info');
      return;
    }

    setSavingAllowedEmail(true);
    try {
      const updatedList = [...allowedEmailsList, clean];
      await updateStoreSettings({ allowedEmails: updatedList });
      setNewAllowedEmail('');
      toast(`تمت إضافة (${clean}) إلى قائمة الموظفين المصرح لهم بنجاح! 👥✅`, 'success');
    } catch (err) {
      toast(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setSavingAllowedEmail(false);
    }
  };

  const handleAddCurrentAdminEmail = async () => {
    if (!user?.email) {
      toast('لم يتم التعرف على بريدك الحالي', 'warning');
      return;
    }
    const clean = user.email.trim().toLowerCase();
    if (allowedEmailsList.map(em => em.toLowerCase()).includes(clean)) {
      toast('بريدك الحالي مضاف بالفعل في القائمة', 'info');
      return;
    }
    setSavingAllowedEmail(true);
    try {
      const updatedList = [...allowedEmailsList, clean];
      await updateStoreSettings({ allowedEmails: updatedList });
      toast(`تمت إضافة بريدك (${clean}) إلى القائمة المعتمدة بنجاح! 👥✅`, 'success');
    } catch (err) {
      toast(`فشل الحفظ: ${err.message}`, 'error');
    } finally {
      setSavingAllowedEmail(false);
    }
  };

  const handleRemoveAllowedEmail = async (emailToRemove) => {
    const ok = await confirm({
      title: 'حذف بريد مصرح له',
      message: `هل أنت متأكد من إزالة البريد (${emailToRemove}) من قائمة المصرح لهم بالدخول؟ لن يتمكن من تسجيل الدخول بعد الآن.`
    });
    if (!ok) return;

    try {
      const updatedList = allowedEmailsList.filter(em => em.toLowerCase() !== emailToRemove.toLowerCase());
      await updateStoreSettings({ allowedEmails: updatedList });
      toast(`تم حذف (${emailToRemove}) من القائمة 🗑️`, 'info');
    } catch (err) {
      toast(`فشل الحذف: ${err.message}`, 'error');
    }
  };

  const handleToggleWhitelistEnforce = async () => {
    try {
      const nextVal = !isWhitelistEnforced;
      await updateStoreSettings({ enforceEmailWhitelist: nextVal });
      toast(nextVal ? 'تم تفعيل تقييد الدخول بالإيميلات المصرح لها فقط 🔒' : 'تم تعطيل تقييد الدخول (مفتوح للجميع) 🔓', 'info');
    } catch (err) {
      toast(`فشل التعديل: ${err.message}`, 'error');
    }
  };

  if (settingsLoading || laborLoading) return <div className="p-8 text-center text-ink-500">جارٍ التحميل...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-brand-100 min-h-full" dir="rtl">
      <div className="border-b border-brand-100 flex p-4 gap-4 flex-wrap">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors ${activeTab === 'store' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          معلومات المتجر
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-xs' : 'text-ink-600 hover:bg-ink-50'}`}
        >
          <span>👥</span>
          <span>الموظفين المصرح لهم (Whitelist)</span>
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors ${activeTab === 'categories' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          الأقسام (التصنيفات)
        </button>
        <button
          onClick={() => setActiveTab('labor')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors ${activeTab === 'labor' ? 'bg-brand-50 text-brand-700' : 'text-ink-500 hover:bg-ink-50'}`}
        >
          أجور العمل والخدمات
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'whatsapp' ? 'bg-emerald-600 text-white shadow-xs' : 'text-ink-600 hover:bg-ink-50'}`}
        >
          <span>📱</span>
          <span>الواتساب وتذكير الديون</span>
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${activeTab === 'backup' ? 'bg-brand-600 text-white shadow-xs' : 'text-ink-600 hover:bg-ink-50'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          النسخ الاحتياطي والسحابي ☁️
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'store' && (
          <form onSubmit={handleSaveStoreInfo} className="max-w-2xl space-y-6">
            <div className="flex gap-6">
              <div className="flex-1">
                <label className="block text-sm font-bold text-ink-700 mb-1">اسم المتجر</label>
                <input
                  type="text"
                  value={storeInfo.storeName}
                  onChange={(e) => setStoreInfo({ ...storeInfo, storeName: e.target.value })}
                  className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="مثال: المنطقة الآمنة للأنظمة الأمنية"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-bold text-ink-700 mb-1">العنوان / المحافظة</label>
                <input
                  type="text"
                  value={storeInfo.address}
                  onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                  className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="مثال: بغداد - شارع الصناعة"
                />
              </div>
            </div>

            <div className="flex gap-6 items-center">
              <div className="flex-1">
                <label className="block text-sm font-bold text-ink-700 mb-1">شعار المتجر (Logo)</label>
                <div className="flex items-center gap-4">
                  {storeInfo.logoUrl && (
                    <img src={storeInfo.logoUrl} alt="Store Logo" className="h-16 w-16 object-contain rounded-lg border border-brand-200 p-1" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                  />
                </div>
              </div>
              
              <div className="flex-1">
                <label className="block text-sm font-bold text-ink-700 mb-1">رمز الـ QR Code (للفاتورة)</label>
                <div className="flex items-center gap-4">
                  {storeInfo.qrCodeUrl && (
                    <img src={storeInfo.qrCodeUrl} alt="QR Code" className="h-16 w-16 object-contain rounded-lg border border-brand-200 p-1" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrCodeUpload}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-ink-700 mb-1">وصف المتجر أو ملاحظات الفاتورة</label>
              <textarea
                value={storeInfo.description}
                onChange={(e) => setStoreInfo({ ...storeInfo, description: e.target.value })}
                className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none h-24"
                placeholder="هذا الوصف سيظهر أسفل الفاتورة..."
              ></textarea>
            </div>

            <div className="pt-4 border-t border-brand-100">
              <button
                type="submit"
                disabled={savingStore}
                className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-6 py-2 rounded-lg disabled:opacity-50"
              >
                {savingStore ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'categories' && (
          <div className="max-w-3xl space-y-6">
            {/* Header & Add Category Card */}
            <div className="bg-brand-50/70 p-5 rounded-2xl border border-brand-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📁</span>
                  <h3 className="font-bold text-ink-900 text-base">إضافة قسم (تصنيف) جديد</h3>
                </div>
                <span className="bg-brand-100 text-brand-800 text-xs font-bold px-3 py-1 rounded-full border border-brand-200">
                  إجمالي الأقسام: {currentCategoriesList.length}
                </span>
              </div>
              <form onSubmit={handleAddCategory} className="flex gap-3">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 border border-brand-200 bg-white rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none font-bold text-ink-800 placeholder-ink-400"
                  placeholder="مثال: أجهزة بصمة، كاميرات طاقة شمسية..."
                />
                <button
                  type="submit"
                  disabled={savingCategoryAction || !newCategoryName.trim()}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-2 cursor-pointer shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  <span>إضافة قسم</span>
                </button>
              </form>
            </div>

            {/* Categories Table / List Card */}
            <div className="bg-white rounded-2xl border border-ink-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-ink-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-ink-50/50">
                <h3 className="font-bold text-ink-900 text-sm flex items-center gap-2">
                  <span>قائمة الأقسام والتصنيفات</span>
                  <span className="text-xs text-ink-500 font-normal">({displayedCategories.length} من {currentCategoriesList.length})</span>
                </h3>
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="بحث في الأقسام..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-ink-200 rounded-lg outline-none focus:ring-1 focus:ring-brand-500 font-medium"
                  />
                  {categorySearch && (
                    <button
                      onClick={() => setCategorySearch('')}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {displayedCategories.length === 0 ? (
                <div className="p-8 text-center text-ink-400 text-sm">
                  لا توجد أقسام مطابقة للبحث
                </div>
              ) : (
                <div className="divide-y divide-ink-100 max-h-[500px] overflow-y-auto">
                  {displayedCategories.map((cat, idx) => {
                    const productCount = products.filter(p => (p.cameraType === cat || p.category === cat)).length;
                    const isEditing = editingCategory.oldName === cat;

                    return (
                      <div key={cat} className="p-3.5 flex items-center justify-between gap-3 hover:bg-ink-50/60 transition-colors">
                        {isEditing ? (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={editingCategory.newName}
                              onChange={(e) => setEditingCategory(prev => ({ ...prev, newName: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEditCategory(cat, editingCategory.newName);
                                if (e.key === 'Escape') setEditingCategory({ oldName: '', newName: '' });
                              }}
                              autoFocus
                              className="flex-1 border border-brand-500 rounded-lg px-3 py-1.5 text-sm font-bold bg-white outline-none focus:ring-2 focus:ring-brand-500"
                            />
                            <button
                              onClick={() => handleSaveEditCategory(cat, editingCategory.newName)}
                              disabled={savingCategoryAction}
                              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                            >
                              حفظ
                            </button>
                            <button
                              onClick={() => setEditingCategory({ oldName: '', newName: '' })}
                              className="px-3 py-1.5 text-xs font-bold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-lg transition-colors cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-xs font-mono font-bold text-ink-400 w-6 text-center">{idx + 1}</span>
                              <span className="text-sm font-bold text-ink-900 truncate" title={cat}>{cat}</span>
                              {productCount > 0 ? (
                                <span className="px-2 py-0.5 text-[11px] font-bold bg-brand-50 text-brand-700 rounded-md border border-brand-200 shrink-0">
                                  {productCount} منتج مرتبط
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-500 rounded-md shrink-0">
                                  0 منتج (فارغ)
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => setEditingCategory({ oldName: cat, newName: cat })}
                                className="p-1.5 text-ink-500 hover:text-brand-700 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                                title="تعديل اسم القسم"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>

                              <button
                                onClick={() => handleDeleteCategory(cat)}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  productCount > 0
                                    ? 'text-ink-400 hover:text-danger-600 hover:bg-danger-50'
                                    : 'text-danger-600 hover:text-danger-800 hover:bg-danger-50'
                                }`}
                                title={productCount > 0 ? `لا يمكن الحذف (يحتوي على ${productCount} منتج مرتبط)` : 'حذف القسم'}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Telegram Settings */}
            <div className="p-5 bg-white border border-brand-200 rounded-2xl shadow-sm">
              <h3 className="font-bold text-ink-900 mb-3 flex items-center gap-2 text-sm">
                <span>🤖 إعدادات ربط تيليجرام (Telegram)</span>
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-ink-700 mb-1">توكن البوت (Bot Token)</label>
                  <input
                    type="text"
                    value={storeInfo.telegramBotToken || ''}
                    onChange={(e) => setStoreInfo({ ...storeInfo, telegramBotToken: e.target.value })}
                    className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none text-left font-mono text-xs"
                    dir="ltr"
                    placeholder="مثال: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-ink-700 mb-1">معرف الجروب (Chat ID)</label>
                  <input
                    type="text"
                    value={storeInfo.telegramChatId || ''}
                    onChange={(e) => setStoreInfo({ ...storeInfo, telegramChatId: e.target.value })}
                    className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none text-left font-mono text-xs"
                    dir="ltr"
                    placeholder="مثال: -1001234567890"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={activatingTelegram || !storeInfo.telegramBotToken}
                    onClick={handleActivateTelegramWebhook}
                    className="w-full py-2.5 px-4 bg-[#229ED9] hover:bg-[#1E88C7] text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <span>{activatingTelegram ? 'جارٍ ربط البوت... ⏳' : '🔗 تفعيل وربط البوت مع هذا السيرفر (Set Webhook)'}</span>
                  </button>
                  <p className="text-[11px] text-ink-500 mt-1.5 text-center">
                    اضغط هنا لتوجيه رسائل البوت وأمر <code>/pos</code> و <code>/offer</code> إلى هذا المشروع تلقائياً.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button onClick={(e) => handleSaveStoreInfo(e)} className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-8 rounded-xl shadow-sm transition-colors text-lg">
                حفظ التغييرات
              </button>
            </div>
          </div>
        )}

        {activeTab === 'labor' && (
          <div className="max-w-3xl space-y-6">
            <form onSubmit={handleAddLabor} className="bg-brand-50 p-4 rounded-xl border border-brand-100 flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-bold text-ink-700 mb-1">اسم الخدمة</label>
                <input
                  type="text"
                  value={newLabor.name}
                  onChange={(e) => setNewLabor({ ...newLabor, name: e.target.value })}
                  className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="نصب كاميرا + كيبل"
                />
              </div>
              <div className="w-1/3">
                <label className="block text-sm font-bold text-ink-700 mb-1">السعر (دينار)</label>
                <input
                  type="number"
                  value={newLabor.price}
                  onChange={(e) => setNewLabor({ ...newLabor, price: e.target.value })}
                  className="w-full border border-brand-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
                  placeholder="15000"
                />
              </div>
              <button type="submit" className="bg-brand-600 hover:bg-brand-700 text-white font-bold px-6 py-2 rounded-lg h-10">
                إضافة
              </button>
            </form>

            <div className="border border-brand-200 rounded-xl overflow-hidden">
              <table className="w-full text-right">
                <thead className="bg-brand-50 text-ink-600 text-sm">
                  <tr>
                    <th className="p-3 font-bold">اسم الخدمة</th>
                    <th className="p-3 font-bold">السعر</th>
                    <th className="p-3 font-bold text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-100">
                  {laborCharges.map(labor => (
                    <tr key={labor.id} className="hover:bg-brand-50/50">
                      {editingLaborId === labor.id ? (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={editLabor.name}
                              onChange={(e) => setEditLabor({ ...editLabor, name: e.target.value })}
                              className="w-full border border-brand-200 rounded px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={editLabor.price}
                              onChange={(e) => setEditLabor({ ...editLabor, price: e.target.value })}
                              className="w-full border border-brand-200 rounded px-2 py-1"
                            />
                          </td>
                          <td className="p-2 flex items-center justify-center gap-2">
                            <button onClick={handleUpdateLabor} className="text-emerald-600 font-bold px-2 py-1 bg-emerald-50 rounded hover:bg-emerald-100">حفظ</button>
                            <button onClick={() => setEditingLaborId(null)} className="text-ink-500 font-bold px-2 py-1 bg-ink-100 rounded hover:bg-ink-200">إلغاء</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 text-ink-900 font-medium">{labor.name}</td>
                          <td className="p-3 text-brand-600 font-bold">{Number(labor.price || 0).toLocaleString()}</td>
                          <td className="p-3 flex items-center justify-center gap-3">
                            <button
                              onClick={() => {
                                setEditingLaborId(labor.id);
                                setEditLabor({ name: labor.name, price: labor.price });
                              }}
                              className="text-brand-600 hover:text-brand-800"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                            <button onClick={() => handleDeleteLabor(labor.id)} className="text-danger-500 hover:text-danger-700">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {laborCharges.length === 0 && (
                    <tr>
                      <td colSpan="3" className="p-6 text-center text-ink-500">لا توجد خدمات مضافة حالياً.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: WhatsApp & Debt Reminders */}
        {/* Tab: WhatsApp & Debt Reminders */}
        {activeTab === 'whatsapp' && (
          <div className="max-w-4xl space-y-6">
            
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-2xl">
                    📱
                  </div>
                  <div>
                    <h2 className="text-xl font-black">إدارة ربط الواتساب (Evolution API v2) وجدولة تذكير الديون</h2>
                    <p className="text-emerald-100 text-xs mt-0.5">
                      ربط حساب واتساب المتجر على سيرفر AWS لإرسال الفواتير ومستندات PDF وتذكيرات الديون تلقائياً بأعلى استقرار
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Evolution API v2 Live Connection & QR Code Card */}
            <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span className="text-emerald-600 font-black">1️⃣</span>
                  <span>حالة اتصال خادم الواتساب (Evolution API Gateway)</span>
                </h3>
                <span className="bg-emerald-50 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full border border-emerald-200">
                  سيرفر AWS السحابي ☁️
                </span>
              </div>

              {/* Provider Selector */}
              <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl max-w-md">
                <button
                  type="button"
                  onClick={() => setWhatsappConfig(prev => ({ ...prev, whatsappProvider: 'evolution' }))}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    whatsappConfig.whatsappProvider !== 'custom' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ⚡ Evolution API v2 (موصى به)
                </button>
                <button
                  type="button"
                  onClick={() => setWhatsappConfig(prev => ({ ...prev, whatsappProvider: 'custom' }))}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    whatsappConfig.whatsappProvider === 'custom' 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  🛠️ سيرفر مخصص / Gateway قديم
                </button>
              </div>

              {/* Live Status Banner */}
              {localServerState.connected ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <span className="text-3xl animate-pulse">🟢</span>
                    <div>
                      <strong className="text-emerald-950 block text-sm font-black">
                        خادم Evolution API متصل بنجاح وجاهز للإرسال! ✅
                      </strong>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-emerald-800 font-mono font-bold bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                          الرقم: +{localServerState.phone || 'متصل'}
                        </span>
                        <span className="text-xs text-emerald-700 font-bold">
                          الجلسة: {whatsappConfig.whatsappInstanceId || 'SafeZone'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => checkLocalServer(false)}
                      disabled={localServerState.checking}
                      className="text-xs bg-white border border-emerald-300 px-3.5 py-2 rounded-xl text-emerald-800 font-bold hover:bg-emerald-100 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                    >
                      {localServerState.checking ? 'جارٍ الفحص...' : '🔄 فحص الاتصال'}
                    </button>
                    <button
                      type="button"
                      onClick={handleLogoutSession}
                      disabled={loggingOutWhatsApp}
                      className="text-xs bg-red-50 text-red-700 border border-red-200 px-3.5 py-2 rounded-xl font-bold hover:bg-red-100 transition-all cursor-pointer"
                    >
                      {loggingOutWhatsApp ? 'جارٍ الفصل...' : '🚪 قطع الاتصال'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <span className="text-3xl">🟡</span>
                    <div>
                      <strong className="text-amber-950 block text-sm font-black">
                        بانتظار مسح رمز الـ QR Code لربط الواتساب
                      </strong>
                      <span className="text-xs text-amber-800 block mt-0.5">
                        انقر على الزر لمسح رمز الـ QR Code مباشرة من هذه الشاشة بهاتفك
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => checkLocalServer(false)}
                      disabled={localServerState.checking}
                      className="text-xs bg-white border border-amber-300 px-3 py-2 rounded-xl text-amber-800 font-bold hover:bg-amber-100 cursor-pointer"
                    >
                      {localServerState.checking ? 'جارٍ الفحص...' : '🔄 فحص الحالة'}
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenQRCodeModal}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>📱 مسح رمز الـ QR Code</span>
                    </button>
                  </div>
                </div>
              )}

              {/* API Credentials Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رابط سيرفر AWS (Server URL) *
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.whatsappApiUrl}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappApiUrl: e.target.value })}
                    placeholder="http://13.61.182.143:8080"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-left focus:ring-2 focus:ring-emerald-500 outline-none"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">رابط سيرفر أمازون AWS أو النطاق السحابي</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الجلسة (Instance Name) *
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.whatsappInstanceId}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappInstanceId: e.target.value })}
                    placeholder="SafeZone"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-left focus:ring-2 focus:ring-emerald-500 outline-none"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">اسم الجلسة في Evolution API (مثلاً: SafeZone)</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    مفتاح الأمان (API Key / Token) *
                  </label>
                  <input
                    type="text"
                    value={whatsappConfig.whatsappToken}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappToken: e.target.value })}
                    placeholder="SafeZone2026"
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-left focus:ring-2 focus:ring-emerald-500 outline-none"
                    dir="ltr"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">الرمز السري المضبوط في الخادم</p>
                </div>
              </div>

              {/* Test Message Box */}
              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="w-full sm:w-auto flex-1">
                  <label className="block text-xs font-bold text-emerald-900 mb-1">
                    🧪 تجربة الاتصال وإرسال رسالة اختبار إلى هاتفك:
                  </label>
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="اكتب رقم هاتفك (مثال: 07701234567)..."
                    className="w-full sm:w-72 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs font-mono text-left bg-white outline-none"
                    dir="ltr"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTestWhatsAppMessage}
                  disabled={testingWhatsApp || !testPhone.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {testingWhatsApp ? 'جارٍ الإرسال والتجربة...' : 'إرسال رسالة تجريبية الآن 🚀'}
                </button>
              </div>
            </div>

            {/* QR Code Scanner Interactive Modal */}
            {qrModal.isOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
                <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📱</span>
                      <h3 className="font-black text-slate-900 text-base">مسح رمز الـ QR Code للواتساب</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setQrModal({ ...qrModal, isOpen: false })}
                      className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <p className="text-xs text-slate-600">
                    افتح تطبيق الواتساب على هاتفك ⬅️ <strong>الأجهزة المرتبطة (Linked Devices)</strong> ⬅️ <strong>ربط جهاز</strong> ثم امسح الكود التالي:
                  </p>

                  {/* QR Image Box */}
                  <div className="flex flex-col items-center justify-center p-4 bg-slate-50 border-2 border-dashed border-emerald-300 rounded-2xl min-h-[260px]">
                    {qrModal.loading ? (
                      <div className="space-y-3">
                        <div className="animate-spin text-3xl">⏳</div>
                        <p className="text-xs text-slate-600 font-bold">جاري جلب رمز الـ QR Code من سيرفر AWS...</p>
                      </div>
                    ) : qrModal.error ? (
                      <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl space-y-2">
                        <span className="text-xl block">⚠️</span>
                        <p className="font-bold">{qrModal.error}</p>
                        <button
                          type="button"
                          onClick={handleOpenQRCodeModal}
                          className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg text-xs hover:bg-red-700 cursor-pointer"
                        >
                          إعادة المحاولة
                        </button>
                      </div>
                    ) : qrModal.qrBase64 ? (
                      <div className="space-y-3">
                        <img 
                          src={qrModal.qrBase64} 
                          alt="WhatsApp QR Code" 
                          className="w-56 h-56 mx-auto rounded-xl shadow-md border border-slate-200 bg-white p-2"
                        />
                        <div className="flex items-center justify-center gap-2 text-[11px] text-emerald-700 font-bold animate-pulse">
                          <span>🔄</span>
                          <span>بانتظار المسح من الهاتف... (فحص تلقائي)</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">لا يوجد رمز حالياً</p>
                    )}
                  </div>

                  {qrModal.pairingCode && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-[11px] text-slate-600 block mb-1">أو استخدم كود الاقتران (Pairing Code):</span>
                      <strong className="text-base font-mono text-emerald-800 tracking-wider select-all">{qrModal.pairingCode}</strong>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleOpenQRCodeModal}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2.5 rounded-xl cursor-pointer"
                    >
                      🔄 إعادة توليد الـ QR
                    </button>
                    <button
                      type="button"
                      onClick={() => setQrModal({ ...qrModal, isOpen: false })}
                      className="text-xs bg-slate-800 hover:bg-slate-900 text-white font-bold px-5 py-2.5 rounded-xl cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Scheduled Debt Reminders Settings Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span className="text-emerald-600 font-black">2️⃣</span>
                  <span>جدولة تذكير الديون التلقائية (Scheduled Reminders)</span>
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-sm font-bold text-slate-900 block">
                    تفعيل التذكير التلقائي الأسبوعي بالديون
                  </span>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    يقوم السيرفر بفحص كافة العملاء المدينين وإرسال رسائل التذكير لهم تلقائياً في الخلفية في اليوم المحدد
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappConfig.whatsappAutoReminders}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappAutoReminders: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    يوم التذكير الأسبوعي الافتراضي لجميع العملاء
                  </label>
                  <select
                    value={whatsappConfig.whatsappDefaultDay}
                    onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappDefaultDay: e.target.value })}
                    className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="thursday">كل يوم خميس (الافتراضي والموصى به)</option>
                    <option value="friday">كل يوم جمعة</option>
                    <option value="saturday">كل يوم سبت</option>
                    <option value="sunday">كل يوم أحد</option>
                    <option value="monday">كل يوم إثنين</option>
                    <option value="tuesday">كل يوم ثلاثاء</option>
                    <option value="wednesday">كل يوم أربعاء</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    يمكنك أيضاً تخصيص موعد مختلف أو استثنائي لأي عميل محدد من داخل ملفه في شاشة العملاء.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    وقت الإرسال الافتراضي (الساعة والدقيقة) ⏰
                  </label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { time: '10:00', label: '10:00 ص' },
                        { time: '14:00', label: '02:00 م' },
                        { time: '17:00', label: '05:00 م' },
                        { time: '20:00', label: '08:00 م (ساعة 8)' },
                        { time: '21:30', label: '09:30 م' }
                      ].map((preset) => (
                        <button
                          key={preset.time}
                          type="button"
                          onClick={() => setWhatsappConfig({ ...whatsappConfig, whatsappReminderTime: preset.time })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all border cursor-pointer ${
                            (whatsappConfig.whatsappReminderTime || '20:00') === preset.time
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 font-bold">أو وقت مخصص:</span>
                      <input
                        type="time"
                        value={whatsappConfig.whatsappReminderTime || '20:00'}
                        onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappReminderTime: e.target.value })}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Message Templates Customization Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span className="text-emerald-600 font-black">3️⃣</span>
                  <span>تخصيص قوالب ورسائل الواتساب</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setWhatsappConfig({
                      ...whatsappConfig,
                      whatsappInvoiceTemplate: DEFAULT_WHATSAPP_TEMPLATES.invoice,
                      whatsappDebtReminderTemplate: DEFAULT_WHATSAPP_TEMPLATES.debtReminder,
                    });
                    toast('تمت استعادة نصوص القوالب الافتراضية', 'info');
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                >
                  استعادة القوالب الافتراضية
                </button>
              </div>

              {/* Template 1: Invoice Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>📄 قالب رسالة الفاتورة (عند إتمام البيع ومشاركة الفاتورة):</span>
                  <span className="text-[10px] text-slate-400 font-mono">Invoice Template</span>
                </label>
                <textarea
                  rows="6"
                  value={whatsappConfig.whatsappInvoiceTemplate}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappInvoiceTemplate: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-3 text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-mono bg-slate-50/50"
                  dir="rtl"
                />
              </div>

              {/* Template 2: Debt Reminder Message */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>🔔 قالب رسالة تذكير الديون (المجدول والتذكير الفردي):</span>
                  <span className="text-[10px] text-slate-400 font-mono">Debt Reminder Template</span>
                </label>
                <textarea
                  rows="6"
                  value={whatsappConfig.whatsappDebtReminderTemplate}
                  onChange={(e) => setWhatsappConfig({ ...whatsappConfig, whatsappDebtReminderTemplate: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl p-3 text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 font-mono bg-slate-50/50"
                  dir="rtl"
                />
              </div>

              {/* Variables Legend */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-bold text-slate-700 block mb-1.5">المتغيرات الذكية المتاحة للاستخدام داخل النصوص:</span>
                <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{customerName}`} (اسم العميل)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{username}`} (اسم المستخدم للدخول)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{password}`} (رمز المرور / الباسورد)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{statementLink}`} (رابط بوابة العملاء)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{totalDebt}`} (المبلغ المتبقي)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{storeName}`} (اسم المحل)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{invoiceNumber}`} (رقم الفاتورة)</span>
                  <span className="bg-white border border-slate-300 px-2 py-0.5 rounded text-slate-700">{`{total}`} (مبلغ الفاتورة)</span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSaveWhatsAppConfig}
                disabled={savingWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-8 py-3 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>💾</span>
                <span>{savingWhatsApp ? 'جارٍ الحفظ...' : 'حفظ إعدادات وقوالب الواتساب'}</span>
              </button>
            </div>

          </div>
        )}

        {/* Tab 4: Google Drive & Backup System */}
        {activeTab === 'backup' && (
          <div className="max-w-4xl space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-brand-700 to-indigo-800 text-white rounded-2xl p-6 shadow-md relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-black">نظام النسخ الاحتياطي السحابي (Google Drive)</h2>
                    <p className="text-brand-100 text-xs mt-0.5">حفظ وتأمين كافة بيانات الموقع وفواتير العملاء تلقائياً كل ليلة كملفات PDF وجداول إكسل</p>
                  </div>
                </div>

                {backupStats && (
                  <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-white/20 text-xs">
                    <div>
                      <span className="text-brand-200">آخر نسخة احتياطية:</span>{' '}
                      <strong className="text-white font-mono">{new Date(backupStats.lastBackupDate).toLocaleString('ar-IQ')}</strong>
                    </div>
                    <div>
                      <span className="text-brand-200">المنتجات:</span> <strong className="text-white">{backupStats.productsCount || 0}</strong>
                    </div>
                    <div>
                      <span className="text-brand-200">الفواتير:</span> <strong className="text-white">{backupStats.salesCount || 0}</strong>
                    </div>
                    <div>
                      <span className="text-brand-200">العملاء:</span> <strong className="text-white">{backupStats.customersCount || 0}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Single-File Test Action */}
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <h3 className="font-black text-amber-950 text-sm">فحص وتجربة ملف واحد فوراً (تقرير رأس المال)</h3>
                  <p className="text-amber-800 text-xs">توليد وتحميل ملف PDF تجريبي خلال ثانية واحدة لفحص جودة ووضوح الخطوط العربية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleTestSinglePdf}
                disabled={testingSinglePdf || backupTask.isRunning}
                className="w-full sm:w-auto shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-5 py-3 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>📄</span>
                {testingSinglePdf ? 'جاري تجهيز الملف (ثانية واحدة)...' : 'تحميل وتجربة ملف واحد الآن ➔'}
              </button>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleCloudDriveBackup}
                disabled={backupTask.isRunning}
                className="bg-brand-600 hover:bg-brand-700 text-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between disabled:opacity-50 cursor-pointer group text-right"
              >
                <div>
                  <div className="font-black text-base flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    نسخ سحابي إلى Google Drive (في الخلفية)
                  </div>
                  <p className="text-brand-100 text-xs mt-1">يعمل في الخلفية بهدوء مع إمكانية استخدام الموقع والتنقل بحرية كاملة ✨</p>
                </div>
                <span className="text-xl font-black transition-transform group-hover:-translate-x-1">➔</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadLocalBackup}
                disabled={backupTask.isRunning}
                className="bg-ink-900 hover:bg-black text-white p-5 rounded-2xl shadow-sm hover:shadow-md transition-all flex items-center justify-between disabled:opacity-50 cursor-pointer group text-right"
              >
                <div>
                  <div className="font-black text-base flex items-center gap-2">
                    <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    تحميل الحزمة كاملة (ZIP) على الكمبيوتر
                  </div>
                  <p className="text-ink-300 text-xs mt-1">تجهيز وتحميل ملف ZIP يحتوي على جميع ملفات PDF والإكسل على جهازك</p>
                </div>
                <span className="text-xl font-black transition-transform group-hover:-translate-x-1">➔</span>
              </button>
            </div>

            {/* Daily Schedule Card */}
            <div className="bg-white border border-brand-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⏰</span>
                  <div>
                    <h3 className="font-bold text-ink-900 text-sm">جدولة النسخ الاحتياطي اليومي التلقائي</h3>
                    <p className="text-ink-500 text-xs">يقوم النظام بأخذ نسخة شاملة ورفعها لكوكل درايف تلقائياً كل يوم في الوقت المحدد</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={driveConfig.autoDailyBackup ?? true}
                    onChange={(e) => setDriveConfig({ ...driveConfig, autoDailyBackup: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
                </label>
              </div>

              {driveConfig.autoDailyBackup && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-brand-50/50 p-4 rounded-xl border border-brand-100 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-xs font-bold text-ink-700 mb-1">وقت النسخ اليومي (بتوقيت بغداد)</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={driveConfig.backupHour ?? 23}
                        onChange={(e) => setDriveConfig({ ...driveConfig, backupHour: parseInt(e.target.value) })}
                        className="input text-xs font-bold flex-1"
                      >
                        {Array.from({ length: 24 }).map((_, h) => {
                          const period = h >= 12 ? 'مساءً' : 'صباحاً';
                          const displayH = h % 12 === 0 ? 12 : h % 12;
                          return (
                            <option key={h} value={h}>
                              {displayH}:00 {period} ({String(h).padStart(2, '0')}:00)
                            </option>
                          );
                        })}
                      </select>
                      <select
                        value={driveConfig.backupMinute ?? 0}
                        onChange={(e) => setDriveConfig({ ...driveConfig, backupMinute: parseInt(e.target.value) })}
                        className="input text-xs font-bold w-24"
                      >
                        <option value={0}>00 دقيقة</option>
                        <option value={15}>15 دقيقة</option>
                        <option value={30}>30 دقيقة</option>
                        <option value={45}>45 دقيقة</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-start sm:gap-4 pt-4 sm:pt-6">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-ink-800">
                      <input
                        type="checkbox"
                        checked={driveConfig.notifyTelegram ?? true}
                        onChange={(e) => setDriveConfig({ ...driveConfig, notifyTelegram: e.target.checked })}
                        className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-4 h-4"
                      />
                      إرسال إشعار تلغرام فور اكتمال النسخ 📢
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 1-Click Google Drive Connection Card */}
            <div className="bg-white border border-brand-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">☁️</span>
                  <div>
                    <h3 className="font-bold text-ink-900 text-sm">ربط Google Drive بنقرة واحدة (Google OAuth)</h3>
                    <p className="text-ink-500 text-xs">اربط حساب جوجل الخاص بك مباشرة لحفظ النسخ اليومية على مساحة Google Drive الخاصة بك</p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed flex items-center justify-between gap-3">
                <div>
                  <strong>🔑 تفعيل Google Drive API:</strong> تأكد من تفعيل خدمة Drive API في مشروع Google Cloud لمرة واحدة.
                </div>
                <a
                  href="https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=121093072046"
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                >
                  اضغط للتفعيل (Enable) ➔
                </a>
              </div>

              <button
                type="button"
                onClick={handleConnectGoogleDrive}
                disabled={connectingOAuth}
                className={`w-full p-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xs transition-all cursor-pointer ${
                  driveConfig.connectedEmail
                    ? 'bg-emerald-50 border border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                    : 'bg-white border-2 border-brand-500 text-brand-900 hover:bg-brand-50'
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                {connectingOAuth ? 'جاري فتح نافذة تسجيل الدخول في Google...' : driveConfig.connectedEmail ? `الحساب المتصل: ${driveConfig.connectedEmail} ✅ (اضغط لإعادة الربط أو التبديل)` : '🔗 تسجيل الدخول وتفويض Google Drive بنقرة واحدة'}
              </button>
            </div>

            {/* Collapsible Backup Files Breakdown */}
            <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-2xs">
              <button
                type="button"
                onClick={() => setShowFileList(!showFileList)}
                className="w-full flex items-center justify-between text-right cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">📁</span>
                  <div>
                    <h3 className="font-bold text-ink-900 text-sm">محتويات النسخة الاحتياطية (8 ملفات وتقارير)</h3>
                    <p className="text-ink-400 text-xs">{showFileList ? 'اضغط لإخفاء التفاصيل' : 'اضغط لعرض تفاصيل ملفات الـ PDF والإكسل المشمولة بالنسخة'}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-brand-600">
                  {showFileList ? '▲ إخفاء' : '▼ عرض التفاصيل'}
                </span>
              </button>

              {showFileList && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs mt-4 pt-4 border-t border-ink-100 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                    <span className="text-base">💰</span>
                    <div>
                      <strong className="text-amber-900 block font-black">رأس_المال_وجرد_المخزون.pdf</strong>
                      <span className="text-amber-700 text-[11px]">تقرير رأس المال الشامل، المحل والمخزن، تفصيل الأقسام والقطع المعلقة مع أسماء العملاء.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-50/70 border border-brand-200">
                    <span className="text-base">📁</span>
                    <div>
                      <strong className="text-brand-900 block font-black">فواتير_العملاء/ (مجلد مخصص لكل عميل)</strong>
                      <span className="text-brand-700 text-[11px]">مجلد خاص لكل عميل يحتوي على كشف حسابه (PDF) وجميع فواتيره الفردية (PDF).</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-ink-50 border border-ink-200">
                    <span className="text-base">📦</span>
                    <div>
                      <strong className="text-ink-900 block font-black">تقرير_المخزون_والمنتجات.pdf</strong>
                      <span className="text-ink-600 text-[11px]">جدول تفصيلي لجميع المنتجات مع الباركود والـ SKU وأسعار الجملة والمفرد.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-ink-50 border border-ink-200">
                    <span className="text-base">🧾</span>
                    <div>
                      <strong className="text-ink-900 block font-black">تقرير_المبيعات_والإيرادات.pdf</strong>
                      <span className="text-ink-600 text-[11px]">سجل المبيعات، النقد والديون، وقائمة بكافة فواتير البيع.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-ink-50 border border-ink-200">
                    <span className="text-base">👥</span>
                    <div>
                      <strong className="text-ink-900 block font-black">كشف_العملاء_والديون_المعلقة.pdf</strong>
                      <span className="text-ink-600 text-[11px]">قائمة بأرقام هواتف العملاء ومبالغ الديون المترتبة بدقة.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-ink-50 border border-ink-200">
                    <span className="text-base">🕒</span>
                    <div>
                      <strong className="text-ink-900 block font-black">سجل_حركات_المخزون.pdf</strong>
                      <span className="text-ink-600 text-[11px]">توثيق الخط الزمني للتعديلات والنقل الداخلي وأسباب التعديل.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                    <span className="text-base">📊</span>
                    <div>
                      <strong className="text-emerald-900 block font-black">Database_Full_Backup.xlsx</strong>
                      <span className="text-emerald-700 text-[11px]">ملف إكسل شامل مقسم لصفحات للتحليل وتصدير الجداول.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
                    <span className="text-base">📄</span>
                    <div>
                      <strong className="text-indigo-900 block font-black">Database_Raw.json</strong>
                      <span className="text-indigo-700 text-[11px]">نسخة قواعد البيانات الكاملة للاسترجاع الفوري عند الطوارئ.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Google Drive Advanced Configuration Form */}
            <form onSubmit={handleSaveDriveConfig} className="bg-white border border-brand-200 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <h3 className="font-bold text-ink-900 text-sm flex items-center gap-2">
                  <svg className="w-5 h-5 text-brand-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.71 3.5L1.15 15l3.43 6l6.55-11.5L7.71 3.5zM9.73 15L6.3 21h13.12l3.43-6H9.73zm6.56-11.5L9.73 15h6.86l6.56-11.5h-6.86z"/>
                  </svg>
                  معرّف مجلد الحفظ في Google Drive
                </h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-ink-700 mb-1">معرّف مجلد Google Drive (Folder ID) - اختياري</label>
                <input
                  type="text"
                  value={driveConfig.folderId || ''}
                  onChange={(e) => setDriveConfig({ ...driveConfig, folderId: e.target.value })}
                  placeholder="مثال: 12Zp9WDO8dcChWCWxQdmsqUL8SSTMh_fg"
                  className="input font-mono text-xs"
                  dir="ltr"
                />
                <p className="text-[11px] text-ink-400 mt-1">اتركه كما هو أو ضع معرّف أي مجلد ترغب برفع النسخ الاحتياطية داخله.</p>
              </div>

              <div className="pt-3 border-t border-ink-100 flex justify-end">
                <button
                  type="submit"
                  disabled={savingDriveConfig}
                  className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {savingDriveConfig ? 'جارٍ الحفظ...' : 'حفظ إعدادات Google Drive'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users / Allowed Emails Whitelist Tab */}
        {activeTab === 'users' && (
          <div className="max-w-3xl space-y-6">
            {/* Header Description */}
            <div className="bg-gradient-to-l from-indigo-50/80 to-brand-50/50 border border-indigo-100 rounded-2xl p-5 space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2 bg-white rounded-xl shadow-2xs border border-indigo-100">👥</span>
                <div>
                  <h2 className="text-base font-black text-ink-900">
                    إدارة الموظفين والإيميلات المصرح لها بالدخول (Google & Email Whitelist)
                  </h2>
                  <p className="text-xs text-ink-600 mt-1 leading-relaxed">
                    تحكم بالكامل في الحسابات المسموح لها بتسجيل الدخول للنظام (سواء من البوت في التليجرام أو من الموقع عبر حساب Google أو البريد الإلكتروني). لن يتمكن أي حساب آخر من الدخول.
                  </p>
                </div>
              </div>
            </div>

            {/* Whitelist Enforcement Toggle */}
            <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{isWhitelistEnforced ? '🔒' : '🔓'}</span>
                  <h3 className="text-sm font-black text-ink-900">
                    تقييد الدخول بالإيميلات المعتمدة فقط (نظام الأمان)
                  </h3>
                </div>
                <p className="text-xs text-ink-500 mt-1 leading-relaxed">
                  {isWhitelistEnforced 
                    ? 'النظام محمي ومقيد: لن يتمكن أي موظف من الدخول إلا إذا كان بريده مسجلاً في هذه القائمة أدناه.'
                    : 'التقييد معطل حالياً: يمكن لأي حساب مسجل في Firebase الدخول للنظام.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleWhitelistEnforce}
                className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs shrink-0 ${
                  isWhitelistEnforced 
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                {isWhitelistEnforced ? 'مفعل (آمن ومقيد) ✅' : 'معطل (مفتوح للجميع) ⚠️'}
              </button>
            </div>

            {/* Add New Email Form */}
            <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-ink-100 pb-3">
                <h3 className="text-sm font-black text-ink-900 flex items-center gap-2">
                  <span>➕</span>
                  <span>إضافة بريد موظف جديد للقائمة المصرح لها</span>
                </h3>

                {user?.email && !allowedEmailsList.map(e => e.toLowerCase()).includes(user.email.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={handleAddCurrentAdminEmail}
                    disabled={savingAllowedEmail}
                    className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>إضافة بريدي الحالي ({user.email})</span>
                  </button>
                )}
              </div>

              <form onSubmit={handleAddAllowedEmail} className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <input
                    type="email"
                    required
                    value={newAllowedEmail}
                    onChange={(e) => setNewAllowedEmail(e.target.value)}
                    placeholder="مثال: employee@gmail.com أو seller@safezone.com"
                    className="w-full border border-brand-200 rounded-xl px-4 py-2.5 text-xs text-ink-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                    dir="ltr"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingAllowedEmail}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-6 py-2.5 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <span>{savingAllowedEmail ? 'جارٍ الإضافة...' : '➕ إضافة للمصرح لهم'}</span>
                </button>
              </form>
            </div>

            {/* Allowed Emails List */}
            <div className="bg-white border border-brand-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📋</span>
                  <h3 className="text-sm font-black text-ink-900">
                    قائمة الإيميلات المعتمدة ({allowedEmailsList.length})
                  </h3>
                </div>
                <span className="text-[11px] text-ink-400 font-bold">
                  تدعم الدخول عبر Google أو كلمة المرور
                </span>
              </div>

              {allowedEmailsList.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs space-y-2">
                  <span className="text-3xl block">📭</span>
                  <p className="font-bold text-slate-700">لم يتم إضافة أي إيميل مصرح به بعد.</p>
                  <p className="text-[11px]">عند عدم إضافة أي إيميل، يكون تسجيل الدخول متاحاً للمستخدمين المسجلين في Firebase.</p>
                  {user?.email && (
                    <button
                      type="button"
                      onClick={handleAddCurrentAdminEmail}
                      className="mt-2 inline-flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs hover:bg-indigo-700 cursor-pointer"
                    >
                      <span>⚡</span>
                      <span>إضافة بريدك الحالي ({user.email}) كمسؤول رئيسي</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {allowedEmailsList.map((emailItem, idx) => {
                    const isCurrent = user?.email?.toLowerCase() === emailItem.toLowerCase();
                    return (
                      <div key={idx} className="py-3 px-2 flex items-center justify-between gap-3 hover:bg-slate-50 rounded-xl transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-xs border border-indigo-100 shrink-0">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-900" dir="ltr">
                                {emailItem}
                              </span>
                              {isCurrent && (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  أنت (الحساب الحالي)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400">
                                مصرح له بالدخول في البوت والموقع وبحساب Google
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveAllowedEmail(emailItem)}
                          className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 flex items-center justify-center text-xs transition-colors cursor-pointer border border-rose-200 shrink-0"
                          title="إزالة من القائمة"
                        >
                          🗑️
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
