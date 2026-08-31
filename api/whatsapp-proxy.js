/**
 * 🛡️ Vercel Serverless Reverse Proxy for WhatsApp Evolution API
 * يحل هذا البروكسي مشكلة Mixed Content (حجب طلبات HTTP من مواقع HTTPS في المتصفح)
 * ويضمن وصول الطلبات من المتصفح إلى خادم AWS بأمان تام وبدون أي أخطاء CORS أو Mixed Content.
 */

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const targetUrl = req.query?.url || req.headers['x-target-url'];
    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing target url parameter (?url=...)' });
    }

    const apikey = req.headers['apikey'] || req.query?.apikey || 'SafeZone2026';

    const headers = {
      'apikey': apikey,
      'Content-Type': 'application/json'
    };

    const fetchOptions = {
      method: req.method,
      headers
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    fetchOptions.signal = controller.signal;

    const response = await fetch(targetUrl, fetchOptions);
    clearTimeout(timeoutId);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }

  } catch (error) {
    console.error('WhatsApp Proxy Error:', error.message);
    return res.status(502).json({
      error: 'Proxy Gateway Error',
      message: error.message,
      hint: 'تأكد من فتح المنفذ 8080 في AWS Security Groups'
    });
  }
}
