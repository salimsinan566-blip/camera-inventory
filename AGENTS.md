# 🤖 فريق وكلاء التطوير متعددي المهام (Multi-Agent Development Team)
> نظام إدارة المخزون والمبيعات لكاميرات المراقبة (Camera Inventory & POS System)

مرحباً بك في نظام الوكلاء المتخصصين. هذا المشروع يعمل بآلية **توزيع المسؤوليات (Separation of Concerns)** بحيث يتولى كل وكيل مجاله التخصصي بدقة وكفاءة.

---

## 👥 بطاقة الوكلاء والتخصصات (Agent Roster)

| معرف الوكيل (Agent ID) | اسم الوكيل بالعربية | نطاق المسؤولية (Scope) | ملف المهارة |
| :--- | :--- | :--- | :--- |
| `orchestrator-agent` | **منسق ومخطط النظام** | إدارة وتوجيه المهام المعقدة وتكامل الأجزاء | `.agents/skills/orchestrator-agent/SKILL.md` |
| `frontend-pos-agent` | **مهندس الواجهات ونقطة البيع** | شاشات React، الـ POS، التوافق مع RTL وتجربة المستخدم | `.agents/skills/frontend-pos-agent/SKILL.md` |
| `accounting-inventory-agent` | **مهندس الحسابات والمخزون** | منطق الجرد، مطابقة الصندوق، الأرباح، والديون | `.agents/skills/accounting-inventory-agent/SKILL.md` |
| `firebase-db-agent` | **مهندس البيانات والأمان** | Firestore، قواعد الأمان `firestore.rules`، والمصادقة | `.agents/skills/firebase-db-agent/SKILL.md` |
| `integrations-bot-agent` | **مهندس الواتساب وتلغرام** | خادم Baileys، بوتات Telegram، والمهام المجدولة Cron | `.agents/skills/integrations-bot-agent/SKILL.md` |
| `qa-security-agent` | **وكيل فحص الجودة والأمان** | تدقيق الحسابات، مراجعة الأمان، واختبار حالات الحافة | `.agents/skills/qa-security-agent/SKILL.md` |

---

## 🗺️ خريطة ملكية الملفات (File Ownership Map)

```text
camera-inventory/
├── src/
│   ├── components/
│   │   ├── POSScreen.jsx                 ──> [frontend-pos-agent] + [accounting-inventory-agent]
│   │   ├── CashReconciliationModal.jsx   ──> [accounting-inventory-agent]
│   │   ├── PurchasesScreen.jsx           ──> [accounting-inventory-agent] + [frontend-pos-agent]
│   │   ├── CustodyScreen.jsx             ──> [accounting-inventory-agent]
│   │   ├── CustomersScreen.jsx           ──> [frontend-pos-agent] + [accounting-inventory-agent]
│   │   ├── TelegramMiniApp.jsx           ──> [integrations-bot-agent] + [frontend-pos-agent]
│   │   ├── SettingsScreen.jsx            ──> [frontend-pos-agent] + [firebase-db-agent]
│   │   └── ... (بقية الواجهات)          ──> [frontend-pos-agent]
│   ├── firebase/                         ──> [firebase-db-agent]
│   ├── models/product.js                 ──> [accounting-inventory-agent] + [firebase-db-agent]
│   └── utils/                            ──> [accounting-inventory-agent]
├── api/                                  ──> [integrations-bot-agent] + [firebase-db-agent]
│   ├── telegram-webhook.js
│   ├── cron-debt-reminders.js
│   ├── google-drive-backup.js
│   └── ...
├── whatsapp-server/                      ──> [integrations-bot-agent]
│   ├── server.mjs
│   └── ...
└── firestore.rules                       ──> [firebase-db-agent] + [qa-security-agent]
```

---

## 🔄 بروتوكول التنسيق بين الوكلاء (Agent Collaboration Protocol)

1. **الطلبات الشاملة (Full-stack / Multi-domain Features):**
   - يبدأ `orchestrator-agent` بتحليل المتطلبات ورسم تسلسل التنفيذ.
   - يستدعي وكيل قواعد البيانات `firebase-db-agent` إذا كان هناك تعديل على Schemas أو Security Rules.
   - يستدعي وكيل الحسابات `accounting-inventory-agent` لكتابة الدوال الحسابية ومنطق العمليات.
   - يستدعي وكيل الواجهات `frontend-pos-agent` لبناء المكونات التفاعلية وتصميم الشاشات.
   - يختتم العمل باستدعاء `qa-security-agent` لفحص الأخطاء والتأكد من سلامة النظام.

2. **الطلبات المباشرة (Direct Tasks):**
   - يمكن للمستخدم توجيه الطلب مباشرة لأي وكيل حسب تخصصه.
