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
const DELAY_MS = 2500;
const MAX_PAGES = 3;
const START_ID = 25000;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Sayfadaki urun kartlarindan veri cikarir.
 * Hepsiburada'nin DOM yapisi:
 *   article.horizontalProductCard -> a[href*="-p-"] -> h2[data-test-id="title-N"]
 *   [data-test-id="final-price-N"] -> fiyat
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel }) => {
    var results = [];
    var seen = {};

    // Tum urun linklerini bul
    var links = document.querySelectorAll('a[href*="-p-"]');

    links.forEach(function(link) {
      // URL'yi temizle (reklam redirect'lerinden gercek URL'yi cikar)
      var rawUrl = link.href || '';
      var productUrl = rawUrl;

      // Reklam redirect URL'lerinden gercek URL'yi cikar
      if (rawUrl.includes('adservice.hepsiburada.com') || rawUrl.includes('redirect=')) {
        var redirectMatch = rawUrl.match(/redirect=([^&]+)/);
        if (redirectMatch) {
          productUrl = decodeURIComponent(redirectMatch[1]);
        }
      }

      // Sadece hepsiburada urun URL'lerini al
      if (!productUrl.includes('hepsiburada.com') || !productUrl.includes('-p-')) return;

      // SKU cikar (URL'deki -p-XXXXX kismi)
      var skuMatch = productUrl.match(/-p-([A-Z0-9]+)/);
      var sku = skuMatch ? skuMatch[1] : '';

      if (seen[sku] || seen[productUrl]) return;
      if (sku) seen[sku] = true;
      seen[productUrl] = true;

      // Urun ismi — title attribute veya aria-label
      var name = link.getAttribute('title') || '';
      if (!name) {
        var h2 = link.querySelector('h2, [data-test-id^="title"]');
        if (h2) {
          name = h2.getAttribute('aria-label') || h2.textContent || '';
          // "Sepete ekle, fiyat: XXX TL, BRAND Name" formatini temizle
          name = name.replace(/^Sepete ekle,\s*fiyat:\s*[\d.,]+\s*TL,\s*/i, '');
        }
      }
      if (!name) return;
      name = name.replace(/\s+/g, ' ').trim();

      // Marka — ismin basindaki marka adi
      var brand = '';
      // Link'in title'inda "MARKA urun adi" seklinde olabilir
      var titleAttr = link.getAttribute('title') || '';
      // Ust parent'tan marka bilgisi
      var article = link.closest('article') || link.closest('li') || link.closest('div');
      if (article) {
        var brandEl = article.querySelector('[class*="brand"], [data-test-id*="brand"]');
        if (brandEl) brand = brandEl.textContent.trim();
      }

      // Fiyat
      var price = 0;
      if (article) {
        var priceEl = article.querySelector('[data-test-id^="final-price"], [class*="price"]');
        if (priceEl) {
          var priceText = priceEl.textContent.replace(/\s+/g, '');
          var priceMatch = priceText.match(/([\d.]+,\d+)/);
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) || 0;
          }
        }
      }

      // Gorsel
      var imageUrl = '';
      if (article) {
        var imgEl = article.querySelector('img[src*="productimages"]');
        if (imgEl) {
          imageUrl = imgEl.src || '';
          // Daha buyuk gorsel al
          imageUrl = imageUrl.replace(/\/\d+-\d+\//, '/400-400/');
        }
      }

      // Rating
      var rating = 0;
      if (article) {
        var ratingEl = article.querySelector('[class*="rating"] span, [class*="star"]');
        if (ratingEl) {
          var rVal = parseFloat(ratingEl.textContent);
          if (rVal > 0 && rVal <= 5) rating = rVal;
        }
      }

      // magaza parametresini kaldir, temiz URL olustur
      try {
        var urlObj = new URL(productUrl);
        urlObj.searchParams.delete('magaza');
        productUrl = urlObj.toString();
      } catch(e) {}

      results.push({
        name: name,
        brand: brand,
        category: catName,
        categoryLabel: catLabel,
        price: price,
        imageUrl: imageUrl,
        productUrl: productUrl,
        sku: sku,
        rating: rating,
        reviews: 0,
        source: 'hepsiburada',
      });
    });

    return results;
  }, { catName, catLabel });
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

  for (var pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    var url = BASE_URL + '/ara?q=' + encodeURIComponent(category.q) + '&sayfa=' + pageNum;
    console.log('  Sayfa ' + pageNum + ': ' + url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000);

      // Scroll to load lazy images
      for (var i = 0; i < 6; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.7));
        await sleep(500);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);

      var products = await extractProducts(page, category.name, category.label);
      console.log('  -> ' + products.length + ' urun bulundu');

      if (products.length === 0) {
        console.log('  -> Urun yok, kategori tamamlandi.');
        break;
      }

      allProducts.push(...products);

      // Sayfa basa sarisinda 3'ten az urun varsa son sayfa
      if (products.length < 10) break;

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

  var browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'tr-TR',
    extraHTTPHeaders: {
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['tr-TR', 'tr', 'en-US', 'en'] });
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
