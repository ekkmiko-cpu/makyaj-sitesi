/**
 * Hepsiburada TR Makeup Scraper
 * Playwright ile gercek tarayici kullanir (bot korumasi nedeniyle).
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node hepsiburada-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.hepsiburada.com';
const CATEGORIES = [
  { name: 'fondoten',        q: 'fondoten',           catId: '702', label: 'Fondoten' },
  { name: 'kapatici',        q: 'kapatici makyaj',    catId: '702', label: 'Kapatici' },
  { name: 'primer',          q: 'primer makyaj bazi', catId: '702', label: 'Primer' },
  { name: 'allik',           q: 'allik',              catId: '702', label: 'Allik' },
  { name: 'pudra',           q: 'pudra makyaj',       catId: '702', label: 'Pudra' },
  { name: 'aydinlatici',     q: 'highlighter aydinlatici', catId: '702', label: 'Aydinlatici' },
  { name: 'bronzer',         q: 'bronzer',            catId: '702', label: 'Bronzer' },
  { name: 'kontur',          q: 'kontur makyaj',      catId: '702', label: 'Kontur' },
  { name: 'maskara',         q: 'maskara',            catId: '702', label: 'Maskara' },
  { name: 'far',             q: 'goz fari',           catId: '702', label: 'Goz Fari' },
  { name: 'far-paleti',      q: 'far paleti',         catId: '702', label: 'Far Paleti' },
  { name: 'eyeliner',        q: 'eyeliner',           catId: '702', label: 'Eyeliner' },
  { name: 'goz-kalemi',      q: 'goz kalemi',         catId: '702', label: 'Goz Kalemi' },
  { name: 'ruj',             q: 'ruj',                catId: '702', label: 'Ruj' },
  { name: 'dudak-parlatici', q: 'dudak parlatici lip gloss', catId: '702', label: 'Dudak Parlatici' },
  { name: 'dudak-kalemi',    q: 'dudak kalemi',       catId: '702', label: 'Dudak Kalemi' },
  // ── Yeni kategoriler (Akakce uyumu) ─────────────────────────────────────────
  { name: 'dipliner',           q: 'dipliner',                      catId: '702', label: 'Dipliner' },
  { name: 'kas-kalemi',         q: 'kas kalemi makyaj',             catId: '702', label: 'Kas Kalemi' },
  { name: 'kas-fari',           q: 'kas fari',                      catId: '702', label: 'Kas Fari' },
  { name: 'kas-sabitleyici',    q: 'kas sabitleyici jeli',          catId: '702', label: 'Kas Sabitleyici' },
  { name: 'bb-cc-krem',         q: 'bb krem cc krem makyaj',        catId: '702', label: 'BB CC Krem' },
  { name: 'makyaj-sabitleyici', q: 'makyaj sabitleyici sprey',      catId: '702', label: 'Makyaj Sabitleyici' },
  { name: 'makyaj-seti',        q: 'makyaj seti',                   catId: '702', label: 'Makyaj Seti' },
  { name: 'vucut-simi',         q: 'vucut simi',                    catId: '702', label: 'Vucut Simi' },
];

const OUTPUT_FILE = path.join(__dirname, 'hepsiburada-products.json');
const DELAY_MS = 2000;
const MAX_PAGES = 10;   // sayfa basina ~28 urun → 10 sayfa × 24 kat = ~6700 (dedup oncesi)
const START_ID = 25000;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Sayfadaki urun kartlarindan veri cikarir.
 * Hepsiburada 2024+ DOM yapisi: her urun bir <article> elementi.
 * Icerisindeki ilk hepsiburada.com linki urun URL'si, adservice linkleri reklam.
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    var results = [];
    var seen = {};

    var articles = document.querySelectorAll('article');

    articles.forEach(function(art) {
      // adservice olmayan ilk hepsiburada linki
      var links = art.querySelectorAll('a[href]');
      var productUrl = '';
      for (var i = 0; i < links.length; i++) {
        var href = links[i].href || '';
        if (href.includes('hepsiburada.com') && !href.includes('adservice') && !href.includes('/ara?')) {
          productUrl = href;
          break;
        }
      }
      if (!productUrl) return;

      // Dedup
      var dedupKey = productUrl.split('?')[0];
      if (seen[dedupKey]) return;
      seen[dedupKey] = true;

      // Urun adi
      var name = '';
      var nameEl = art.querySelector('h2, h3, [data-test-id*="title"], [class*="title"]');
      if (nameEl) name = nameEl.textContent.replace(/\s+/g, ' ').trim();
      if (!name) return;

      // Marka
      var brand = '';
      var brandEl = art.querySelector('[class*="brand"], [data-test-id*="brand"]');
      if (brandEl) brand = brandEl.textContent.trim();

      // Fiyat — en dusuk fiyati al
      var price = 0;
      var priceEls = art.querySelectorAll('[data-test-id*="price"], [class*="price"], [class*="Price"]');
      priceEls.forEach(function(el) {
        var txt = el.textContent.replace(/\s+/g, '');
        var m = txt.match(/([\d]+[.,][\d]+)/);
        if (m) {
          var v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')) || 0;
          if (v > 0 && (price === 0 || v < price)) price = v;
        }
      });

      // Gorsel
      var imageUrl = '';
      var imgEl = art.querySelector('img[src*="productimages"], img[src*="hbcdn"], img[src]');
      if (imgEl) imageUrl = imgEl.src || '';

      // Rating
      var rating = 0;
      var ratingEl = art.querySelector('[class*="rating"], [class*="star"], [aria-label*="puan"]');
      if (ratingEl) {
        var rv = parseFloat(ratingEl.textContent.replace(',', '.'));
        if (rv > 0 && rv <= 5) rating = rv;
      }

      // Temiz URL (query string kaldir)
      try {
        var u = new URL(productUrl);
        u.search = '';
        productUrl = u.toString();
      } catch(e) {}

      results.push({
        name: name,
        brand: brand,
        category: catName,
        categoryLabel: catLabel,
        price: price,
        imageUrl: imageUrl,
        productUrl: productUrl,
        rating: rating,
        reviews: 0,
        source: 'hepsiburada',
      });
    });

    return results;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

/**
 * URL'den marka adi cikarma yardimcisi
 */
function extractBrandFromName(name) {
  // Bilinen markalar
  var knownBrands = [
    'Maybelline New York', 'Maybelline', "L'Oreal Paris", "L'Oréal Paris", 'Loreal',
    'Flormar', 'Golden Rose', 'Note', 'Note Cosmetique', 'Note Cosmetics',
    'Pastel', 'Essence', 'Catrice', 'NYX', 'MAC', 'KIKO', 'Revolution',
    'Revlon', 'Max Factor', 'Rimmel', 'Bourjois', 'Clinique', 'Estee Lauder',
    'Lancome', 'Lancôme', 'Dior', 'Chanel', 'Nars', 'Too Faced', 'Urban Decay',
    'Benefit', 'Charlotte Tilbury', 'Bobbi Brown', 'Shiseido', 'Clarins',
    'Deborah', 'Pupa', 'Alix Avien', 'Gabrini', 'New Well', 'Inglot',
    'Missha', 'The Saem', 'Innisfree', 'Laneige', 'Huda Beauty',
    'Yves Rocher', 'Avon', 'Oriflame', 'Farmasi',
  ];

  var nameLower = name.toLowerCase();
  for (var i = 0; i < knownBrands.length; i++) {
    if (nameLower.startsWith(knownBrands[i].toLowerCase())) {
      return knownBrands[i];
    }
  }
  return '';
}

/**
 * Bir kategoriyi arama ile tarar
 */
async function scrapeCategory(page, category) {
  console.log('\n[' + category.label + '] taraniyor (' + category.q + ')...');
  var allProducts = [];
  var seenUrls = new Set();

  for (var pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    var url = BASE_URL + '/ara?q=' + encodeURIComponent(category.q) + '&sayfa=' + pageNum;
    console.log('  Sayfa ' + pageNum + ': ' + url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // article'larin render olmasi icin bekle (CI'da daha yavas olabilir)
      await page.waitForSelector('article', { timeout: 12000 }).catch(() => {});
      await sleep(1500);

      // Lazy load icin 3 scroll
      for (var i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await sleep(400);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);

      var products = await extractProducts(page, category.name, category.label);
      var newCount = 0;
      products.forEach(function(p) {
        var key = (p.productUrl || '').replace(/\?.*$/, '');
        if (key && !seenUrls.has(key)) { seenUrls.add(key); newCount++; }
      });
      console.log('  -> Sayfa ' + pageNum + ': ' + products.length + ' urun (' + newCount + ' yeni)');

      if (products.length === 0) {
        console.log('  -> Urun yok, kategori tamamlandi.');
        break;
      }

      allProducts.push(...products);
      // Dinamik erken cikis: bu sayfa onceki sayfalarla ≥%80 ortusuyorsa dur
      if (pageNum > 1 && newCount === 0) { console.log('  -> Yeni urun yok, durduruluyor.'); break; }
      if (pageNum > 1 && products.length > 0 && (newCount / products.length) < 0.2) { console.log('  -> Sayfa cogunlukla dublike, durduruluyor.'); break; }
      await sleep(DELAY_MS);
    } catch(err) {
      console.log('  HATA: ' + err.message.substring(0, 100));
      break;
    }
  }

  return allProducts;
}

/**
 * Urun detay sayfasindan barcode bilgisi cikar
 */
async function enrichWithBarcode(page, product) {
  if (!product.productUrl) return product;
  try {
    await page.goto(product.productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);

    var details = await page.evaluate(() => {
      var barcode = '';
      var brand = '';

      // Hepsiburada urun detayinda barcode genelde "Barkod" satirinda
      var rows = document.querySelectorAll('tr, [class*="spec"] div, [class*="detail"] li');
      rows.forEach(function(row) {
        var text = row.textContent || '';
        if (text.match(/barkod|barcode|ean|gtin/i)) {
          var match = text.match(/(\d{8,14})/);
          if (match) barcode = match[1];
        }
      });

      // Meta tag'lerden
      var metaEan = document.querySelector('meta[itemprop="gtin13"], meta[property="product:ean"]');
      if (metaEan) barcode = metaEan.content;

      // JSON-LD'den
      var scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach(function(s) {
        try {
          var json = JSON.parse(s.textContent);
          if (json.gtin13) barcode = json.gtin13;
          if (json.gtin) barcode = json.gtin;
          if (json.brand && json.brand.name) brand = json.brand.name;
        } catch(e) {}
      });

      // Brand from breadcrumb or page
      if (!brand) {
        var brandEl = document.querySelector('[class*="brand"], [itemprop="brand"]');
        if (brandEl) brand = brandEl.textContent.trim();
      }

      return { barcode: barcode, brand: brand };
    });

    if (details.barcode) product.barcode = details.barcode;
    if (details.brand && !product.brand) product.brand = details.brand;
  } catch(e) {
    // skip
  }
  return product;
}

async function main() {
  console.log('=== Hepsiburada TR Scraper ===\n');

  // NOT: Hepsiburada Akamai bot koruması default Chromium'u headless'da yakalıyor.
  // Çözüm: real Chrome (channel: 'chrome') + Sec-Ch-Ua client hints + güçlü stealth.
  // Bu kombinasyonla headless: true 200 OK döner.
  var browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]
  });

  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'tr-TR',
    extraHTTPHeaders: {
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Ch-Ua': '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1',
    }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
  });

  var page = await context.newPage();

  // Ana sayfayi ziyaret et (cookie/session olustur)
  console.log('Ana sayfa ziyaret ediliyor...');
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
  } catch(e) {
    console.log('Ana sayfa yukleme hatasi: ' + e.message.substring(0, 80));
  }

  // Tum kategorileri tara
  var allProducts = [];
  for (var cat of CATEGORIES) {
    try {
      var products = await scrapeCategory(page, cat);
      allProducts.push(...products);
    } catch(err) {
      console.log('  [' + cat.label + '] hata: ' + err.message.substring(0, 80));
    }
    await sleep(DELAY_MS);
  }

  // Tekrarlanan urunleri cikar
  var seen = {};
  allProducts = allProducts.filter(function(p) {
    var key = p.sku || p.productUrl;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });

  console.log('\nToplam benzersiz: ' + allProducts.length + ' urun');

  // Marka bilgisi eksik olanlari isimden cikar
  allProducts = allProducts.map(function(p) {
    if (!p.brand) {
      p.brand = extractBrandFromName(p.name);
    }
    // Marka adini urun isminden cikar (tekrar onlemek icin)
    if (p.brand && p.name.toLowerCase().startsWith(p.brand.toLowerCase())) {
      p.name = p.name.substring(p.brand.length).replace(/^\s+/, '');
    }
    return p;
  });

  // Barkod zenginlestirme (ilk 80 urun)
  var enrichCount = Math.min(allProducts.length, 80);
  if (enrichCount > 0) {
    console.log('\nBarkod bilgisi araniyor (ilk ' + enrichCount + ' urun)...');
    for (var i = 0; i < enrichCount; i++) {
      if (i % 20 === 0) console.log('  ' + i + '/' + enrichCount + '...');
      allProducts[i] = await enrichWithBarcode(page, allProducts[i]);
      await sleep(800);
    }
    var barcoded = allProducts.filter(function(p) { return p.barcode; }).length;
    console.log('Barkodlu: ' + barcoded + '/' + allProducts.length);
  }

  // ID ata
  allProducts = allProducts.map(function(p, i) {
    return { id: START_ID + i, ...p };
  });

  // Kaydet
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2), 'utf8');

  // Ozet
  console.log('\nKaydedildi: ' + OUTPUT_FILE);
  console.log('Kategori ozeti:');
  var cats = {};
  allProducts.forEach(function(p) { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).forEach(function(e) { console.log('  ' + e[0] + ': ' + e[1] + ' urun'); });
  console.log('\nToplam: ' + allProducts.length + ' urun');
  console.log('Barkodlu: ' + allProducts.filter(function(p) { return p.barcode; }).length);
  console.log('Markali: ' + allProducts.filter(function(p) { return p.brand; }).length);
  console.log('Fiyatli: ' + allProducts.filter(function(p) { return p.price > 0; }).length);

  await browser.close();
}

main().catch(function(err) { console.error('Kritik hata:', err.message); process.exit(1); });
