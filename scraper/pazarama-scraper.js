/**
 * Pazarama Kozmetik Scraper — Playwright
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node pazarama-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.pazarama.com';
const CATEGORIES = [
  { name: 'fondoten',        q: 'fondöten',                   label: 'Fondöten' },
  { name: 'kapatici',        q: 'kapatıcı makyaj',            label: 'Kapatıcı' },
  { name: 'primer',          q: 'primer makyaj bazı',         label: 'Primer' },
  { name: 'allik',           q: 'allık',                      label: 'Allık' },
  { name: 'pudra',           q: 'pudra makyaj',               label: 'Pudra' },
  { name: 'aydinlatici',     q: 'highlighter aydınlatıcı',    label: 'Aydınlatıcı' },
  { name: 'bronzer',         q: 'bronzer',                    label: 'Bronzer' },
  { name: 'kontur',          q: 'kontür makyaj',              label: 'Kontür' },
  { name: 'maskara',         q: 'maskara',                    label: 'Maskara' },
  { name: 'far',             q: 'göz farı',                   label: 'Göz Farı' },
  { name: 'far-paleti',      q: 'far paleti',                 label: 'Far Paleti' },
  { name: 'eyeliner',        q: 'eyeliner',                   label: 'Eyeliner' },
  { name: 'goz-kalemi',      q: 'göz kalemi',                 label: 'Göz Kalemi' },
  { name: 'ruj',             q: 'ruj',                        label: 'Ruj' },
  { name: 'dudak-parlatici', q: 'dudak parlatıcı lip gloss',  label: 'Dudak Parlatıcı' },
  { name: 'dudak-kalemi',    q: 'dudak kalemi',               label: 'Dudak Kalemi' },
];

const OUTPUT_FILE = path.join(__dirname, 'pazarama-products.json');
const DELAY_MS = 2000;
const MAX_PAGES = 3;
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
  console.log('\n--- Kategori: ' + category.label + ' ---');

  for (var pg = 1; pg <= MAX_PAGES; pg++) {
    var url = BASE_URL + '/arama?q=' + encodeURIComponent(category.q) + '&sayfa=' + pg;
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

  var browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
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
