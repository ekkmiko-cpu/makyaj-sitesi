/**
 * Gratis TR Makeup Scraper
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node gratis-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR -----------------------------------------------------------------
const BASE_URL = 'https://www.gratis.com';
const CATEGORIES = [
  { name: 'fondoten',         url: '/makyaj/fondoten-c-50102',              label: 'Fondoten' },
  { name: 'maskara',          url: '/makyaj/maskara-c-50103',               label: 'Maskara' },
  { name: 'ruj',              url: '/makyaj/ruj-c-50101',                   label: 'Ruj' },
  { name: 'far',              url: '/makyaj/goz-fari-c-50102',              label: 'Goz Fari' },
  { name: 'far-paleti',       url: '/makyaj/far-paleti-c-50102',            label: 'Far Paleti' },
  { name: 'eyeliner',         url: '/makyaj/eyeliner-c-50102',              label: 'Eyeliner' },
  { name: 'goz-kalemi',       url: '/makyaj/goz-kalemi-c-50102',            label: 'Goz Kalemi' },
  { name: 'allik',            url: '/makyaj/allik-c-50103',                 label: 'Allik' },
  { name: 'aydinlatici',      url: '/makyaj/aydinlatici-c-50103',           label: 'Aydinlatici' },
  { name: 'bronzer',          url: '/makyaj/bronzer-c-50103',               label: 'Bronzer' },
  { name: 'kapatici',         url: '/makyaj/kapatici-c-50103',              label: 'Kapatici' },
  { name: 'primer',           url: '/makyaj/makyaj-bazi-c-50103',           label: 'Primer' },
  { name: 'pudra',            url: '/makyaj/pudra-c-50103',                 label: 'Pudra' },
  { name: 'dudak-parlatici',  url: '/makyaj/dudak-parlaticisi-c-50101',     label: 'Dudak Parlatici' },
  { name: 'dudak-kalemi',     url: '/makyaj/dudak-kalemi-c-50101',          label: 'Dudak Kalemi' },
];
const OUTPUT_FILE = path.join(__dirname, 'gratis-products.json');
const DELAY_MS = 1500;
const MAX_PAGES = 5;
const ID_START = 10000;
// ----------------------------------------------------------------------------

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
if (isCI) launchOptions.channel = 'chrome';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Try extracting products from __NEXT_DATA__ JSON embedded in the page.
 * Returns an array (possibly empty) of product objects.
 */
async function extractFromNextData(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel }) => {
    try {
      const scriptEl = document.querySelector('script#__NEXT_DATA__');
      if (!scriptEl) return [];
      const data = JSON.parse(scriptEl.textContent);

      // Navigate common Next.js commerce data paths
      const pageProps = data?.props?.pageProps || {};
      // Try multiple possible locations for the product list
      const candidates = [
        pageProps.products,
        pageProps.initialData?.products,
        pageProps.initialData?.searchResult?.products,
        pageProps.categoryData?.products,
        pageProps.plpData?.products,
        pageProps.data?.products,
        pageProps.searchResult?.products,
      ];

      let rawProducts = null;
      for (const c of candidates) {
        if (Array.isArray(c) && c.length > 0) {
          rawProducts = c;
          break;
        }
      }
      if (!rawProducts) return [];

      return rawProducts.map(p => {
        const name = p.name || p.productName || p.title || '';
        const brand = p.brand || p.brandName || p.manufacturer || '';
        const price = parseFloat(p.price || p.salePrice || p.currentPrice || 0);
        const imageUrl = p.image || p.imageUrl || p.img || p.thumbnailUrl || '';
        const slug = p.url || p.slug || p.productUrl || '';
        const productUrl = slug.startsWith('http') ? slug : (slug ? `https://www.gratis.com${slug.startsWith('/') ? '' : '/'}${slug}` : '');
        const rating = parseFloat(p.rating || p.averageRating || 0) || 0;
        const reviews = parseInt(p.reviewCount || p.ratingCount || p.numberOfReviews || 0) || 0;

        if (!name) return null;
        return {
          name,
          brand,
          category: catName,
          categoryLabel: catLabel,
          price,
          imageUrl,
          productUrl,
          rating: Math.round(rating * 10) / 10,
          reviews,
          source: 'gratis',
        };
      }).filter(Boolean);
    } catch {
      return [];
    }
  }, { catName, catLabel });
}

/**
 * Extract products from the DOM by looking for product card patterns.
 */
async function extractFromDOM(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    const results = [];

    // Strategy 1: Find product links matching /...-p-DIGITS pattern
    const productLinks = document.querySelectorAll('a[href*="-p-"]');
    const seen = new Set();
    const cards = [];

    for (const link of productLinks) {
      const href = link.getAttribute('href') || '';
      // Extract product ID from URL
      const match = href.match(/-p-(\d+)/);
      if (!match) continue;
      const pid = match[1];
      if (seen.has(pid)) continue;
      seen.add(pid);

      // Walk up to find the product card container
      let card = link;
      for (let i = 0; i < 6; i++) {
        if (card.parentElement) card = card.parentElement;
        // Stop if we hit something that looks like a grid/list container
        if (card.children && card.children.length > 3 &&
            card.querySelectorAll('a[href*="-p-"]').length > 1) {
          card = card.children[0]; // went too far, step back
          break;
        }
      }
      cards.push({ link, card, href, pid });
    }

    for (const { link, card, href, pid } of cards) {
      const container = card || link;

      // Name: look for headings, spans, divs with product-name-like classes
      let name = '';
      const nameSelectors = [
        'h2', 'h3', 'h4',
        '[class*="product-name"]', '[class*="productName"]',
        '[class*="product-title"]', '[class*="productTitle"]',
        '[class*="name"]', '[class*="title"]',
        'span', 'p',
      ];
      for (const sel of nameSelectors) {
        const el = container.querySelector(sel);
        if (el) {
          const txt = el.textContent.replace(/\s+/g, ' ').trim();
          if (txt.length > 3 && txt.length < 200 && !txt.includes('TL')) {
            name = txt;
            break;
          }
        }
      }
      // Fallback: link title or text
      if (!name) {
        name = link.getAttribute('title') || link.textContent.replace(/\s+/g, ' ').trim();
      }

      // Brand: look for brand-related class
      let brand = '';
      const brandSelectors = [
        '[class*="brand"]', '[class*="Brand"]', '[class*="marka"]',
      ];
      for (const sel of brandSelectors) {
        const el = container.querySelector(sel);
        if (el) {
          const txt = el.textContent.replace(/\s+/g, ' ').trim();
          if (txt.length > 1 && txt.length < 80) {
            brand = txt;
            break;
          }
        }
      }

      // Price: find text containing TL
      let price = 0;
      const allText = container.querySelectorAll('*');
      for (const el of allText) {
        const txt = el.textContent.trim();
        if (txt.includes('TL') && txt.length < 30) {
          const cleaned = txt.replace(/[^\d,\.]/g, '').replace(',', '.');
          const num = parseFloat(cleaned);
          if (num > 0 && num < 50000) {
            price = num;
            break;
          }
        }
      }

      // Image: prefer cdn.gratis.com images
      let imageUrl = '';
      const imgs = container.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || '';
        if (src && (src.includes('gratis') || src.includes('cdn') || src.startsWith('http'))) {
          imageUrl = src;
          break;
        }
      }
      // Also check srcset and picture source
      if (!imageUrl) {
        const source = container.querySelector('picture source');
        if (source) {
          imageUrl = source.getAttribute('srcset') || '';
        }
      }

      // Rating
      let rating = 0;
      const ratingEl = container.querySelector('[class*="rating"], [class*="star"], [data-rating]');
      if (ratingEl) {
        const rVal = ratingEl.getAttribute('data-rating') || ratingEl.textContent.trim();
        const rNum = parseFloat(rVal);
        if (rNum > 0 && rNum <= 5) rating = Math.round(rNum * 10) / 10;
      }

      // Reviews
      let reviews = 0;
      const reviewEl = container.querySelector('[class*="review"], [class*="comment"]');
      if (reviewEl) {
        const rTxt = reviewEl.textContent.replace(/\D/g, '');
        reviews = parseInt(rTxt) || 0;
      }

      // Build product URL
      const productUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

      if (!name || name.length < 3) continue;

      results.push({
        name,
        brand,
        category: catName,
        categoryLabel: catLabel,
        price,
        imageUrl,
        productUrl,
        rating,
        reviews,
        source: 'gratis',
      });
    }

    return results;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

/**
 * Scrape a single category, paginating up to MAX_PAGES pages.
 */
async function scrapeCategory(page, category) {
  console.log(`\n[KATEGORI] ${category.label} taraniyor...`);
  const allProducts = [];

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    const separator = category.url.includes('?') ? '&' : '?';
    const url = pageNum === 1
      ? `${BASE_URL}${category.url}`
      : `${BASE_URL}${category.url}${separator}page=${pageNum}`;

    console.log(`  Sayfa ${pageNum}: ${url}`);

    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Handle 404 or other error status codes
      if (response && (response.status() === 404 || response.status() >= 400)) {
        console.log(`  [UYARI] ${response.status()} durumu, kategori atlaniyor.`);
        break;
      }

      await sleep(2000);

      // Scroll down to trigger lazy loading
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
        await sleep(400);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);

      // Try __NEXT_DATA__ first
      let products = await extractFromNextData(page, category.name, category.label);

      // Fall back to DOM extraction
      if (products.length === 0) {
        products = await extractFromDOM(page, category.name, category.label);
      }

      // Ilk sayfada 0 urun donerse, 2 kez daha dene
      if (products.length === 0 && pageNum === 1) {
        for (let retry = 1; retry <= 2; retry++) {
          console.log(`  Tekrar deneniyor (${retry}/2)...`);
          await sleep(3000 * retry);
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(2000);
          for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
            await sleep(400);
          }
          products = await extractFromNextData(page, category.name, category.label);
          if (products.length === 0) {
            products = await extractFromDOM(page, category.name, category.label);
          }
          if (products.length > 0) break;
        }
      }

      console.log(`  ${products.length} urun bulundu`);

      if (products.length === 0) {
        // No products found on this page -- stop pagination
        break;
      }

      // Deduplicate against already-collected products in this category
      const existingUrls = new Set(allProducts.map(p => p.productUrl));
      const newProducts = products.filter(p => !existingUrls.has(p.productUrl));

      if (newProducts.length === 0) {
        console.log('  Yeni urun yok, sonraki sayfaya gecilmiyor.');
        break;
      }

      allProducts.push(...newProducts);
      await sleep(DELAY_MS);
    } catch (err) {
      console.error(`  [HATA] Sayfa ${pageNum}: ${err.message}`);
      break;
    }
  }

  console.log(`  => ${category.label}: toplam ${allProducts.length} urun`);
  return allProducts;
}

async function main() {
  console.log('Gratis TR Scraper basliyor...');
  console.log(`CI modu: ${isCI ? 'EVET' : 'HAYIR'}\n`);

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

  // Visit homepage to pick up cookies
  console.log('Ana sayfa ziyaret ediliyor...');
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Accept cookies if a banner appears
    try {
      await page.click(
        'button[id*="cookie"], button[class*="cookie"], [id*="onetrust"] button, button:has-text("Kabul"), button:has-text("kabul")',
        { timeout: 3000 }
      );
      console.log('Cerezler kabul edildi.\n');
      await sleep(1000);
    } catch {
      // No cookie banner, that is fine
    }
  } catch (err) {
    console.log(`Ana sayfa yuklenemedi: ${err.message} -- devam ediliyor.\n`);
  }

  // Scrape all categories
  let allProducts = [];
  for (const cat of CATEGORIES) {
    try {
      const products = await scrapeCategory(page, cat);
      allProducts.push(...products);
    } catch (err) {
      console.error(`[HATA] ${cat.label} kategorisinde beklenmeyen hata: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  // Deduplicate globally by productUrl
  const urlMap = new Map();
  for (const p of allProducts) {
    if (p.productUrl && !urlMap.has(p.productUrl)) {
      urlMap.set(p.productUrl, p);
    } else if (!p.productUrl) {
      urlMap.set(`_nourl_${urlMap.size}`, p);
    }
  }
  allProducts = Array.from(urlMap.values());

  // Assign IDs
  allProducts = allProducts.map((p, i) => ({
    id: ID_START + i,
    ...p,
  }));

  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2), 'utf8');

  // Summary
  console.log(`\nKaydedildi: ${OUTPUT_FILE}`);
  console.log('Kategori ozeti:');
  const cats = {};
  allProducts.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).forEach(([k, v]) => console.log(`  ${k}: ${v} urun`));
  console.log(`\nToplam: ${allProducts.length} urun`);

  await browser.close();
}

main().catch(err => {
  console.error(`Kritik hata: ${err.message}`);
  process.exit(1);
});
