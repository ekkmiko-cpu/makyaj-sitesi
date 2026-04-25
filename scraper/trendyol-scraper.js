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
  { name: 'far',              url: '/sr?q=göz+farı',                            label: 'Goz Fari' },
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
  // ── Yeni kategoriler (Akakce uyumu) ─────────────────────────────────────────
  { name: 'dipliner',           url: '/sr?q=dipliner',                          label: 'Dipliner' },
  { name: 'kas-kalemi',         url: '/sr?q=kas+kalemi',                        label: 'Kas Kalemi' },
  { name: 'kas-fari',           url: '/sr?q=kas+fari',                          label: 'Kas Fari' },
  { name: 'kas-sabitleyici',    url: '/sr?q=kas+sabitleyici+jeli',              label: 'Kas Sabitleyici' },
  { name: 'bb-cc-krem',         url: '/bb-cc-krem-x-c108823',                   label: 'BB CC Krem' },
  { name: 'makyaj-sabitleyici', url: '/sr?q=makyaj+sabitleyici+sprey',          label: 'Makyaj Sabitleyici' },
  { name: 'makyaj-seti',        url: '/makyaj-seti-x-c104019',                  label: 'Makyaj Seti' },
  { name: 'vucut-simi',         url: '/sr?q=vucut+simi',                        label: 'Vucut Simi' },
];
const OUTPUT_FILE = path.join(__dirname, 'trendyol-products.json');
const MAX_PAGES = 20;      // sayfa basina 24 urun → 20 sayfa × 24 kat = ~11500 urun
const DELAY_MS  = 1200;    // sayfa arasi bekleme (ms)
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Tek sayfadan urunleri cikar — a.product-card selector (Trendyol 2024+ yapisi)
 */
async function extractPageProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    const cards = [...document.querySelectorAll('a.product-card')];
    const results = [];
    for (const card of cards) {
      try {
        const name  = (card.querySelector('.product-name')?.textContent  || '').trim();
        const brand = (card.querySelector('.product-brand')?.textContent || '').trim();
        if (!name && !brand) continue;

        // Fiyat: önce indirimli, sonra normal
        let price = 0;
        const priceEl = card.querySelector('.price-value') ||
                        card.querySelector('.discounted-price .price-value') ||
                        card.querySelector('[class*="price"]');
        if (priceEl) {
          price = parseFloat(priceEl.textContent.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
        }

        const imageUrl  = card.querySelector('img.image, img[src*="cdn.dsmcdn"]')?.src || '';
        const productUrl = card.href
          ? (card.href.startsWith('http') ? card.href : baseUrl + card.href)
          : '';
        const rating  = parseFloat((card.querySelector('.average-rating')?.textContent || '0').replace(',', '.')) || 0;
        const reviews = parseInt((card.querySelector('.total-count')?.textContent || '0').replace(/[^\d]/g, '')) || 0;

        results.push({ name: name || brand, brand, category: catName, categoryLabel: catLabel,
          price, imageUrl, productUrl, rating, reviews, source: 'trendyol' });
      } catch (_) { /* kart hatasi */ }
    }
    return results;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

/**
 * Kategoriyi sayfalayarak tara (pi=1 .. MAX_PAGES)
 */
async function scrapeCategory(page, category) {
  console.log(`\n[KATEGORI] ${category.label} -- taraniyor...`);

  const seen = new Set();
  const allProducts = [];

  for (let pi = 1; pi <= MAX_PAGES; pi++) {
    // URL olustur: /kategori-x-cXXX?pi=N  veya  /sr?q=arama&pi=N
    const sep = category.url.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${category.url}${sep}pi=${pi}`;

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // a.product-card'ların render olmasi icin bekle (maks 8 sn)
      await page.waitForSelector('a.product-card', { timeout: 8000 }).catch(() => {});
      await sleep(800);
    } catch (err) {
      console.log(`   Sayfa ${pi}: yuklenemedi (${err.message.substring(0,40)}), durduruluyor`);
      break;
    }

    const pageProducts = await extractPageProducts(page, category.name, category.label);
    if (pageProducts.length === 0) {
      console.log(`   Sayfa ${pi}: urun yok — durduruluyor`);
      break;
    }

    let newCount = 0;
    for (const p of pageProducts) {
      const key = p.productUrl || `${p.brand}|${p.name}`;
      if (!seen.has(key)) { seen.add(key); allProducts.push(p); newCount++; }
    }

    console.log(`   Sayfa ${pi}: ${pageProducts.length} urun (${newCount} yeni, toplam: ${allProducts.length})`);

    if (newCount === 0) { console.log(`   Tekrar eden sayfa — durduruluyor`); break; }

    await sleep(DELAY_MS);
  }

  console.log(`   => ${category.label}: ${allProducts.length} urun`);
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
    dipliner: '✏️', 'kas-kalemi': '✒️', 'kas-fari': '🤎', 'kas-sabitleyici': '🌿',
    'bb-cc-krem': '💧', 'makyaj-sabitleyici': '💨', 'makyaj-seti': '🎁', 'vucut-simi': '✨',
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
