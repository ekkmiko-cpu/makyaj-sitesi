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
  { name: 'fondoten',         url: '/fondoten-x-c1053',                         label: 'Fondoten' },
  { name: 'maskara',          url: '/maskara-x-c1114',                          label: 'Maskara' },
  { name: 'ruj',              url: '/ruj-x-c1156',                              label: 'Ruj' },
  { name: 'far',              url: '/goz-fari-x-c1060',                         label: 'Goz Fari' },
  { name: 'far-paleti',       url: '/far-paleti-y-s5667',                       label: 'Far Paleti' },
  { name: 'eyeliner',         url: '/eyeliner-x-c1050',                         label: 'Eyeliner' },
  { name: 'goz-kalemi',       url: '/goz-kalemi-x-c1060',                      label: 'Goz Kalemi' },
  { name: 'allik',            url: '/allik-x-c999',                             label: 'Allik' },
  { name: 'aydinlatici',      url: '/aydinlatici-x-c104017',                    label: 'Aydinlatici' },
  { name: 'bronzer',          url: '/bronzer-x-c109099',                        label: 'Bronzer' },
  { name: 'kapatici',         url: '/kapatici-x-c1085',                         label: 'Kapatici' },
  { name: 'primer',           url: '/sr?q=primer+makyaj+baz',                  label: 'Primer' },
  { name: 'pudra',            url: '/pudra-x-c1153',                            label: 'Pudra' },
  { name: 'dudak-parlatici',  url: '/sr?q=dudak+parlatici+lip+gloss',          label: 'Dudak Parlatici' },
  { name: 'dudak-kalemi',     url: '/dudak-kalemi-x-c1042',                    label: 'Dudak Kalemi' },
  { name: 'kontur',           url: '/sr?q=kontür+makyaj',                      label: 'Kontur' },
];
const OUTPUT_FILE = path.join(__dirname, 'trendyol-products.json');
const MAX_PAGES = 10;
const DELAY_MS = 1500;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Urunleri sayfadan cikarir.
 * Oncelik: JSON-LD structured data -> DOM selectors fallback
 */
async function extractProducts(page, catName, catLabel, useDOM) {
  return page.evaluate(({ catName, catLabel, baseUrl, forceDOM }) => {
    const products = [];

    // --- Yontem 1: JSON-LD structured data (sadece ilk sayfa) ---
    if (!forceDOM) try {
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
                  imageUrl: Array.isArray(product.image) ? (product.image[0] || '') : (product.image || ''),
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

    // --- Yontem 2: DOM selectors (yeni Trendyol yapisi) ---
    const cards = document.querySelectorAll('.product-card, [data-testid="product-card"]');
    for (const card of cards) {
      try {
        // Urun adi
        const nameEl = card.querySelector('.product-name');
        const name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';

        // Marka
        const brandEl = card.querySelector('.product-brand');
        const brand = brandEl ? brandEl.textContent.replace(/\s+/g, ' ').trim() : '';

        // Link
        const linkEl = card.querySelector('a[href*="/p-"]') || card.querySelector('a[href]') || card.closest('a');
        const href = linkEl ? linkEl.getAttribute('href') : '';
        const productUrl = href
          ? (href.startsWith('http') ? href : baseUrl + href)
          : '';

        // Gorsel
        const imgEl = card.querySelector('img');
        const imageUrl = imgEl
          ? (imgEl.src || imgEl.getAttribute('data-src') || '')
          : '';

        // Fiyat
        const priceEl = card.querySelector('.price-section');
        let price = 0;
        if (priceEl) {
          const raw = priceEl.textContent.replace(/[^\d,]/g, '').replace(',', '.');
          price = parseFloat(raw) || 0;
        }

        // Rating
        const ratingEl = card.querySelector('.average-rating');
        const rating = ratingEl ? parseFloat(ratingEl.textContent.replace(',', '.')) || 0 : 0;

        // Yorum sayisi
        const reviewEl = card.querySelector('.total-count');
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
  }, { catName, catLabel, baseUrl: BASE_URL, forceDOM: !!useDOM });
}

async function scrapeCategory(page, category) {
  console.log(`\n[KATEGORI] ${category.label} -- taraniyor...`);

  // Sayfa 1'i yükle
  const url = `${BASE_URL}${category.url}?pi=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);

  // Önce JSON-LD'den ilk batch'i al
  let jsonLdProducts = await extractProducts(page, category.name, category.label, false);
  console.log(`   JSON-LD: ${jsonLdProducts.length} urun`);

  // Sonra sayfayı scroll ederek DOM'dan daha fazla ürün yüklet
  let prevCount = 0;
  let sameCountRounds = 0;
  const MAX_SCROLLS = 3; // hizli test icin 3 scroll

  for (let s = 0; s < MAX_SCROLLS; s++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
    await sleep(800);

    const currentCount = await page.evaluate(() => document.querySelectorAll('.product-card, [data-testid="product-card"]').length);

    if (currentCount === prevCount) {
      sameCountRounds++;
      if (sameCountRounds >= 3) {
        console.log(`   Scroll ${s+1}: ${currentCount} kart (yeni urun yok, durduruluyor)`);
        break;
      }
    } else {
      sameCountRounds = 0;
    }
    prevCount = currentCount;

    if ((s + 1) % 5 === 0) {
      console.log(`   Scroll ${s+1}: ${currentCount} kart yuklendi`);
    }
  }

  // Scroll sonrası DOM'dan tüm ürünleri çek
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
  const domProducts = await extractProducts(page, category.name, category.label, true);
  console.log(`   DOM: ${domProducts.length} urun`);

  // JSON-LD ve DOM sonuçlarını birleştir, URL bazlı dedup
  const seen = new Set();
  const allProducts = [];
  for (const p of [...jsonLdProducts, ...domProducts]) {
    const key = p.productUrl || (p.brand + '|' + p.name);
    if (!seen.has(key)) {
      seen.add(key);
      allProducts.push(p);
    }
  }

  console.log(`   Toplam: ${allProducts.length} benzersiz urun`);
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
