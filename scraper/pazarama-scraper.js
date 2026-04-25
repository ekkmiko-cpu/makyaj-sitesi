/**
 * Pazarama Kozmetik Scraper — Playwright
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node pazarama-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { preflightCheck } = require('./robots-checker');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.pazarama.com';
// Kategori URL'leri Pazarama sitemap'inden alindi (robots.txt'de `/arama` engelli ama /kategori-k-kxxxxx yollari serbest)
const CATEGORIES = [
  { name: 'fondoten',           path: '/fondoten-k-k07206',                    label: 'Fondöten' },
  { name: 'kapatici',           path: '/kapatici-concealer-k-k07207',          label: 'Kapatıcı' },
  { name: 'primer',             path: '/makyaj-bazi-k-k07209',                 label: 'Primer' },
  { name: 'allik',              path: '/allik-k-k07202',                       label: 'Allık' },
  { name: 'pudra',              path: '/pudra-k-k07211',                       label: 'Pudra' },
  { name: 'aydinlatici',        path: '/aydinlatici-highlighter-k-k07203',     label: 'Aydınlatıcı' },
  { name: 'bronzer',            path: '/bronzer-k-k07205',                     label: 'Bronzer' },
  { name: 'kontur',             path: '/kontur-k-k07208',                      label: 'Kontür' },
  { name: 'maskara',            path: '/rimel-maskara-k-k07176',               label: 'Maskara' },
  { name: 'far',                path: '/far-k-k07169',                         label: 'Göz Farı' },
  { name: 'far-bazi',           path: '/far-bazi-k-k07170',                    label: 'Far Bazı' },
  { name: 'eyeliner',           path: '/eyeliner-k-k07168',                    label: 'Eyeliner' },
  { name: 'goz-kalemi',         path: '/goz-kalemi-k-k07171',                  label: 'Göz Kalemi' },
  { name: 'ruj',                path: '/ruj-k-k07166',                         label: 'Ruj' },
  { name: 'dudak-parlatici',    path: '/dudak-parlatici-k-k07165',             label: 'Dudak Parlatıcı' },
  { name: 'dudak-kalemi',       path: '/dudak-kalemi-k-k07164',                label: 'Dudak Kalemi' },
  // ── Akakce uyumu ────────────────────────────────────────────────────────────
  { name: 'kas-kalemi',         path: '/kas-kalemi-k-k07175',                  label: 'Kas Kalemi' },
  { name: 'kas-fari',           path: '/kas-fari-k-k07174',                    label: 'Kas Fari' },
  { name: 'kas-boyasi',         path: '/kas-boyasi-k-k07173',                  label: 'Kas Boyasi' },
  { name: 'bb-cc-krem',         path: '/bb-cc-krem-k-k07204',                  label: 'BB CC Krem' },
  { name: 'makyaj-sabitleyici', path: '/makyaj-sabitleyici-sprey-k-k07210',    label: 'Makyaj Sabitleyici' },
  { name: 'makyaj-seti',        path: '/makyaj-setleri-k-k07187',              label: 'Makyaj Seti' },
  { name: 'takma-kirpik',       path: '/takma-kirpik-k-k07177',                label: 'Takma Kirpik' },
  { name: 'kirpik-kivirici',    path: '/kirpik-kivirici-k-k07181',             label: 'Kirpik Kivirici' },
];

const OUTPUT_FILE = path.join(__dirname, 'pazarama-products.json');
const DELAY_MS = 2000;
const MAX_PAGES = 12;
const START_ID = 40000;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Pazarama arama sonuclarindan urunleri cikarir.
 * URL yapisi: /urun-adi-p-BARCODE seklinde, barcode EAN olabilir
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    var results = [];
    var seen = {};

    // Tum urun linklerini bul
    var links = document.querySelectorAll('a[href*="-p-"]');
    var processedUrls = new Set();

    links.forEach(function(link) {
      var href = link.href || link.getAttribute('href') || '';
      if (!href || href.length < 10) return;

      var fullUrl = href.startsWith('/') ? baseUrl + href : href;
      var cleanUrl = fullUrl.replace(/\?.*$/, '');
      if (processedUrls.has(cleanUrl)) return;
      processedUrls.add(cleanUrl);

      // Container bul
      var container = link.closest('[class*="product"], [class*="card"], [class*="item"], li, article') || link.parentElement;
      if (!container) return;

      // Urun adi
      var nameEl = container.querySelector('h2, h3, h4, [class*="name"], [class*="title"], [class*="Name"], [class*="Title"]');
      var name = nameEl ? nameEl.textContent.trim() : '';
      if (!name) {
        // Link text'inden al
        name = link.textContent.trim();
      }
      if (!name || name.length < 5) return;

      // Fiyat — dikkat: bazi fiyat elementleri "799,90 TL 399,00 TL" gibi
      // orijinal + indirimli fiyati icice barindirir. Son (en dusuk) fiyati al.
      var priceEls = container.querySelectorAll('[class*="price"], [class*="Price"], [class*="fiyat"]');
      var priceNum = 0;
      priceEls.forEach(function(el) {
        if (priceNum > 0) return;
        var txt = el.textContent.trim();
        if (txt.indexOf('TL') !== -1 || /\d/.test(txt)) {
          // Birden fazla fiyat olabilir — TL ile ayır veya tüm sayıları bul
          var allPrices = [];
          var priceMatches = txt.match(/[\d.]+,\d{2}/g);
          if (priceMatches) {
            priceMatches.forEach(function(pm) {
              var cleaned = pm.replace(/\./g, '').replace(',', '.');
              var val = parseFloat(cleaned);
              if (val > 0 && val < 100000) allPrices.push(val);
            });
          }
          if (allPrices.length > 0) {
            // En düşük fiyatı al (indirimli fiyat)
            priceNum = Math.min.apply(null, allPrices);
          } else {
            var cleaned = txt.replace(/[^\d.,]/g, '');
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
            var val = parseFloat(cleaned);
            if (val > 0 && val < 100000) priceNum = val;
          }
        }
      });

      // Gorsel
      var imgEl = container.querySelector('img');
      var imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

      // Marka
      var brandEl = container.querySelector('[class*="brand"], [class*="Brand"]');
      var brand = brandEl ? brandEl.textContent.trim() : '';

      // URL'den barcode cikar - /urun-adi-p-8690000000000 seklinde
      var barcode = '';
      var barcodeMatch = cleanUrl.match(/-p-(\d{8,13})$/);
      if (barcodeMatch) {
        barcode = barcodeMatch[1];
      }

      var key = cleanUrl;
      if (seen[key]) return;
      seen[key] = true;

      if (priceNum > 0) {
        results.push({
          name: name,
          brand: brand,
          category: catName,
          categoryLabel: catLabel,
          price: priceNum,
          imageUrl: imageUrl,
          productUrl: fullUrl,
          rating: 0,
          reviews: 0,
          barcode: barcode,
          source: 'pazarama'
        });
      }
    });

    return results;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

async function scrapeCategory(page, category) {
  var allProducts = [];
  var seenUrls = new Set();
  console.log('\n--- Kategori: ' + category.label + ' ---');

  for (var pg = 1; pg <= MAX_PAGES; pg++) {
    var url = BASE_URL + category.path + (pg > 1 ? '?sayfa=' + pg : '');
    console.log('  Sayfa ' + pg + ': ' + url);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(DELAY_MS);

      // Scroll
      await page.evaluate(() => {
        return new Promise(resolve => {
          var totalHeight = 0;
          var distance = 400;
          var timer = setInterval(() => {
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 200);
        });
      });
      await sleep(1000);

      var products = await extractProducts(page, category.name, category.label);
      // Dinamik erken çıkış: bu sayfada GERÇEKTEN yeni urun var mi?
      var newCount = 0;
      products.forEach(function(p) {
        var key = (p.productUrl || '').replace(/\?.*$/, '');
        if (key && !seenUrls.has(key)) { seenUrls.add(key); newCount++; }
      });
      console.log('  -> ' + products.length + ' urun (' + newCount + ' yeni)');

      if (products.length === 0) break;
      allProducts = allProducts.concat(products);
      // ≥%80 overlap veya 0 yeni -> sayfa tükenmis kabul et
      if (pg > 1 && newCount === 0) break;
      if (pg > 1 && products.length > 0 && (newCount / products.length) < 0.2) break;
    } catch (err) {
      console.log('  HATA: ' + err.message);
      break;
    }
  }

  return allProducts;
}

// Bilinen markalar
var knownBrands = [
  "L'Oreal", "L'Oréal", "Maybelline", "NYX", "MAC", "Estee Lauder", "Clinique",
  "Flormar", "Golden Rose", "Pastel", "Essence", "Catrice", "Rimmel", "Revlon",
  "Max Factor", "Bourjois", "Too Faced", "Urban Decay", "Benefit", "NARS",
  "Dior", "Chanel", "Lancome", "Lancôme", "Avon", "Gabrini", "Pupa",
  "Inglot", "Note", "Deborah", "Farmasi", "Garnier", "Vichy", "La Roche-Posay",
  "Bioderma", "Neutrogena", "Missha", "The Ordinary", "Nyx"
];

(async () => {
  console.log('Pazarama Kozmetik Scraper baslatiliyor...');

  // robots.txt kontrolü — kategori yollari robots.txt'de engelli degil
  var samplePaths = CATEGORIES.slice(0, 3).map(function(c) { return c.path; });
  var { blockedPaths, crawlDelay } = await preflightCheck(BASE_URL, samplePaths);
  if (blockedPaths.length > 0) {
    console.log('❌ Kategori yollari robots.txt tarafindan engellenmis: ' + blockedPaths.join(', '));
    return;
  }
  var effectiveDelay = crawlDelay ? Math.max(DELAY_MS, crawlDelay * 1000) : DELAY_MS;

  var browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage']
  });

  var context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'tr-TR',
    viewport: { width: 1440, height: 900 },
  });

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

  // Tekrarlari kaldir
  var unique = {};
  allProducts.forEach(function(p) {
    var key = p.productUrl.replace(/\?.*$/, '');
    if (!unique[key] || p.price < unique[key].price) {
      unique[key] = p;
    }
  });
  var finalProducts = Object.values(unique);

  // Marka cikarma
  finalProducts.forEach(function(p, idx) {
    p.id = START_ID + idx;
    if (!p.brand) {
      var nameLower = p.name.toLowerCase();
      for (var b = 0; b < knownBrands.length; b++) {
        if (nameLower.indexOf(knownBrands[b].toLowerCase()) !== -1) {
          p.brand = knownBrands[b];
          break;
        }
      }
    }
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalProducts, null, 2), 'utf8');
  console.log('\n' + finalProducts.length + ' urun -> ' + OUTPUT_FILE);

  await browser.close();
})();
