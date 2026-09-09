import React, { useState, useMemo } from 'react';

export default function UserGuideScreen({ onNavigate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [expandedTopics, setExpandedTopics] = useState({
    'pos-site-purchase': true,
    'cash-drawer-reconciliation': true,
  });

  const toggleTopic = (id) => {
    setExpandedTopics((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const all = {};
    GUIDE_SECTIONS.forEach((sec) => {
      sec.topics.forEach((t) => {
        all[t.id] = true;
      });
    });
    setExpandedTopics(all);
  };

  const collapseAll = () => {
    setExpandedTopics({});
  };

  const filteredSections = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return GUIDE_SECTIONS.map((section) => {
      if (activeCategory !== 'all' && section.id !== activeCategory) {
        return null;
      }

      const matchingTopics = section.topics.filter((topic) => {
        if (!term) return true;
        const text = `${topic.title} ${topic.summary} ${topic.content} ${topic.tags?.join(' ') || ''}`.toLowerCase();
        return text.includes(term);
      });

      if (matchingTopics.length === 0) return null;

      return {
        ...section,
        topics: matchingTopics,
      };
    }).filter(Boolean);
  }, [searchTerm, activeCategory]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-indigo-900 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-indigo-700/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 border border-indigo-400/30 rounded-full text-indigo-300 text-xs font-bold mb-3">
              <span>📚</span>
              <span>دليل التشغيل وإدارة النظام المتكامل</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              دليل الاستخدام الشامل لأنظمة المنطقة الآمنة
            </h1>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              شرح تفصيلي ومبسط لكافة شاشات وميزات النظام: نقطة البيع، المشتريات الموقعية، مطابقة الصناديق النقدية، عهد الفنيين، حسابات الماستر، وأدق الحالات المحاسبية والمخزنية.
            </p>
          </div>

          {/* Quick Search in Banner */}
          <div className="w-full md:w-80">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث عن ميزة أو شرح (مثال: شراء موقعي، قاصة، باركود)..."
                className="w-full bg-white/10 hover:bg-white/15 focus:bg-white text-white focus:text-slate-900 placeholder:text-slate-400 focus:placeholder:text-slate-400 border border-white/20 focus:border-indigo-400 rounded-2xl py-3 pr-10 pl-4 text-xs font-bold outline-hidden transition-all shadow-inner"
              />
              <span className="absolute right-3.5 top-3.5 text-base text-slate-300 pointer-events-none">🔍</span>
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute left-3 top-3 text-xs text-slate-400 hover:text-white bg-white/20 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
              <span>نتائج البحث التفاعلية</span>
              <div className="flex items-center gap-2">
                <button onClick={expandAll} className="hover:text-white underline cursor-pointer">فتح الكل</button>
                <span>•</span>
                <button onClick={collapseAll} className="hover:text-white underline cursor-pointer">طي الكل</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categories Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeCategory === 'all'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-2 ring-indigo-300'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <span>🌟 جميع الأقسام</span>
        </button>
        {GUIDE_SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveCategory(sec.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
              activeCategory === sec.id
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-2 ring-indigo-300'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>{sec.icon}</span>
            <span>{sec.title}</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-mono">
              {sec.topics.length}
            </span>
          </button>
        ))}
      </div>

      {/* Sections and Topics Accordion List */}
      <div className="space-y-6">
        {filteredSections.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
            <span className="text-4xl block mb-2">🔍</span>
            <h3 className="text-base font-bold text-slate-800">لم يتم العثور على نتائج تطابق بحثك</h3>
            <p className="text-xs text-slate-500 mt-1">جرب البحث بكلمات أخرى مثل (فاتورة، صيانة، تسوية، قاصة، عهدة)</p>
            <button
              onClick={() => { setSearchTerm(''); setActiveCategory('all'); }}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              عرض كامل الدليل
            </button>
          </div>
        ) : (
          filteredSections.map((section) => (
            <div key={section.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Section Title Header */}
              <div className="p-4 sm:p-5 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 bg-white rounded-xl shadow-xs border border-slate-200">
                    {section.icon}
                  </span>
                  <div>
                    <h2 className="text-base font-black text-slate-900">{section.title}</h2>
                    <p className="text-xs text-slate-500">{section.description}</p>
                  </div>
                </div>

                {section.quickLink && onNavigate && (
                  <button
                    onClick={() => onNavigate(section.quickLink.tab)}
                    className="self-start sm:self-auto px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>{section.quickLink.label}</span>
                    <span>←</span>
                  </button>
                )}
              </div>

              {/* Topics Inside Section */}
              <div className="divide-y divide-slate-100">
                {section.topics.map((topic) => {
                  const isExpanded = expandedTopics[topic.id] ?? false;

                  return (
                    <div key={topic.id} className="transition-colors">
                      {/* Topic Trigger */}
                      <button
                        onClick={() => toggleTopic(topic.id)}
                        className="w-full p-4 sm:p-5 text-right flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-sm font-black text-slate-900">{topic.title}</h3>
                            {topic.badge && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${topic.badgeColor || 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                {topic.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed truncate">{topic.summary}</p>
                        </div>
                        <div className={`w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center shrink-0 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-180 bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white'}`}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Topic Expanded Body */}
                      {isExpanded && (
                        <div className="p-4 sm:p-6 pt-0 bg-slate-50/40 border-t border-slate-100 text-xs text-slate-700 leading-relaxed space-y-4 animate-in slide-in-from-top-2 duration-150">
                          {topic.content}

                          {topic.steps && topic.steps.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 mt-3 shadow-2xs">
                              <h4 className="font-black text-slate-900 text-xs flex items-center gap-1.5 mb-2">
                                <span>📌</span>
                                <span>خطوات العمل بالتسلسل:</span>
                              </h4>
                              <ol className="space-y-2 list-decimal list-inside font-medium text-slate-700 pr-1">
                                {topic.steps.map((step, idx) => (
                                  <li key={idx} className="leading-normal">
                                    <span className="font-bold text-slate-900">{step.title}: </span>
                                    <span>{step.desc}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {topic.alert && (
                            <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
                              topic.alert.type === 'danger'
                                ? 'bg-rose-50 border-rose-200 text-rose-800'
                                : topic.alert.type === 'warn'
                                ? 'bg-amber-50 border-amber-200 text-amber-900'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            }`}>
                              <span className="text-base shrink-0">{topic.alert.icon || '💡'}</span>
                              <div className="leading-relaxed">
                                <span className="font-bold block mb-0.5">{topic.alert.title}</span>
                                <span>{topic.alert.message}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Support Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
        <div className="flex items-center gap-3">
          <span className="text-3xl p-2 bg-indigo-50 border border-indigo-100 rounded-2xl">🛡️</span>
          <div>
            <h4 className="font-black text-slate-900 text-sm">نظام Safe Zone لإدارة الكاميرات والمبيعات</h4>
            <p className="text-xs text-slate-500">تم تصميم النظام بأعلى معايير الدقة المحاسبية والمخزنية مع دعم العمل أوفلاين والمزامنة السحابية الفورية.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onNavigate && (
            <button
              onClick={() => onNavigate('home')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              العودة إلى لوحة القيادة
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const GUIDE_SECTIONS = [
  {
    id: 'pos',
    title: 'نقطة البيع وسلة المبيعات (POS)',
    icon: '🛒',
    description: 'إصدار الفواتير، بيع المواد العادية والخاصة، الشراء الموقعي، والتعليق والطباعة.',
    quickLink: { tab: 'pos', label: 'فتح نقطة البيع' },
    topics: [
      {
        id: 'pos-site-purchase',
        title: 'شراء موقعي إضافي (+ شراء موقعي)',
        badge: 'ميزة جديدة وهامة',
        badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
        summary: 'شراء مواد للموقع من خارج الموردين المعتمدين، تخصم من الصندوق أو الماستر فوراً دون زيادة في المخزون وتُسترد عند الحذف.',
        content: (
          <div className="space-y-2">
            <p>
              أثناء تثبيت وتنصيب الكاميرات في موقع العميل، قد تحتاج إلى شراء مستلزمات إضافية عاجلة من السوق المحلي أو محلات مجاورة (مثل: سنادات تثبيت حديد خاصة، قفل حماية، بوري حديد، شريط عازل، كيبل نحاس خارجي...). هذه المواد تشتريها فقط لهذا الموقع ولن تقوم بتخزينها بالمحل، لذا تم تصميم هذه الميزة لتضمن الدقة المالية والتوازن المخزني.
            </p>
          </div>
        ),
        steps: [
          { title: 'الضغط على الزر', desc: 'في شاشة نقطة البيع، اضغط على زر [🛒 + شراء موقعي] الموجود في شريط أدوات السلة بجانب زر [+ بند مخصص].' },
          { title: 'إدخال اسم المشترى', desc: 'اكتب اسم المادة بوضوح (مثال: بوري حديد 2 انج 6 متر).' },
          { title: 'تحديد جهة خصم تكلفة الشراء', desc: 'اختر إما [💵 القاصة النقدية] إذا دفعت من كاش اليومية، أو [💳 بطاقة الماستر] إذا دفعت من البطاقة الإلكترونية.' },
          { title: 'إدخال سعر الشراء والبيع', desc: 'اكتب سعر التكلفة الذي دفعته للشراء (يُخصم من القاصة/الماستر فوراً). وسعر البيع يُملأ تلقائياً بنفس المبلغ، ويمكنك رفعه للزبون لكسب هامش ربح للمحل.' },
          { title: 'إتمام البيع أو الحذف', desc: 'عند تأكيد الفاتورة، يُخصم المبلغ مباشرة من الصندوق. وفي حال تم حذف الفاتورة أو إرجاعها لاحقاً، يتعرف النظام على المادة ويسترد المبلغ للقاصة أو الماستر تلقائياً دون أي عجز!' },
        ],
        alert: {
          type: 'success',
          title: 'ضمان عدم التأثير على المخزن',
          message: 'هذه المواد لا تدخل رصيد المخزن إطلاقاً، فلا تزيد الكميات ولا تشوه جرد المخزن المحاسبي.',
        },
      },
      {
        id: 'pos-custom-item',
        title: 'البند المخصص الحر (+ بند مخصص)',
        summary: 'إضافة أي مادة حرة أو خدمة سريعة داخل الفاتورة مع تحديد سعر بيعها وتكلفتها دون المساس بالمخزون.',
        content: (
          <p>
            يُستخدم زر **[+ بند مخصص]** عندما تريد بيع مادة غير مسجلة مسبقاً في قائمة المواد، أو خدمة تركيب استثنائية، أو صيانة، وتريد كتابة اسمها وسعرها يدوياً دون أن يقوم النظام بإنقاص أي كمية من المخزن.
          </p>
        ),
        steps: [
          { title: 'فتح النافذة', desc: 'اضغط على زر [+ بند مخصص] أعلى السلة.' },
          { title: 'اسم البند والسعر', desc: 'اكتب اسم الخدمة أو البند وسعر البيع للزبون.' },
          { title: 'سعر التكلفة (اختياري)', desc: 'يمكنك كتابة تكلفة البند لاحتساب صافي الأرباح في التقارير.' },
        ],
      },
      {
        id: 'pos-selling-modes',
        title: 'طرق بيع الكابلات (قطعة، متر، لفة)',
        summary: 'دعم بيع الكابلات بالمتر المفرد أو باللفة الكاملة مع خصم دقيق من أمتار اللفة بالمخزن.',
        content: (
          <p>
            تتميز كابلات الكاميرات (UTP / Coaxial) بإمكانية البيع بأكثر من نمط: باللفة الكاملة (مثلاً 305 متر) أو بالأمتار المحددة (مثلاً 45 متر). النظام يخصم تلقائياً عدد الأمتار المباعة من رصيد اللفات، ويعرض السعر بالمتر أو باللفة بناءً على اختيارك.
          </p>
        ),
      },
      {
        id: 'pos-drafts-and-suspension',
        title: 'تعليق الفواتير وحفظ المسودات (Drafts)',
        summary: 'حفظ الفاتورة الحالية مؤقتاً لخدمة زبون آخر، واسترجاعها بضغطة زر دون فقدان أي بيانات.',
        content: (
          <p>
            إذا كان الزبون يقوم باختيار مواد إضافية أو يتشاور، يمكنك الضغط على زر **[تعليق الفاتورة]**. يقوم النظام بحفظ السلة كمسودة وحجز المواد في المخزن (Pending Qty)، لتتمكن من خدمة زبون آخر والعودة للمسودة لاحقاً عبر زر **[الفواتير المعلقة]**.
          </p>
        ),
      },
      {
        id: 'pos-suspended-statement',
        title: 'كشف حساب الفواتير المعلقة والمحجوزة (Suspended Statement)',
        summary: 'كشف مالي ورسمي متكامل لمعاينة كافة الفواتير المعلقة والمواد المحجوزة وتصديرها Excel أو طباعتها A4.',
        content: (
          <div className="space-y-2">
            <p>
              يتوفر كشف حساب مخصص وشامل للفواتير المعلقة، مشابه لكشف حساب العملاء في شاشة التقارير:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li><strong>الوصول السريع:</strong> يمكنك فتحه من شاشة الفواتير والتقارير (زر <em>كشف الفواتير المعلقة</em>)، أو من نافذة المعلقات في نقطة البيع، أو من بطاقة المعلقات في لوحة القيادة.</li>
              <li><strong>تصفية حسب العميل:</strong> يمكنك استعراض معلقات عميل محدد أو كشف عام شامل لكافة عملاء المحل.</li>
              <li><strong>الإحصائيات الفورية:</strong> يعرض عدد الفواتير، مجموع المبالغ المعلقة، عدد المواد المحجوزة بالمخزن، والمعلقات الآجلة.</li>
              <li><strong>الطباعة والتصدير:</strong> طباعة وثيقة A4 معتمدة مع التواقيع، أو تصدير فوري إلى ملف Excel (.xlsx)، ومشاركة ملخص الفواتير عبر واتساب.</li>
            </ul>
          </div>
        ),
      },
      {
        id: 'pos-invoice-types',
        title: 'أنواع الفواتير (كاش، ماستركارد، آجل دين)',
        summary: 'التحكم بنوع الدفع وتأثيره التلقائي على الصندوق النقدية والماستر وحسابات الزبائن.',
        content: (
          <div className="space-y-1.5">
            <p>• 💵 **نقدي (كاش):** يدخل المبلغ فوراً إلى القاصة النقدية اليومية.</p>
            <p>• 💳 **ماستركارد:** يدخل المبلغ إلى رصيد حساب الماستركارد الإلكتروني المنفصل عن القاصة.</p>
            <p>• ⏳ **آجل (دين):** يُسجل المبلغ في ذمة العميل بحسابه في دليل الزبائن دون إدخاله في كاش اليومية حتى يتم تسديده.</p>
          </div>
        ),
      },
    ],
  },
  {
    id: 'cash',
    title: 'الصندوق والقاصة وحساب الماستر',
    icon: '💵',
    description: 'حساب النقد الفعلي، جرد القاصة اليومي، تحويلات الماستر، والإيداعات الإضافية.',
    quickLink: { tab: 'home', label: 'لوحة القيادة والصندوق' },
    topics: [
      {
        id: 'cash-drawer-reconciliation',
        title: 'جرد وتسوية القاصة اليومية (Cash Reconciliation)',
        badge: 'يومي وأساسي',
        badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        summary: 'مطابقة النقد الفعلي الموجود بيدك في الدرج مع الحساب الدفتري للنظام ورصد أي عجز أو زيادة.',
        content: (
          <p>
            في نهاية كل يوم أو وردية عمل، يقوم أمين الصندوق بعدّ النقود الموجودة فعلياً في القاصة، ومقارنتها بالرصيد المحسوب بالنظام.
          </p>
        ),
        steps: [
          { title: 'فتح نافذة الجرد', desc: 'في لوحة القيادة، اضغط على بطاقة [💵 الصندوق والقاصة].' },
          { title: 'إدخال النقد الفعلي', desc: 'اكتب المبلغ الذي قمت بعدّه في درج القاصة في خانة [النقد الفعلي في القاصة].' },
          { title: 'مراقبة الفارق', desc: 'يقوم النظام بحساب الفارق (0 = متطابق تماماً، موجب = زيادة، سالب = عجز).' },
          { title: 'اعتماد التسوية', desc: 'اضغط على [اعتماد وحفظ التسوية]؛ سيتم تصفير الدورة اليومية وبدء دورة جديدة بناءً على هذا الرصيد المعتمد.' },
        ],
      },
      {
        id: 'cash-mastercard-transfers',
        title: 'التحويل المالي (ماستر ➔ قاصة)',
        summary: 'تحويل مبالغ من رصيد بطاقة الماستركارد إلى القاصة النقدية عند سحب الكاش من الصراف الآلي.',
        content: (
          <p>
            عندما يدفع الزبائن بالماستركارد، تتراكم الأموال في حساب الماستر. عند قيامك بسحب كاش من الصراف الآلي وإيداعه في درج القاصة بالمكتب، اضغط على زر **[تحويل (ماستر ➔ قاصة)]** أعلى لوحة التحكم وسجل المبلغ، ليتم خصمه من الماستر وإضافته للقاصة فوراً.
          </p>
        ),
      },
      {
        id: 'cash-manual-income',
        title: 'إضافة مبالغ للدخل / فواتير قديمة',
        summary: 'إيداع أموال نقدية بالقاصة كإيرادات خارجية أو تسديدات فواتير قديمة ما قبل النظام.',
        content: (
          <p>
            إذا قام عميل بتسديد فاتورة قديمة سابقة لتشغيل هذا النظام، أو قمت بإيداع رأس مال أو أرباح خارجية في القاصة، اضغط على زر **[إضافة مبلغ للدخل / فاتورة قديمة]** ليتم تسجيلها كإيداع رسمي داخل الصندوق.
          </p>
        ),
      },
    ],
  },
  {
    id: 'custody',
    title: 'عهد الفنيين والسيارات الميدانية',
    icon: '🚚',
    description: 'صرف الكاميرات والأجهزة للفنيين، البيع المباشر من السيارة، واسترجاع المتبقي.',
    quickLink: { tab: 'custody', label: 'فتح شاشة العهد' },
    topics: [
      {
        id: 'custody-dispatch',
        title: 'صرف مواد لعهدة فني أو سيارة',
        summary: 'تسليم بضاعة من المخزن الرئيسي أو المحل إلى الفني لتركيبها بالمشاريع الخارجية.',
        content: (
          <p>
            في شاشة **[عهد الفنيين والسيارات]**، يمكنك اختيار الفني (أو إضافة فني جديد)، والضغط على **[+ صرف عهدة جديدة]** وتحديد المواد وكمياتها. تنتقل هذه المواد من رصيد المحل إلى رصيد عهدة الفني وتحت مسؤوليته.
          </p>
        ),
      },
      {
        id: 'custody-direct-sale',
        title: 'البيع المباشر من عهدة السيارة بنقطة البيع',
        summary: 'خصم المواد المباعة في الفاتورة مباشرة من عهدة الفني بدلاً من المحل.',
        content: (
          <p>
            عندما يقوم الفني بتركيب معدات من سيارته للزبون وتأتي للمحل لإصدار الفاتورة:
            <br />
            في نقطة البيع (POS)، تظهر لك قائمة بالمواد التي بحوزة الفني مع شارة الشاحنة **[🚚 عهدة: اسم الفني]**، وعند اختيارها تُخصم من عهدته مباشرة وتُحسب أرباح الفاتورة للمحل بشكل سليم.
          </p>
        ),
      },
      {
        id: 'custody-return',
        title: 'استرجاع الفائض من العهدة للمحل',
        summary: 'إعادة المواد غير المستهلكة من الفني بعد انتهاء المشروع إلى المحل أو المخزن.',
        content: (
          <p>
            إذا تبقت كاميرات أو كابلات لدى الفني، اضغط على **[استرجاع عهدة]** وحدد الكمية المعادة، ليعيدها النظام فوراً إلى رصيد المحل وتبرأ ذمة الفني منها.
          </p>
        ),
      },
    ],
  },
  {
    id: 'inventory',
    title: 'المخزون وحركات المواد',
    icon: '📦',
    description: 'إدارة المنتجات، أرقام الباركود، التحويل بين المحل والمخزن، وسجل الحركات.',
    quickLink: { tab: 'inventory', label: 'فتح شاشة المخزون' },
    topics: [
      {
        id: 'inv-products-management',
        title: 'إضافة وتعديل المنتجات وأسعار الجملة والمفرد',
        summary: 'تسجيل الكاميرات، مسجلات الفيديو NVR/DVR، الهاردات، وإدارة أسعار البيع والتكلفة بدقة.',
        content: (
          <p>
            لكل منتج: الاسم، الباركود (يمكن توليده أو قراءته بالماسح)، سعر التكلفة (الجملة)، سعر البيع المفرد، والحد الأدنى للتنبيه. يمنع النظام الكاشير من البيع دون سعر التكلفة إلا بصلاحية خاصة.
          </p>
        ),
      },
      {
        id: 'inv-transfer-locations',
        title: 'التحويل بين المحل والمخزن الرئيسي (Transfer Stock)',
        summary: 'نقل كميات البضاعة بين الرفوف في المعرض والمخزن الخلفي مع توثيق السجلات.',
        content: (
          <p>
            يوفر النظام تبويب **[مناقلة المخزون]** لنقل الكميات بين (المحل) و (المخزن) بضغطة زر واحدة لضمان معرفة مكان كل قطعة بالضبط.
          </p>
        ),
      },
      {
        id: 'inv-movement-logs',
        title: 'سجل حركات المخزون (Inventory Logs)',
        summary: 'تتبع حركة كل قطعة: متى دخلت، متى خرجت، في أي فاتورة، ومن هو المستخدم المسؤول.',
        content: (
          <p>
            سجل تدقيق كامل لا يمكن التلاعب به، يسجل كل عملية بيع، شراء، مناقلة، أو صرف عهدة، مما يسهل اكتشاف أي فروقات جرد بدقة متناهية.
          </p>
        ),
      },
    ],
  },
  {
    id: 'purchases',
    title: 'المشتريات ومستحقات الموردين',
    icon: '🤝',
    description: 'إدخال فواتير الموردين، تسديد الديون، وإدارة حسابات الموردين.',
    quickLink: { tab: 'purchases', label: 'فتح شاشة المشتريات' },
    topics: [
      {
        id: 'pur-add-invoice',
        title: 'تسجيل فاتورة شراء بضاعة من المورد',
        summary: 'إضافة بضاعة جديدة للمخزن وتسجيل الدفع نقداً من القاصة أو الماستر أو كدين.',
        content: (
          <p>
            عند شراء بضاعة من الموردين: حدد المورد، أضف المواد، واختر طريقة الدفع:
            <br />
            • **مدفوع نقداً بالكامل:** يخصم من القاصة النقدية وتدخل البضاعة للمخزن.
            <br />
            • **مدفوع جزئياً أو آجل:** يُسجل الباقي كدين على المحل للمورد في سجل مستحقات الموردين.
          </p>
        ),
      },
      {
        id: 'pur-supplier-debt-payment',
        title: 'تسديد دفعات ديون الموردين',
        summary: 'دفع مبالغ للموردين من الصندوق مع توثيق الوصل وتخفيض رصيد الدين.',
        content: (
          <p>
            في تبويب **[ديون الموردين]**، اضغط على **[تسديد دفعة]** للمورد وحدد المبلغ، ليقوم النظام بتخفيض مديونية المورد وخصم المبلغ من القاصة في تقرير اليومية فوراً.
          </p>
        ),
      },
    ],
  },
  {
    id: 'expenses-salaries',
    title: 'المصاريف والنثريات ورواتب الموظفين',
    icon: '💸',
    description: 'تسجيل النثريات اليومية، المصاريف الثابتة، سلف الموظفين، وصرف الرواتب.',
    quickLink: { tab: 'expenses', label: 'فتح شاشة المصاريف' },
    topics: [
      {
        id: 'exp-daily-and-shop',
        title: 'المصاريف اليومية ومصاريف المحل الثابتة',
        summary: 'تسجيل مصاريف الشاي، الغداء، النقل، وفواتير الإيجار، الكهرباء، والإنترنت.',
        content: (
          <p>
            توجد أزرار سريعة للأكثر استخداماً (ماء، غداء، نقل، كهرباء...).
            <br />
            الأهم: تحديد **جهة الخصم**:
            <br />
            • **من القاصة (كاش):** يخصم من كاش اليومية لضبط رصيد الدرج.
            <br />
            • **من الإدارة / شخصي:** لا يخصم من كاش القاصة، ولكنه يُحسب في تقرير الأرباح والخسائر العامة للمؤسسة.
          </p>
        ),
      },
      {
        id: 'sal-advances-and-salaries',
        title: 'سلف الموظفين ورواتبهم الأسبوعية والشهرية',
        summary: 'إعطاء سلفة لموظف، استقطاعها عند تسليم الراتب، أو تسديدها كاش للقاصة.',
        content: (
          <p>
            شاشة **[رواتب الموظفين]** تتيح تسجيل الموظفين، إعطاء سلف تُخصم من القاصة، وعند صرف الراتب يقوم النظام تلقائياً باحتساب السلف المتبقية وعرض صافي الراتب المستحق للموظف.
          </p>
        ),
      },
    ],
  },
  {
    id: 'reports-returns',
    title: 'الفواتير، الإرجاع، وسلة المحذوفات',
    icon: '📑',
    description: 'متابعة الفواتير، مرتجعات المبيعات، إلغاء الفواتير، واستعادة المحذوفات.',
    quickLink: { tab: 'reports', label: 'فتح شاشة التقارير' },
    topics: [
      {
        id: 'rep-returns-exchanges',
        title: 'إرجاع واستبدال المواد من الفاتورة (Returns & Exchanges)',
        summary: 'استرجاع مادة مباعة من الزبون، إعادة الكمية للمخزن، واسترداد فلوس الشراء الموقعي للقاصة.',
        content: (
          <p>
            في شاشة **[الفواتير والتقارير]**، اضغط على زر **[إرجاع / استبدال]** بجانب أي فاتورة:
            <br />
            يمكنك تخفيض كمية أي مادة أو حذفها، وسيقوم النظام تلقائياً بإعادة الكمية للمخزن، وفي حال كانت المادة شراء موقعي خارجي، يُعاد ثمن الشراء إلى القاصة أو الماستر فوراً!
          </p>
        ),
      },
      {
        id: 'rep-delete-invoice-safety',
        title: 'حذف الفواتير المؤكدة وأمانها المالي التام',
        summary: 'عند حذف فاتورة مؤكدة بالخطأ، يُعاد المخزون تلقائياً وتُلغى مصاريف الشراء الموقعي لتعود القاصة كما كانت.',
        content: (
          <p>
            إذا اضطررت لحذف فاتورة بيع نهائياً: يقوم النظام بإرجاع جميع مواد المحل إلى المخزن، وحذف سندات مشتريات الموقع الخارجية، وتنتقل الفاتورة إلى **[سلة المحذوفات]** كنسخة احتياطية لحمايتك من أي خطأ غير مقصود.
          </p>
        ),
      },
      {
        id: 'rep-trash-bin',
        title: 'سلة المحذوفات (Trash Bin) وحماية البيانات',
        summary: 'استعراض أي عنصر تم حذفه (فواتير، مصاريف، منتجات) وإمكانية استعادته بضغطة زر.',
        content: (
          <p>
            أي عملية حذف في النظام لا تمسح البيانات فوراً دون رجعة، بل تُنقل إلى سلة المحذوفات مع توثيق اسم المستخدم وتاريخ الحذف، ويمكن للمدير استعادتها بأي لحظة.
          </p>
        ),
      },
    ],
  },
  {
    id: 'backup-offline',
    title: 'العمل بدون إنترنت (Offline-First) والنسخ الاحتياطي',
    icon: '💾',
    description: 'استمرار البيع والعمل حتى عند انقطاع الإنترنت، والمزامنة السحابية والتصدير.',
    topics: [
      {
        id: 'offline-operation',
        title: 'كيف يعمل النظام عند انقطاع الإنترنت؟',
        summary: 'يستمر الكاشير في قراءة الباركود، إصدار الفواتير، وطباعة الوصولات بسلاسة تامة.',
        content: (
          <p>
            تم بناء النظام بتقنية PWA و Local Cache المتطورة. في حال انقطاع شبكة الإنترنت أو ضعفها:
            <br />
            • يستمر البيع والبحث وإصدار الفواتير بدون أي توقف.
            <br />
            • تظهر شارة خضراء / برتقالية توضح حالة الاتصال.
            <br />
            • فور عودة الإنترنت، يقوم النظام بمزامنة كافة الحركات تلقائياً مع خوادم السحابة Firebase في الخلفية.
          </p>
        ),
      },
      {
        id: 'backup-export',
        title: 'تصدير النسخ الاحتياطية (Excel و JSON)',
        summary: 'تحميل نسخة كاملة من بيانات المحل على جهازك بضغطة زر في أي وقت.',
        content: (
          <p>
            من القائمة الجانبية (أسفل الشريط)، يمكنك الضغط على **[تحميل نسخة احتياطية]** واختيار صيغة Excel أو ملف JSON، لتبقى بياناتك دائماً في أمان تام ومحفوظة لديك.
          </p>
        ),
      },
    ],
  },
];
