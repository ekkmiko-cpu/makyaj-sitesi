/**
 * Yves Rocher — bozuk görsel URL'lerini ürün sayfasından düzelt
 * node fix-yr-images.js
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, 'yvesrocher-products.json');
const BASE   = 'https://www.yvesrocher.com.tr';

const BROKEN_CODES = [
  '54337','42067','08162','82974','87217',
  '57765','56447','52473','60028','51820',
  '89238','94457','90791','39665'
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const products = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  const toFix = products.filter(p => {
    const code = p.productUrl.match(/\/p\/(\d+)/)?.[1];
    return BROKEN_CODES.includes(code);
  });
  console.log('Düzeltilecek:', toFix.length, 'ürün');

  const browser = await chromium.launch({ headless: true, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'tr-TR', viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const page = await ctx.newPage();
  let fixed = 0;

  for (const p of toFix) {
    console.log('  Açılıyor:', p.name, '|', p.productUrl);
    try {
      await page.goto(p.productUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(800);

      const imgUrl = await page.evaluate(() => {
        const prod = window.data && window.data.components && window.data.components['product'];
        if (!prod || !prod.product) return null;
        const pp = prod.product;
        // Birincil: images dizisi
        if (pp.images && pp.images.length > 0) {
          const primary = pp.images.find(i => i.format === 'product' || i.imageType === 'PRIMARY') || pp.images[0];
          if (primary && primary.url) return primary.url;
        }
        // Yedek: galleryImages
        if (pp.galleryImages && pp.galleryImages.length > 0) {
          const g = pp.galleryImages[0];
          if (g && g.url) return g.url;
        }
        // Yedek: picture.url
        if (pp.picture && pp.picture.url) return pp.picture.url;
        return null;
      });

      if (imgUrl) {
        // context= parametresini koru — görselin orijinal hali
        const fullUrl = imgUrl.startsWith('http') ? imgUrl : 'https://medias.yvesrocher.com.tr' + imgUrl;
        console.log('    ✓ Görsel:', fullUrl.slice(0, 80) + '...');
        p.imageUrl = fullUrl;
        fixed++;
      } else {
        // og:image dene
        const ogImg = await page.evaluate(() => {
          const el = document.querySelector('meta[property="og:image"]');
          return el ? el.getAttribute('content') : null;
        });
        if (ogImg) {
          console.log('    ✓ OG görsel:', ogImg.slice(0, 80) + '...');
          p.imageUrl = ogImg;
          fixed++;
        } else {
          console.log('    ✗ Görsel bulunamadı');
        }
      }
    } catch (err) {
      console.log('    ✗ Hata:', err.message);
    }
    await sleep(600);
  }

  await browser.close();

  // products dizisini güncelle (p referansları zaten güncellendi)
  fs.writeFileSync(OUTPUT, JSON.stringify(products, null, 2));
  console.log('\nTamamlandı:', fixed, '/', toFix.length, 'görsel düzeltildi');
}

main().catch(e => { console.error(e.message); process.exit(1); });
