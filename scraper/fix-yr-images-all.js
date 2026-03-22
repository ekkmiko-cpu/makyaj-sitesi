/**
 * Yves Rocher — TÜM bozuk görsel URL'lerini düzelt (149 ürün)
 * CDN ?context= parametresi olmadan çalışmıyor, ürün sayfasından alıyoruz.
 * node fix-yr-images-all.js
 */
const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

const OUTPUT  = path.join(__dirname, 'yvesrocher-products.json');
const CKPT    = path.join(__dirname, 'yr-img-fix-checkpoint.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getImageFromPage(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(600);
    return await page.evaluate(() => {
      const prod = window.data && window.data.components && window.data.components['product'];
      if (!prod || !prod.product) return null;
      const pp = prod.product;
      if (pp.images && pp.images.length > 0) {
        const primary = pp.images.find(i => i.imageType === 'PRIMARY' || i.galleryIndex === 0) || pp.images[0];
        if (primary && primary.url) return primary.url;
      }
      if (pp.galleryImages && pp.galleryImages.length > 0 && pp.galleryImages[0].url) return pp.galleryImages[0].url;
      if (pp.picture && pp.picture.url) return pp.picture.url;
      return null;
    });
  } catch (e) {
    return null;
  }
}

async function main() {
  const products = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));

  // Sadece named (bozuk) URL'leri al
  const toFix = products.filter(p => p.imageUrl && !p.imageUrl.includes('?context='));
  console.log('Düzeltilecek:', toFix.length, 'ürün\n');

  // Checkpoint
  let ckpt = {};
  if (fs.existsSync(CKPT)) ckpt = JSON.parse(fs.readFileSync(CKPT, 'utf8'));
  const todo = toFix.filter(p => !(p.productUrl in ckpt));
  console.log('Kalan:', todo.length, '(checkpoint:', Object.keys(ckpt).length, ')');

  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'tr-TR', viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const page = await ctx.newPage();
  let fixed = 0, notFound = 0;

  for (let i = 0; i < todo.length; i++) {
    const p = todo[i];
    const imgUrl = await getImageFromPage(page, p.productUrl);

    if (imgUrl) {
      const full = imgUrl.startsWith('http') ? imgUrl : 'https://medias.yvesrocher.com.tr' + imgUrl;
      ckpt[p.productUrl] = full;
      fixed++;
    } else {
      ckpt[p.productUrl] = null;
      notFound++;
    }

    // Checkpoint her 10'da bir
    if ((i + 1) % 10 === 0 || i === todo.length - 1) {
      fs.writeFileSync(CKPT, JSON.stringify(ckpt));
      process.stdout.write(`\r  ${i+1}/${todo.length} — düzeltildi: ${fixed}, bulunamadı: ${notFound}`);
    }
    await sleep(400);
  }

  await browser.close();
  console.log('\n');

  // Ürün dosyasını güncelle
  let updated = 0;
  products.forEach(p => {
    if (p.productUrl in ckpt && ckpt[p.productUrl]) {
      p.imageUrl = ckpt[p.productUrl];
      updated++;
    }
  });

  fs.writeFileSync(OUTPUT, JSON.stringify(products, null, 2));
  console.log('Güncellendi:', updated, 'ürün');

  // Sonuç özeti
  const stillBroken = products.filter(p => p.imageUrl && !p.imageUrl.includes('?context=') && !p.imageUrl.match(/\.(jpg|png|webp|jpeg)/i));
  console.log('Hâlâ bozuk olabilecek:', stillBroken.length);
}

main().catch(e => { console.error(e.message); process.exit(1); });
