/**
 * Idefix Kozmetik Scraper — Playwright
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node idefix-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.idefix.com';
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

const OUTPUT_FILE = path.join(__dirname, 'idefix-products.json');
const DELAY_MS = 2000;
const MAX_PAGES = 3;
const START_ID = 35000;
// Idefix kozmetik kategori ID'si
const CATEGORY_ID = '7242320';
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Idefix arama sonuclarindan urunleri cikarir.
 * DOM yapisi (Tailwind CSS tabanlı SPA):
 *   h3 icinde urun adi (span.font-semibold = marka, span.font-medium = urun adi)
 *   h3.closest('a') = urun linki (/urun-adi-p-ID#sortId=ID)
 *   span.text-neutral-1000 = fiyat (129,00 TL)
 *   img = gorsel
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    var results = [];
    var seen = {};

    // H3 etiketleri uzerinden urunleri bul
    var h3s = document.querySelectorAll('h3');

    h3s.forEach(function(h3) {
      var name = h3.textContent.trim();
      if (!name || name.length < 5) return;

      // Kart container'i bul: h3'un 3. parent'i (grandparent.parent)
      var card = h3.parentElement;
      for (var i = 0; i < 3; i++) {
        if (card && card.parentElement) card = card.parentElement;
      }
      if (!card) return;

      // Karttaki ilk <a> linkini bul
      var linkEl = card.querySelector('a[href*="-p-"]') || card.querySelector('a[href*="idefix.com/"]');
      if (!linkEl || !linkEl.href) return;

      var productUrl = linkEl.href;
      var cleanUrl = productUrl.replace(/#.*$/, '');
      if (seen[cleanUrl]) return;
      seen[cleanUrl] = true;

      // Marka: h3 icindeki font-semibold span
      var brandSpans = h3.querySelectorAll('span');
      var brand = '';
      brandSpans.forEach(function(sp) {
        if (sp.className && sp.className.indexOf('font-semibold') !== -1) {
          brand = sp.textContent.trim();
        }
      });

      // Fiyat: karttaki text-neutral-1000 span
      var priceEl = card.querySelector('[class*="text-neutral-1000"]');
      var priceText = priceEl ? priceEl.textContent.trim() : '';
      var priceNum = 0;
      if (priceText) {
        var cleaned = priceText.replace(/[^\d.,]/g, '');
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        priceNum = parseFloat(cleaned) || 0;
      }

      // Gorsel
      var imgEl = card.querySelector('img');
      var imageUrl = imgEl ? (imgEl.src || imgEl.getAttribute('data-src') || '') : '';

      if (priceNum > 0) {
        results.push({
          name: name,
          brand: brand,
          category: catName,
          categoryLabel: catLabel,
          price: priceNum,
          imageUrl: imageUrl,
          productUrl: cleanUrl,
          rating: 0,
          reviews: 0,
          barcode: '',
          source: 'idefix'
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
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await sleep(3000);

      // Scroll to load lazy content
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
      await sleep(2000);

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
  console.log('Idefix Kozmetik Scraper baslatiliyor...');

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

  // Marka cikarma - isimden ilk kelimeyi al (eger brand bos ise)
  var knownBrands = [
    "L'Oreal", "L'Oréal", "Maybelline", "NYX", "MAC", "Estee Lauder", "Clinique",
    "Flormar", "Golden Rose", "Pastel", "Essence", "Catrice", "Rimmel", "Revlon",
    "Max Factor", "Bourjois", "Too Faced", "Urban Decay", "Benefit", "NARS",
    "Dior", "Chanel", "Lancome", "Lancôme", "Avon", "Gabrini", "Pupa",
    "Inglot", "Note", "Deborah", "Farmasi", "Homm Life", "D'Alba", "Dalba",
    "Missha", "Garnier", "Vichy", "La Roche-Posay", "Bioderma", "Neutrogena"
  ];

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
