// Basit in-memory rate limiter (per-IP, Vercel serverless-safe — her instance ayrı)
const rateMap = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, reset: now + RATE_WINDOW_MS };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + RATE_WINDOW_MS; }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count > RATE_MAX;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Çok fazla istek, lütfen bekleyin' });
  }

  const { productId, email } = req.body || {};

  if (!productId || !email) {
    return res.status(400).json({ error: 'Eksik parametre' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Geçersiz e-posta adresi' });
  }
  if (typeof productId !== 'number' && (typeof productId !== 'string' || !/^\d+$/.test(productId))) {
    return res.status(400).json({ error: 'Geçersiz ürün ID' });
  }

  // TODO: Supabase veya veritabanına kaydet
  console.log(`Fiyat alarmı: ProductID=${productId}, Email=${email.slice(0, 3)}***`);

  return res.status(200).json({ success: true, message: 'Alarm başarıyla kuruldu' });
}
