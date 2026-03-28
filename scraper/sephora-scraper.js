/**
 * Sephora TR Makeup Scraper — v2
 * Çalıştırmak için:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node sephora-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { preflightCheck } = require('./robots-checker');

// ── AYARLAR ──────────────────────────────────────────────────────────────────
const BASE_URL = 'https://www.sephora.com.tr';
const CATEGORIES = [
  { name: 'fondoten',    url: '/makyaj/yuz/fondoten-c353/',                    label: 'Fondöten' },
  { name: 'kapatici',   url: '/makyaj/yuz/concealer-ve-kapatici-c352/',       label: 'Kapatıcı' },
  { name: 'primer',     url: '/makyaj/yuz/makyaj-bazi-et-sabitleyici-c351/', label: 'Primer' },
  { name: 'allik',      url: '/makyaj/yuz/allik-c356/',                       label: 'Allık' },
  { name: 'aydinlatici',url: '/makyaj/yuz/highlighter-c359/',                 label: 'Aydınlatıcı' },
  { name: 'bronzer',    url: '/makyaj/yuz/bronzer-c119401/',                  label: 'Bronzer' },
  { name: 'kontur',     url: '/makyaj/yuz/kontur-c195701/',                   label: 'Kontür' },
  { name: 'pudra',      url: '/makyaj/yuz/toz-pudra-c297702/',                label: 'Pudra' },
  { name: 'maskara',    url: '/makyaj/goz/maskara-c366/',                     label: 'Maskara' },
  { name: 'far',        url: '/makyaj/goz/far-c363/',                         label: 'Göz Farı' },
  { name: 'far-paleti', url: '/makyaj/goz/far-paleti-c258701/',               label: 'Far Paleti' },
  { name: 'eyeliner',   url: '/makyaj/goz/eyeliner-c7667/',                   label: 'Eyeliner' },
  { name: 'goz-kalemi', url: '/makyaj/goz/goz-kalemi-c365/',                  label: 'Göz Kalemi' },
  { name: 'ruj',        url: '/makyaj/dudak/ruj-c371/',                              label: 'Ruj' },
  { name: 'dudak-parlatici', url: '/makyaj/dudak/lip-gloss-dudak-parlaticisi-c372/', label: 'Dudak Parlatıcı' },
  { name: 'dudak-kalemi',    url: '/makyaj/dudak/dudak-kalemi-c373/',                label: 'Dudak Kalemi' },
];
const OUTPUT_FILE = path.join(__dirname, 'sephora-products.json');
const DELAY_MS = 1200;
// ─────────────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel }) => {
    const tiles = document.querySelectorAll('.grid-tile');
    return Array.from(tiles).map(tile => {
      // İsim
      const nameEl = tile.querySelector('.product-title, .name');
      const name = nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '';

      // Marka
      const brandEl = tile.querySelector('.product-brand');
      const brand = brandEl ? brandEl.textContent.trim() : '';

      // URL
      const linkEl = tile.querySelector('a.product-tile-link, a[href*="/p/"]');
      const productUrl = linkEl ? linkEl.href : '';

      // Görsel — product-first-img class'ı olan img
      const imgEl = tile.querySelector('img.product-first-img');
      const imageUrl = imgEl ? imgEl.src : '';

      // Fiyat
      const priceEl = tile.querySelector('.price-sales-standard, .product-min-price');
      const priceRaw = priceEl ? priceEl.textContent.replace(/\s+/g, ' ').trim() : '';
      const priceNum = parseFloat(priceRaw.replace(/[^\d,]/g, '').replace(',', '.')) || 0;

      // Rating (data-rating attribute)
      const ratingEl = tile.querySelector('.product-rating-wrapper');
      const ratingRaw = ratingEl ? (ratingEl.getAttribute('data-rating') || '') : '';
      const rating = ratingRaw ? Math.round((parseFloat(ratingRaw) / 20) * 10) / 10 : 0;

      // Yorum sayısı
      const reviewEl = tile.querySelector('.product-rating-count, [class*="rating-count"]');
      const reviews = reviewEl ? parseInt(reviewEl.textContent.replace(/\D/g, '')) || 0 : 0;

      if (!name || !productUrl) return null;

      return { name, brand, category: catName, categoryLabel: catLabel,
               price: priceNum, imageUrl, productUrl, rating, reviews, source: 'sephora' };
    }).filter(Boolean);
  }, { catName, catLabel });
}

async function loadAndExtract(page, url, category) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  await sleep(DELAY_MS);

  // Sayfayı kaydır (lazy load için)
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await sleep(400);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  return extractProducts(page, category.name, category.label);
}

async function scrapeCategory(page, category) {
  console.log(`\n📦 ${category.label} — taranıyor...`);
  const allProducts = [];
  let startIdx = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${BASE_URL}${category.url}?start=${startIdx}&sz=48`;
    console.log(`   📄 ${startIdx === 0 ? 'Sayfa 1' : `${startIdx+1}-${startIdx+48} arası`} yükleniyor...`);

    try {
      let products = await loadAndExtract(page, url, category);

      // İlk sayfada 0 ürün dönerse, 2 kez daha dene (bot koruması/geç yüklenme)
      if (products.length === 0 && startIdx === 0) {
        for (let retry = 1; retry <= 2; retry++) {
          console.log(`   🔄 Tekrar deneniyor (${retry}/2)...`);
          await sleep(3000 * retry);
          products = await loadAndExtract(page, url, category);
          if (products.length > 0) break;
        }
      }

      console.log(`   ✅ ${products.length} ürün bulundu`);
      allProducts.push(...products);

      if (products.length < 48) {
        hasMore = false;
      } else {
        startIdx += 48;
        if (startIdx >= 48) hasMore = false; // Limit to 1 page for fast run
        await sleep(DELAY_MS);
      }
    } catch (err) {
      console.error(`   ❌ Hata: ${err.message}`);
      hasMore = false;
    }
  }
  return allProducts;
}

async function scrapeDetail(page, product) {
  if (!product.productUrl) return product;
  try {
    await page.goto(product.productUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(800);

    const extra = await page.evaluate(() => {
      // Açıklama
      const descEl = document.querySelector('.product-description-content, [itemprop="description"], .description-content');
      const desc = descEl ? descEl.textContent.replace(/\s+/g, ' ').trim().substring(0, 400) : '';

      // Daha büyük ürün görseli
      const imgEl = document.querySelector('.product-primary-image img, .primary-image, .product-image-container img');
      const imageUrl = imgEl ? (imgEl.src || '') : '';

      // Vegan / Cruelty-Free
      const text = document.body.innerText.toLowerCase();
      const vegan = text.includes('vegan');
      const crueltyFree = text.includes('cruelty-free') || text.includes('hayvanlarda test edilmez');

      // Hacim/Boyut
      const sizeEl = document.querySelector('.product-size, [class*="size"]');
      const size = sizeEl ? sizeEl.textContent.trim() : '';

      return { desc, imageUrl, vegan, crueltyFree, size };
    });

    return {
      ...product,
      desc: extra.desc || '',
      imageUrl: extra.imageUrl || product.imageUrl,
      vegan: extra.vegan || false,
      crueltyFree: extra.crueltyFree || false,
      size: extra.size || ''
    };
  } catch {
    return product;
  }
}

async function main() {
  console.log('🚀 Sephora TR Scraper v2 başlıyor...');
  console.log('⚠️  Açılan tarayıcıyı KAPATMAYIN!\n');

  const isCI = !!process.env.CI;

  // CI ortaminda system Chrome kullan (GitHub Actions'ta pre-installed)
  // Lokal ortamda Playwright Chromium kullan
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
    launchOptions.channel = 'chrome'; // GitHub Actions ubuntu-latest'te Chrome kurulu
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

  // Çerez al
  console.log('🍪 Ana sayfa ziyaret ediliyor...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  try {
    await page.click('#onetrust-accept-btn-handler, [class*="cookie"] button.accept', { timeout: 3000 });
    console.log('🍪 Çerezler kabul edildi\n');
    await sleep(1000);
  } catch {}

  // robots.txt kontrolü
  const paths = CATEGORIES.map(c => c.url);
  const { blockedPaths, crawlDelay } = await preflightCheck(BASE_URL, paths);
  const activeCats = CATEGORIES.filter(c => !blockedPaths.includes(c.url));
  const effectiveDelay = crawlDelay ? Math.max(DELAY_MS, crawlDelay * 1000) : DELAY_MS;

  if (activeCats.length === 0) {
    console.log('❌ Tüm yollar robots.txt tarafından engellenmiş. Çıkılıyor.');
    await browser.close();
    return;
  }

  // Tüm kategorileri tara
  let allProducts = [];
  for (const cat of activeCats) {
    const products = await scrapeCategory(page, cat);
    allProducts.push(...products);
    await sleep(effectiveDelay * 2);
  }

  console.log(`\n✅ Toplam ${allProducts.length} ürün listelendi`);

  // Detay sayfalarından açıklama + büyük görsel çek (ilk 200)
  const detailCount = Math.min(allProducts.length, 200);
  console.log(`\n📸 İlk ${detailCount} ürünün detayı çekiliyor...`);
  for (let i = 0; i < detailCount; i++) {
    if (i % 20 === 0) process.stdout.write(`   ${i}/${detailCount}...\n`);
    allProducts[i] = await scrapeDetail(page, allProducts[i]);
    await sleep(600);
  }

  // ID ve emoji ata
  const emojiMap = {
    fondoten: '✨', kapatici: '💫', primer: '🌟', allik: '🌸',
    aydinlatici: '💡', bronzer: '🌞', kontur: '🎭', pudra: '🌿',
    maskara: '👁️', far: '💜', 'far-paleti': '🎨', eyeliner: '✏️',
    'goz-kalemi': '🖊️', ruj: '💄', 'dudak-parlatici': '✨', 'dudak-kalemi': '🖊️'
  };
  allProducts = allProducts.map((p, i) => ({
    id: i + 100,
    emoji: emojiMap[p.category] || '💄',
    ...p
  }));

  // Kaydet
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2), 'utf8');

  // Özet
  console.log(`\n💾 Kaydedildi: ${OUTPUT_FILE}`);
  console.log('📊 Kategori özeti:');
  const cats = {};
  allProducts.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).forEach(([k, v]) => console.log(`   ${k}: ${v} ürün`));
  console.log(`\n🎉 Toplam: ${allProducts.length} ürün`);

  await browser.close();
}

main().catch(err => { console.error('❌ Kritik hata:', err.message); process.exit(1); });
