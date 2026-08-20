export default async function handler(req, res) {
  // Add CORS headers for the frontend to call this API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { pdfBase64, filename } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: 'No PDF provided' });
    }

    const botToken = process.env.VITE_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.VITE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return res.status(500).json({ error: 'Telegram credentials missing' });
    }

    // Remove the data URI prefix if it exists
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('document', blob, filename || 'Shortages_Report.pdf');
    formData.append('caption', '📄 تقرير النواقص بصيغة PDF (تم الإرسال من لوحة التحكم)');

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Telegram API Error: ${response.statusText}`);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('PDF Send Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
