/**
 * Amazon.com.tr Kozmetik Scraper — Playwright
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node amazon-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.amazon.com.tr';
const CATEGORIES = [
  { name: 'fondoten',        q: 'fondöten',                    label: 'Fondöten' },
  { name: 'kapatici',        q: 'kapatıcı makyaj',             label: 'Kapatıcı' },
  { name: 'primer',          q: 'primer makyaj bazı',          label: 'Primer' },
  { name: 'allik',           q: 'allık',                       label: 'Allık' },
  { name: 'pudra',           q: 'pudra makyaj',                label: 'Pudra' },
  { name: 'aydinlatici',     q: 'highlighter aydınlatıcı',     label: 'Aydınlatıcı' },
  { name: 'bronzer',         q: 'bronzer',                     label: 'Bronzer' },
  { name: 'kontur',          q: 'kontür makyaj',               label: 'Kontür' },
  { name: 'maskara',         q: 'maskara',                     label: 'Maskara' },
  { name: 'far',             q: 'göz farı',                    label: 'Göz Farı' },
  { name: 'far-paleti',      q: 'far paleti',                  label: 'Far Paleti' },
  { name: 'eyeliner',        q: 'eyeliner',                    label: 'Eyeliner' },
  { name: 'goz-kalemi',      q: 'göz kalemi',                  label: 'Göz Kalemi' },
  { name: 'ruj',             q: 'ruj',                         label: 'Ruj' },
  { name: 'dudak-parlatici', q: 'dudak parlatıcı lip gloss',   label: 'Dudak Parlatıcı' },
  { name: 'dudak-kalemi',    q: 'dudak kalemi',                label: 'Dudak Kalemi' },
];

const OUTPUT_FILE = path.join(__dirname, 'amazon-products.json');
const DELAY_MS = 2000;
const MAX_PAGES = 3;
const START_ID = 30000;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Sayfadaki urun kartlarindan veri cikarir.
 * Amazon DOM yapisi:
 *   div[data-component-type="s-search-result"] -> urun karti
 *   h2 a span -> urun adi
 *   .a-price .a-offscreen -> fiyat
 *   img.s-image -> gorsel
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    var results = [];
    var seen = {};

    var cards = document.querySelectorAll('[data-component-type="s-search-result"]');

    cards.forEach(function(card) {
      // ASIN kontrolu
      var asin = card.getAttribute('data-asin') || '';
      if (!asin || seen[asin]) return;
      seen[asin] = true;

      // Urun adi: h2 > span (h2'nin parent'i <a> etiketi)
      var h2 = card.querySelector('h2');
      if (!h2) return;
      var nameEl = h2.querySelector('span');
      if (!nameEl) return;
      var name = nameEl.textContent.trim();

      // URL: h2'nin parent <a> etiketi veya karttaki ilk urun linki
      var linkEl = h2.closest('a') || h2.parentElement;
      var rawUrl = (linkEl && linkEl.href) ? linkEl.href : '';

      // Sponsorlu redirect URL'lerden gercek URL'yi cikar
      var productUrl = '';
      if (rawUrl.indexOf('/sspa/click') !== -1) {
        var urlMatch = rawUrl.match(/[?&]url=([^&]+)/);
        if (urlMatch) {
          productUrl = decodeURIComponent(urlMatch[1]);
          if (productUrl.startsWith('/')) productUrl = baseUrl + productUrl;
        }
      }
      if (!productUrl && rawUrl.indexOf('/dp/') !== -1) {
        productUrl = rawUrl;
      }
      // ASIN'den direkt URL olustur (fallback)
      if (!productUrl && asin) {
        productUrl = baseUrl + '/dp/' + asin;
      }
      if (!productUrl) return;

      // Gorsel
      var imgEl = card.querySelector('img.s-image');
      var imageUrl = imgEl ? imgEl.src : '';

      // Fiyat
      var priceEl = card.querySelector('.a-price .a-offscreen');
      var priceText = priceEl ? priceEl.textContent.trim() : '';
      var priceNum = 0;
      if (priceText) {
        priceNum = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
      }

      // Marka - isimden cikar
      var brand = '';

      // Rating
      var ratingEl = card.querySelector('.a-icon-alt');
      var ratingText = ratingEl ? ratingEl.textContent : '';
      var rating = 0;
      var m = ratingText.match(/([\d,]+)/);
      if (m) rating = parseFloat(m[1].replace(',', '.')) || 0;

      // Yorum sayisi
      var reviewEl = card.querySelector('.a-size-base.s-underline-text');
      var reviews = 0;
      if (reviewEl) {
        reviews = parseInt(reviewEl.textContent.replace(/\D/g, '')) || 0;
      }

      if (name && productUrl && priceNum > 0) {
        results.push({
          name: name,
          brand: brand,
          category: catName,
          categoryLabel: catLabel,
          price: priceNum,
          imageUrl: imageUrl,
          productUrl: productUrl,
          rating: rating,
          reviews: reviews,
          barcode: '',
          source: 'amazon'
        });
      }
    });

    return results;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

async function scrapeCategory(page, category) {
  var allProducts = [];
  console.log('\n--- Kategori: ' + category.label + ' ---');

  for (var pg = 1; pg <= MAX_PAGES; pg++) {
    var url = BASE_URL + '/s?k=' + encodeURIComponent(category.q) + '&i=beauty&page=' + pg;
    console.log('  Sayfa ' + pg + ': ' + url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(DELAY_MS);

      // Cookie banner'i kabul et (ilk sayfada)
      try { await page.click('#sp-cc-accept', { timeout: 2000 }); await sleep(500); } catch(e) {}

      // Sayfa yuklendikten sonra scroll et
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1000);

      var products = await extractProducts(page, category.name, category.label);
      console.log('  -> ' + products.length + ' urun bulundu');

      if (products.length === 0) break;
      allProducts = allProducts.concat(products);
    } catch (err) {
      console.log('  HATA: ' + err.message);
      break;
    }
  }

  return allProducts;
}

(async () => {
  console.log('Amazon.com.tr Kozmetik Scraper baslatiliyor...');

  var browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'tr-TR',
    viewport: { width: 1440, height: 900 },
  });

  // Anti-detection
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {} };
  });

  var page = await context.newPage();
  var allProducts = [];

  for (var i = 0; i < CATEGORIES.length; i++) {
    var products = await scrapeCategory(page, CATEGORIES[i]);
    allProducts = allProducts.concat(products);
    console.log('  Toplam: ' + allProducts.length);
    await sleep(1500);
  }

  // Tekrarlari kaldir (URL bazli)
  var unique = {};
  allProducts.forEach(function(p) {
    // ASIN veya URL'den unique key cikar
    var key = p.productUrl.replace(/\?.*$/, '').replace(/\/ref=.*$/, '');
    if (!unique[key] || p.price < unique[key].price) {
      unique[key] = p;
    }
  });
  var finalProducts = Object.values(unique);

  // ID ata
  finalProducts.forEach(function(p, idx) {
    p.id = START_ID + idx;
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalProducts, null, 2), 'utf8');
  console.log('\n' + finalProducts.length + ' urun -> ' + OUTPUT_FILE);

  await browser.close();
})();
