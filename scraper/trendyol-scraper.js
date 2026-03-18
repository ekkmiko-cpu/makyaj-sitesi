/**
 * Trendyol Kozmetik Scraper
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node trendyol-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.trendyol.com';
const CATEGORIES = [
  { name: 'fondoten',         url: '/fondoten-x-c104159',                       label: 'Fondoten' },
  { name: 'maskara',          url: '/maskara-x-c104149',                        label: 'Maskara' },
  { name: 'ruj',              url: '/ruj-x-c104169',                            label: 'Ruj' },
  { name: 'far',              url: '/goz-fari-x-c104147',                       label: 'Goz Fari' },
  { name: 'far-paleti',       url: '/goz-fari-paleti-x-c106050',               label: 'Far Paleti' },
  { name: 'eyeliner',         url: '/eyeliner-x-c104148',                       label: 'Eyeliner' },
  { name: 'goz-kalemi',       url: '/goz-kalemi-x-c104146',                    label: 'Goz Kalemi' },
  { name: 'allik',            url: '/allik-x-c104155',                          label: 'Allik' },
  { name: 'aydinlatici',      url: '/aydinlatici-x-c106086',                    label: 'Aydinlatici' },
  { name: 'bronzer',          url: '/bronzer-x-c106087',                        label: 'Bronzer' },
  { name: 'kontur',           url: '/kontur-x-c106085',                         label: 'Kontur' },
  { name: 'kapatici',         url: '/kapatici-x-c104160',                       label: 'Kapatici' },
  { name: 'primer',           url: '/makyaj-bazi-x-c104158',                    label: 'Primer' },
  { name: 'pudra',            url: '/pudra-x-c104156',                          label: 'Pudra' },
  { name: 'dudak-parlatici',  url: '/dudak-parlatici-lip-gloss-x-c104170',     label: 'Dudak Parlatici' },
  { name: 'dudak-kalemi',     url: '/dudak-kalemi-x-c104172',                  label: 'Dudak Kalemi' },
];
const OUTPUT_FILE = path.join(__dirname, 'trendyol-products.json');
const MAX_PAGES = 5;
const DELAY_MS = 1500;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Urunleri sayfadan cikarir.
 * Oncelik: JSON-LD structured data -> DOM selectors fallback
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    const products = [];

    // --- Yontem 1: JSON-LD structured data ---
    try {
      const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of ldScripts) {
        try {
          const data = JSON.parse(script.textContent);
          // ItemList icinde urunler olabilir
          if (data['@type'] === 'ItemList' && Array.isArray(data.itemListElement)) {
            for (const item of data.itemListElement) {
              const product = item.item || item;
              if (product && product.name) {
                products.push({
                  name: (product.name || '').trim(),
                  brand: (product.brand && product.brand.name) ? product.brand.name.trim() : '',
                  category: catName,
                  categoryLabel: catLabel,
                  price: product.offers
                    ? parseFloat(product.offers.price || product.offers.lowPrice || 0)
                    : 0,
                  imageUrl: product.image || '',
                  productUrl: product.url
                    ? (product.url.startsWith('http') ? product.url : baseUrl + product.url)
                    : '',
                  rating: product.aggregateRating
                    ? parseFloat(product.aggregateRating.ratingValue || 0)
                    : 0,
                  reviews: product.aggregateRating
                    ? parseInt(product.aggregateRating.reviewCount || product.aggregateRating.ratingCount || 0)
                    : 0,
                  source: 'trendyol',
                });
              }
            }
          }
          // Product tipinde tekil urun
          if (data['@type'] === 'Product' && data.name) {
            products.push({
              name: (data.name || '').trim(),
              brand: (data.brand && data.brand.name) ? data.brand.name.trim() : '',
              category: catName,
              categoryLabel: catLabel,
              price: data.offers
                ? parseFloat(data.offers.price || data.offers.lowPrice || 0)
                : 0,
              imageUrl: data.image || '',
              productUrl: data.url
                ? (data.url.startsWith('http') ? data.url : baseUrl + data.url)
                : '',
              rating: data.aggregateRating
                ? parseFloat(data.aggregateRating.ratingValue || 0)
                : 0,
              reviews: data.aggregateRating
                ? parseInt(data.aggregateRating.reviewCount || data.aggregateRating.ratingCount || 0)
                : 0,
              source: 'trendyol',
            });
          }
        } catch (_) { /* JSON parse hatasi, devam */ }
      }
    } catch (_) { /* JSON-LD bulunamadi */ }

    if (products.length > 0) return products;

    // --- Yontem 2: DOM selectors fallback ---
    const cards = document.querySelectorAll('.p-card-wrppr');
    for (const card of cards) {
      try {
        // Urun adi
        const nameEl = card.querySelector('.prdct-desc-cntnr-name, .product-desc-sub-text, span[class*="prdct-desc"]');
        const name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';

        // Marka
        const brandEl = card.querySelector('.prdct-desc-cntnr-ttl, span[class*="prdct-desc-cntnr-ttl"]');
        const brand = brandEl ? brandEl.textContent.replace(/\s+/g, ' ').trim() : '';

        // Link
        const linkEl = card.querySelector('a');
        const href = linkEl ? linkEl.getAttribute('href') : '';
        const productUrl = href
          ? (href.startsWith('http') ? href : baseUrl + href)
          : '';

        // Gorsel
        const imgEl = card.querySelector('img.p-card-img, img[class*="p-card-img"]');
        const imageUrl = imgEl
          ? (imgEl.src || imgEl.getAttribute('data-src') || '')
          : '';

        // Fiyat (indirimli fiyat oncelikli)
        const discountPriceEl = card.querySelector('.prc-box-dscntd');
        const regularPriceEl = card.querySelector('.prc-box-sllng');
        const priceEl = discountPriceEl || regularPriceEl;
        let price = 0;
        if (priceEl) {
          const raw = priceEl.textContent.replace(/[^\d,]/g, '').replace(',', '.');
          price = parseFloat(raw) || 0;
        }

        // Rating
        const ratingEl = card.querySelector('.rating-score, span[class*="ratingScore"]');
        const rating = ratingEl ? parseFloat(ratingEl.textContent.replace(',', '.')) || 0 : 0;

        // Yorum sayisi
        const reviewEl = card.querySelector('.ratingCount, span[class*="ratingCount"]');
        let reviews = 0;
        if (reviewEl) {
          const txt = reviewEl.textContent.replace(/[^\d]/g, '');
          reviews = parseInt(txt) || 0;
        }

        if (!name && !brand) continue;

        products.push({
          name: name || brand,
          brand,
          category: catName,
          categoryLabel: catLabel,
          price,
          imageUrl,
          productUrl,
          rating,
          reviews,
          source: 'trendyol',
        });
      } catch (_) { /* tek kart hatasi, devam */ }
    }

    return products;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

async function scrapePage(page, url, category) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  // Sayfayi kaydir (lazy load icin)
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await sleep(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  return extractProducts(page, category.name, category.label);
}

async function scrapeCategory(page, category) {
  console.log(`\n[KATEGORI] ${category.label} -- taraniyor...`);
  const allProducts = [];

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const url = `${BASE_URL}${category.url}?pi=${pageNum}`;
    console.log(`   Sayfa ${pageNum} yukleniyor...`);

    try {
      let products = await scrapePage(page, url, category);

      // Ilk sayfada 0 urun donerse, 2 kez daha dene (bot koruması/gec yuklenme)
      if (products.length === 0 && pageNum === 1) {
        for (let retry = 1; retry <= 2; retry++) {
          console.log(`   Tekrar deneniyor (${retry}/2)...`);
          await sleep(3000 * retry);
          products = await scrapePage(page, url, category);
          if (products.length > 0) break;
        }
      }

      console.log(`   ${products.length} urun bulundu`);

      if (products.length === 0) {
        console.log(`   Son sayfa -- bos sonuc, kategori tamamlandi.`);
        break;
      }

      allProducts.push(...products);
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`   HATA: ${err.message}`);
      break;
    }
  }

  return allProducts;
}

async function main() {
  console.log('Trendyol Kozmetik Scraper basliyor...');

  const isCI = !!process.env.CI;
  const launchOptions = {
    headless: true,
    slowMo: isCI ? 0 : 80,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  };
  if (isCI) {
    launchOptions.channel = 'chrome';
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'tr-TR',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  // Ana sayfayi ziyaret et, cerezleri kabul et
  console.log('Ana sayfa ziyaret ediliyor...');
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
    // Cerez popup'ini kapat
    try {
      await page.click('#onetrust-accept-btn-handler, button[class*="cookie-accept"], [data-testid="accept-cookies"]', { timeout: 3000 });
      console.log('Cerezler kabul edildi.\n');
      await sleep(1000);
    } catch (_) {
      console.log('Cerez popup bulunamadi, devam ediliyor.\n');
    }
  } catch (err) {
    console.log(`Ana sayfa yuklenemedi: ${err.message}, kategorilere devam ediliyor.\n`);
  }

  // Tum kategorileri tara
  let allProducts = [];
  for (const cat of CATEGORIES) {
    try {
      const products = await scrapeCategory(page, cat);
      allProducts.push(...products);
    } catch (err) {
      console.error(`[HATA] ${cat.label} kategorisi basarisiz: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  // Tekrarlanan urunleri cikar (ayni productUrl'e sahip olanlar)
  const seen = new Set();
  allProducts = allProducts.filter(p => {
    if (!p.productUrl || seen.has(p.productUrl)) return false;
    seen.add(p.productUrl);
    return true;
  });

  // ID ata
  const emojiMap = {
    fondoten: '✨', kapatici: '💫', primer: '🌟', allik: '🌸',
    aydinlatici: '💡', bronzer: '🌞', kontur: '🎭', pudra: '🌿',
    maskara: '👁️', far: '💜', 'far-paleti': '🎨', eyeliner: '✏️',
    'goz-kalemi': '🖊️', ruj: '💄', 'dudak-parlatici': '✨', 'dudak-kalemi': '🖊️',
  };
  allProducts = allProducts.map((p, i) => ({
    id: i + 5000,
    emoji: emojiMap[p.category] || '💄',
    ...p,
  }));

  // Kaydet
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2), 'utf8');

  // Ozet
  console.log(`\nKaydedildi: ${OUTPUT_FILE}`);
  console.log('Kategori ozeti:');
  const cats = {};
  allProducts.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).forEach(([k, v]) => console.log(`   ${k}: ${v} urun`));
  console.log(`\nToplam: ${allProducts.length} urun`);

  await browser.close();
}

main().catch(err => { console.error('Kritik hata:', err.message); process.exit(1); });
