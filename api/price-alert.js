export default function handler(req, res) {
  if (req.method === 'POST') {
    const { productId, email } = req.body;
    if (!productId || !email) {
      return res.status(400).json({ error: 'Eksik parametre' });
    }
    console.log(`Yeni fiyat alarmı eklendi: ProductID=${productId}, Email=${email}`);
    
    // Gerçek bir senaryoda bu veriler Supabase veya veritabanına kaydedilir.
    return res.status(200).json({ success: true, message: 'Alarm başarıyla kuruldu' });
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}
