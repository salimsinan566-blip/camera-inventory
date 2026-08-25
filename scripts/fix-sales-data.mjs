import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fivyuexdhgshkwuupcnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SkCeeSd_y7BUbuwzzHxjyA_pMez2Kse';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixSalesAndDebts() {
  const { data: sales, error } = await supabase.from('sales').select('*');
  if (error) {
    console.error('Error fetching sales:', error);
    return;
  }

  console.log(`Analyzing and fixing ${sales.length} sales in Supabase...`);

  let cashFixed = 0;
  let debtFixed = 0;

  for (const s of sales) {
    const total = Number(s.total) || 0;
    const invType = s.invoice_type || 'cash';
    let paidAmount = Number(s.paid_amount) || 0;
    let remainingDebt = Number(s.remaining_debt) || 0;
    let isSettled = Boolean(s.is_settled);

    if (invType === 'cash' || invType === 'mastercard') {
      // Cash / Card sales are fully paid
      paidAmount = total;
      remainingDebt = 0;
      isSettled = true;
      cashFixed++;
    } else if (invType === 'debt') {
      // Debt sales: calculate from payments array or remaining
      const payments = Array.isArray(s.payments) ? s.payments : [];
      const totalPaidFromPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      if (totalPaidFromPayments > 0) {
        paidAmount = totalPaidFromPayments;
      }

      remainingDebt = Math.max(0, total - paidAmount);
      isSettled = remainingDebt <= 0;
      debtFixed++;
    }

    await supabase.from('sales').update({
      paid_amount: paidAmount,
      remaining_debt: remainingDebt,
      is_settled: isSettled,
      updated_at: new Date().toISOString()
    }).eq('id', s.id);
  }

  console.log(`✅ Successfully fixed ${cashFixed} cash sales and ${debtFixed} debt sales!`);
}

fixSalesAndDebts();
