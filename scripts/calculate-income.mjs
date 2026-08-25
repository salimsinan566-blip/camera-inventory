import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function computeExactIncome() {
  const { data: sales } = await supabase.from('sales').select('*');
  const { data: incomes } = await supabase.from('incomes').select('*');
  const { data: expenses } = await supabase.from('expenses').select('*');

  const todayStr = '2026-08-24'; // Current local date in environment

  // 1. Sales breakdown
  let allTimeSalesTotal = 0;
  let allTimeCashCollected = 0;
  let allTimeDebtRemaining = 0;

  let todaySalesTotal = 0;
  let todayCashSales = 0;
  let todayMastercardSales = 0;
  let todayDebtSales = 0;
  let todayDebtRepayments = 0;

  sales.forEach(s => {
    const total = Number(s.total) || 0;
    const paid = Number(s.paid_amount) || 0;
    const rem = Number(s.remaining_debt) || 0;
    const invType = s.invoice_type || 'cash';
    const sDate = (s.created_at || '').slice(0, 10);

    allTimeSalesTotal += total;
    allTimeCashCollected += paid;
    allTimeDebtRemaining += rem;

    if (sDate === todayStr) {
      todaySalesTotal += total;
      if (invType === 'cash') todayCashSales += total;
      if (invType === 'mastercard') todayMastercardSales += total;
      if (invType === 'debt') todayDebtSales += total;
    }

    // Debt payments made today
    if (Array.isArray(s.payments)) {
      s.payments.forEach(p => {
        const pDate = (p.date || '').slice(0, 10);
        if (pDate === todayStr) {
          todayDebtRepayments += Number(p.amount) || 0;
        }
      });
    }
  });

  // 2. Extra Incomes breakdown
  let allTimeExtraIncomes = 0;
  let todayExtraIncomes = 0;

  incomes.forEach(inc => {
    const amt = Number(inc.amount) || 0;
    const iDate = (inc.date || inc.created_at || '').slice(0, 10);
    allTimeExtraIncomes += amt;
    if (iDate === todayStr) {
      todayExtraIncomes += amt;
    }
  });

  // 3. Expenses breakdown
  let allTimeExpenses = 0;
  let todayExpenses = 0;
  expenses.forEach(exp => {
    const amt = Number(exp.amount) || 0;
    const eDate = (exp.date || exp.created_at || '').slice(0, 10);
    allTimeExpenses += amt;
    if (eDate === todayStr) todayExpenses += amt;
  });

  console.log('=== إحصائيات الدخل والإيرادات بدقة ===\n');
  console.log(`1. دخل اليوم (${todayStr}):`);
  console.log(`   - إجمالي مبيعات اليوم: ${todaySalesTotal.toLocaleString()} د.ع`);
  console.log(`   - المقبوضات النقدية اليوم: ${todayCashSales.toLocaleString()} د.ع`);
  console.log(`   - مقبوضات الماستركارد اليوم: ${todayMastercardSales.toLocaleString()} د.ع`);
  console.log(`   - إيرادات إضافية لليوم: ${todayExtraIncomes.toLocaleString()} د.ع`);
  console.log(`   - تسديدات ديون مستلمة اليوم: ${todayDebtRepayments.toLocaleString()} د.ع`);
  console.log(`   - مصروفات اليوم: ${todayExpenses.toLocaleString()} د.ع`);

  console.log(`\n2. الدخل والإيرادات الإجمالية (الكلي All-time):`);
  console.log(`   - إجمالي قيمة المبيعات: ${allTimeSalesTotal.toLocaleString()} د.ع`);
  console.log(`   - إجمالي النقد الواصل والمستلم: ${allTimeCashCollected.toLocaleString()} د.ع`);
  console.log(`   - إجمالي الإيرادات الإضافية: ${allTimeExtraIncomes.toLocaleString()} د.ع`);
  console.log(`   - مجموع المقبوضات الكلي (مبيعات واصلة + إيرادات إضافية): ${(allTimeCashCollected + allTimeExtraIncomes).toLocaleString()} د.ع`);
  console.log(`   - إجمالي الديون المتبقية بذمة العملاء: ${allTimeDebtRemaining.toLocaleString()} د.ع`);
  console.log(`   - إجمالي المصروفات الكلية: ${allTimeExpenses.toLocaleString()} د.ع`);
  console.log(`   - صافي النقد الكلي (المقبوضات - المصروفات): ${(allTimeCashCollected + allTimeExtraIncomes - allTimeExpenses).toLocaleString()} د.ع`);
}

computeExactIncome();
