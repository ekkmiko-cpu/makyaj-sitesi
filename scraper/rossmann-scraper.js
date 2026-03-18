/**
 * Rossmann TR Kozmetik Scraper
 * Rossmann Alpine.js + Elasticsearch backend kullanir.
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node rossmann-scraper.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR -----------------------------------------------------------------
const BASE_URL = 'https://www.rossmann.com.tr';
const CATEGORIES = [
  { name: 'fondoten',        url: '/makyaj/fondoten',                         label: 'Fondoten' },
  { name: 'maskara',         url: '/makyaj/maskara-ve-rimel',                 label: 'Maskara' },
  { name: 'ruj',             url: '/makyaj/ruj',                              label: 'Ruj' },
  { name: 'far',             url: '/makyaj/far-paletleri',                    label: 'Goz Fari' },
  { name: 'eyeliner',        url: '/makyaj/eyeliner',                         label: 'Eyeliner' },
  { name: 'goz-kalemi',      url: '/makyaj/goz-kalemleri',                    label: 'Goz Kalemi' },
  { name: 'allik',           url: '/makyaj/allik',                            label: 'Allik' },
  { name: 'aydinlatici',     url: '/makyaj/highlighter-palettes-aydinlatici-paletler', label: 'Aydinlatici' },
  { name: 'kapatici',        url: '/makyaj/concealer-kapatici',               label: 'Kapatici' },
  { name: 'primer',          url: '/makyaj/baz-ve-sabitleyiciler',            label: 'Primer' },
  { name: 'pudra',           url: '/makyaj/pudra',                            label: 'Pudra' },
  { name: 'ruj-likit',       url: '/makyaj/likit-ruj',                        label: 'Ruj' },
  { name: 'dudak-kalemi',    url: '/makyaj/dudak-kalemi',                     label: 'Dudak Kalemi' },
];

// Alternate URL patterns to try if the primary URL returns 404
function getAlternateUrls(category) {
  const slug = category.url.replace(/\//g, '-').replace(/^-/, '');
  // e.g. /makyaj/yuz/fondoten -> makyaj-yuz-fondoten
  const parts = category.url.split('/').filter(Boolean);
  const alts = [];

  // Pattern: /c/makyaj-yuz-fondoten-XXXX (common Rossmann pattern)
  alts.push(`/c/${parts.join('-')}`);
  // Pattern: /c/slug with numbers
  for (const suffix of ['', '-0', '-1']) {
    alts.push(`/c/${parts.join('-')}${suffix}`);
  }
  // Pattern: category directly under /makyaj/
  if (parts.length === 3) {
    alts.push(`/${parts[0]}/${parts[2]}`);
  }
  return alts;
}

const OUTPUT_FILE = path.join(__dirname, 'rossmann-products.json');
const DELAY_MS = 2000;
const MAX_SCROLLS = 3;
const ID_START = 20000;
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
 * Try to extract product data from intercepted Elasticsearch API responses.
 * Rossmann fetches product data via /elastic.php?productIds=[skus]&filters[is_in_stock]=1
 */
function parseElasticResponse(jsonData, catName, catLabel) {
  const products = [];
  try {
    // The response might be an array or an object with a products/items key
    let items = [];
    if (Array.isArray(jsonData)) {
      items = jsonData;
    } else if (jsonData && typeof jsonData === 'object') {
      items = jsonData.products || jsonData.items || jsonData.data || jsonData.hits || [];
      // Elasticsearch hits format
      if (jsonData.hits && jsonData.hits.hits) {
        items = jsonData.hits.hits.map(h => h._source || h);
      }
    }

    for (const item of items) {
      const name = item.name || item.title || item.product_name || '';
      const brand = item.brand || item.manufacturer || item.brand_name || '';

      // Rossmann pricing: prefer special_price > crm_price > ross_60_price > price
      let price = 0;
      if (item.special_price && parseFloat(item.special_price) > 0) {
        price = parseFloat(item.special_price);
      } else if (item.crm_price && parseFloat(item.crm_price) > 0) {
        price = parseFloat(item.crm_price);
      } else if (item.ross_60_price && parseFloat(item.ross_60_price) > 0) {
        price = parseFloat(item.ross_60_price);
      } else if (item.price) {
        price = parseFloat(item.price);
      }

      const imageUrl = item.image || item.thumbnail || item.image_url || item.small_image || '';
      const sku = item.sku || item.product_id || item.id || '';
      const slug = item.url_key || item.url || item.slug || '';
      let productUrl = '';
      if (slug) {
        productUrl = slug.startsWith('http') ? slug : `${BASE_URL}/${slug.replace(/^\//, '')}`;
      } else if (sku) {
        productUrl = `${BASE_URL}/product/${sku}`;
      }

      const rating = parseFloat(item.rating || item.average_rating || item.rating_summary || 0) || 0;
      const reviews = parseInt(item.review_count || item.reviews_count || item.reviews || 0) || 0;

      if (!name) continue;

      products.push({
        name: name.trim(),
        brand: (typeof brand === 'string' ? brand : '').trim(),
        category: catName,
        categoryLabel: catLabel,
        price,
        imageUrl: typeof imageUrl === 'string' ? imageUrl : '',
        productUrl,
        rating: Math.min(Math.round(rating * 10) / 10, 5),
        reviews,
        source: 'rossmann',
      });
    }
  } catch (err) {
    // Elastic parse error, ignore
  }
  return products;
}

/**
 * Extract product data from inline scripts / Alpine.js data in the page.
 * Rossmann may embed product JSON in window.__data, x-data attributes, or inline scripts.
 */
async function extractFromInlineData(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    const products = [];

    // Strategy 1: Look for window-level data objects
    const windowKeys = ['__data', '__INITIAL_STATE__', '__NUXT__', 'productData', 'pageData', 'catalogData'];
    for (const key of windowKeys) {
      try {
        const data = window[key];
        if (!data) continue;

        // Try to find product arrays in the data
        const findProducts = (obj, depth = 0) => {
          if (depth > 5 || !obj) return [];
          if (Array.isArray(obj) && obj.length > 0 && obj[0] && (obj[0].name || obj[0].title || obj[0].sku)) {
            return obj;
          }
          if (typeof obj === 'object' && !Array.isArray(obj)) {
            for (const k of Object.keys(obj)) {
              const result = findProducts(obj[k], depth + 1);
              if (result.length > 0) return result;
            }
          }
          return [];
        };

        const items = findProducts(data);
        for (const item of items) {
          const name = item.name || item.title || '';
          if (!name) continue;
          const brand = item.brand || item.manufacturer || '';
          let price = parseFloat(item.special_price || item.crm_price || item.ross_60_price || item.price || 0);
          const imageUrl = item.image || item.thumbnail || item.image_url || '';
          const slug = item.url_key || item.url || '';
          const productUrl = slug ? (slug.startsWith('http') ? slug : `${baseUrl}/${slug.replace(/^\//, '')}`) : '';

          products.push({
            name: name.trim(),
            brand: (typeof brand === 'string' ? brand : '').trim(),
            category: catName,
            categoryLabel: catLabel,
            price: price || 0,
            imageUrl,
            productUrl,
            rating: parseFloat(item.rating || 0) || 0,
            reviews: parseInt(item.review_count || 0) || 0,
            source: 'rossmann',
          });
        }
        if (products.length > 0) return products;
      } catch (_) { /* skip */ }
    }

    // Strategy 2: Parse Alpine.js x-data attributes that may contain product arrays
    try {
      const xDataEls = document.querySelectorAll('[x-data]');
      for (const el of xDataEls) {
        const raw = el.getAttribute('x-data');
        if (!raw || raw.length < 50) continue;
        // Some x-data contain JSON-like product data
        try {
          // Alpine x-data is often a JS expression, try to evaluate safely
          if (raw.includes('products') || raw.includes('items') || raw.includes('sku')) {
            // Try JSON parse first (works if it is pure JSON)
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.products || parsed.items)) {
              const items = parsed.products || parsed.items || [];
              for (const item of items) {
                const name = item.name || item.title || '';
                if (!name) continue;
                products.push({
                  name: name.trim(),
                  brand: (item.brand || '').trim(),
                  category: catName,
                  categoryLabel: catLabel,
                  price: parseFloat(item.special_price || item.crm_price || item.price || 0) || 0,
                  imageUrl: item.image || '',
                  productUrl: item.url ? (item.url.startsWith('http') ? item.url : `${baseUrl}/${item.url.replace(/^\//, '')}`) : '',
                  rating: 0,
                  reviews: 0,
                  source: 'rossmann',
                });
              }
            }
          }
        } catch (_) { /* not JSON, skip */ }
      }
    } catch (_) { /* no x-data */ }

    // Strategy 3: Look for inline script tags with product JSON arrays
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.length < 100 || text.length > 500000) continue;

        // Look for patterns like productIds, product_sku, catalog data
        const jsonPatterns = [
          /var\s+products\s*=\s*(\[[\s\S]*?\]);/,
          /products\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
          /"products"\s*:\s*(\[[\s\S]*?\])/,
          /productData\s*=\s*(\{[\s\S]*?\});/,
        ];

        for (const pattern of jsonPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            try {
              const parsed = JSON.parse(match[1]);
              const items = Array.isArray(parsed) ? parsed : [parsed];
              for (const item of items) {
                const name = item.name || item.title || '';
                if (!name) continue;
                products.push({
                  name: name.trim(),
                  brand: (item.brand || '').trim(),
                  category: catName,
                  categoryLabel: catLabel,
                  price: parseFloat(item.special_price || item.crm_price || item.price || 0) || 0,
                  imageUrl: item.image || '',
                  productUrl: item.url ? (item.url.startsWith('http') ? item.url : `${baseUrl}/${item.url.replace(/^\//, '')}`) : '',
                  rating: 0,
                  reviews: 0,
                  source: 'rossmann',
                });
              }
            } catch (_) { /* parse failed */ }
          }
        }
        if (products.length > 0) return products;
      }
    } catch (_) { /* script parse failed */ }

    return products;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

/**
 * Extract products from the DOM.
 * Rossmann product cards have data-product-sku attributes.
 * Also look for generic product card patterns.
 */
async function extractFromDOM(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel, baseUrl }) => {
    const products = [];
    const seen = new Set();

    // Strategy 1: Cards with data-product-sku attribute
    const skuCards = document.querySelectorAll('[data-product-sku]');
    for (const card of skuCards) {
      try {
        const sku = card.getAttribute('data-product-sku');
        if (seen.has(sku)) continue;
        seen.add(sku);

        // Name
        let name = '';
        const nameSelectors = [
          '[class*="product-name"]', '[class*="product-title"]',
          '[class*="productName"]', '[class*="productTitle"]',
          'h2', 'h3', 'h4',
          '[class*="name"]', '[class*="title"]',
          'a[href*="/product"]', 'a[href*="/urun"]',
        ];
        for (const sel of nameSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            const txt = el.textContent.replace(/\s+/g, ' ').trim();
            if (txt.length > 3 && txt.length < 300 && !txt.match(/^\d+[.,]\d+\s*TL?$/)) {
              name = txt;
              break;
            }
          }
        }

        // Brand
        let brand = '';
        const brandSelectors = [
          '[class*="brand"]', '[class*="Brand"]', '[class*="marka"]',
          '[class*="manufacturer"]',
        ];
        for (const sel of brandSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            const txt = el.textContent.replace(/\s+/g, ' ').trim();
            if (txt.length > 1 && txt.length < 80) {
              brand = txt;
              break;
            }
          }
        }

        // Price: look for TL text or price-related classes
        let price = 0;
        const priceSelectors = [
          '[class*="special-price"]', '[class*="special_price"]',
          '[class*="crm-price"]', '[class*="crm_price"]',
          '[class*="ross-price"]', '[class*="ross_60"]',
          '[class*="price"]', '[class*="fiyat"]',
        ];
        for (const sel of priceSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            const txt = el.textContent.trim();
            const cleaned = txt.replace(/[^\d,\.]/g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            if (num > 0 && num < 50000) {
              price = num;
              break;
            }
          }
        }
        // Fallback: find any element with TL text
        if (price === 0) {
          const allEls = card.querySelectorAll('*');
          for (const el of allEls) {
            if (el.children.length > 0) continue; // leaf nodes only
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
        }

        // Image
        let imageUrl = '';
        const imgs = card.querySelectorAll('img');
        for (const img of imgs) {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('loading') || '';
          if (src && src.startsWith('http')) {
            imageUrl = src;
            break;
          }
        }
        if (!imageUrl) {
          const picture = card.querySelector('picture source');
          if (picture) {
            imageUrl = picture.getAttribute('srcset') || '';
          }
        }

        // Product URL
        let productUrl = '';
        const linkEl = card.querySelector('a[href*="/product"], a[href*="/urun"], a[href]');
        if (linkEl) {
          const href = linkEl.getAttribute('href') || '';
          productUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
        } else if (sku) {
          productUrl = `${baseUrl}/product/${sku}`;
        }

        // Rating
        let rating = 0;
        const ratingEl = card.querySelector('[class*="rating"], [class*="star"], [data-rating]');
        if (ratingEl) {
          const rVal = ratingEl.getAttribute('data-rating') || ratingEl.textContent.trim();
          const rNum = parseFloat(rVal);
          if (rNum > 0 && rNum <= 5) rating = Math.round(rNum * 10) / 10;
        }

        // Reviews
        let reviews = 0;
        const reviewEl = card.querySelector('[class*="review"], [class*="comment"], [class*="yorum"]');
        if (reviewEl) {
          const rTxt = reviewEl.textContent.replace(/\D/g, '');
          reviews = parseInt(rTxt) || 0;
        }

        if (!name || name.length < 3) continue;

        products.push({
          name,
          brand,
          category: catName,
          categoryLabel: catLabel,
          price,
          imageUrl,
          productUrl,
          rating,
          reviews,
          source: 'rossmann',
        });
      } catch (_) { /* single card error, continue */ }
    }

    if (products.length > 0) return products;

    // Strategy 2: Generic product card detection (links to /product/ or /urun/ pages)
    const productLinks = document.querySelectorAll('a[href*="/product/"], a[href*="/urun/"]');
    const seenUrls = new Set();

    for (const link of productLinks) {
      try {
        const href = link.getAttribute('href') || '';
        if (seenUrls.has(href)) continue;
        seenUrls.add(href);

        // Walk up to find the product card container
        let card = link;
        for (let i = 0; i < 5; i++) {
          if (card.parentElement) card = card.parentElement;
          if (card.querySelectorAll('a[href*="/product/"], a[href*="/urun/"]').length > 1) {
            card = link.parentElement || link;
            break;
          }
        }

        let name = '';
        const nameEls = card.querySelectorAll('h2, h3, h4, [class*="name"], [class*="title"]');
        for (const el of nameEls) {
          const txt = el.textContent.replace(/\s+/g, ' ').trim();
          if (txt.length > 3 && txt.length < 300 && !txt.match(/^\d/)) {
            name = txt;
            break;
          }
        }
        if (!name) {
          name = link.getAttribute('title') || link.textContent.replace(/\s+/g, ' ').trim();
        }

        let brand = '';
        const brandEl = card.querySelector('[class*="brand"], [class*="marka"]');
        if (brandEl) brand = brandEl.textContent.replace(/\s+/g, ' ').trim();

        let price = 0;
        const allEls = card.querySelectorAll('*');
        for (const el of allEls) {
          const txt = el.textContent.trim();
          if ((txt.includes('TL') || txt.includes(',')) && txt.length < 30) {
            const cleaned = txt.replace(/[^\d,\.]/g, '').replace(',', '.');
            const num = parseFloat(cleaned);
            if (num > 0 && num < 50000) {
              price = num;
              break;
            }
          }
        }

        let imageUrl = '';
        const img = card.querySelector('img');
        if (img) {
          imageUrl = img.src || img.getAttribute('data-src') || '';
        }

        const productUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

        if (!name || name.length < 3) continue;

        products.push({
          name: name.substring(0, 200),
          brand,
          category: catName,
          categoryLabel: catLabel,
          price,
          imageUrl,
          productUrl,
          rating: 0,
          reviews: 0,
          source: 'rossmann',
        });
      } catch (_) { /* skip */ }
    }

    return products;
  }, { catName, catLabel, baseUrl: BASE_URL });
}

/**
 * Scrape a single category with infinite scroll support.
 * Tries primary URL, then alternate URL patterns on 404.
 */
async function scrapeCategory(page, category, elasticProducts) {
  console.log(`\n[KATEGORI] ${category.label} taraniyor...`);

  // Build list of URLs to try
  const urlsToTry = [
    `${BASE_URL}${category.url}`,
    ...getAlternateUrls(category).map(u => `${BASE_URL}${u}`),
  ];

  let loaded = false;
  let loadedUrl = '';

  for (const url of urlsToTry) {
    try {
      console.log(`  Deneniyor: ${url}`);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (response && response.status() >= 400) {
        console.log(`  [UYARI] ${response.status()} durumu, alternatif deneniyor...`);
        continue;
      }

      loaded = true;
      loadedUrl = url;
      break;
    } catch (err) {
      console.log(`  [HATA] ${url}: ${err.message}`);
      continue;
    }
  }

  // Also try pagination-style URL with ?page=1
  if (!loaded) {
    const pageUrl = `${BASE_URL}${category.url}?page=1`;
    try {
      console.log(`  Deneniyor: ${pageUrl}`);
      const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (response && response.status() < 400) {
        loaded = true;
        loadedUrl = pageUrl;
      }
    } catch (_) { /* skip */ }
  }

  if (!loaded) {
    console.log(`  [UYARI] Kategori yuklenemedi, atlaniyor.`);
    return [];
  }

  console.log(`  Yuklendi: ${loadedUrl}`);
  await sleep(2000);

  // Wait for Alpine.js to render product cards
  try {
    await page.waitForSelector('[data-product-sku], [class*="product-card"], [class*="product-item"], [class*="productCard"]', { timeout: 10000 });
    console.log('  Urun kartlari bulundu.');
  } catch (_) {
    console.log('  [UYARI] Urun kartlari bulunamadi, DOM taranacak...');
  }

  const allProducts = [];

  // Infinite scroll: scroll down MAX_SCROLLS times to trigger lazy loading
  for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
    // Count products before scroll
    const beforeCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-product-sku], [class*="product-card"], [class*="product-item"]').length;
    });

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(DELAY_MS);

    // Click "load more" button if exists
    try {
      const loadMoreBtn = await page.$('button:has-text("Daha Fazla"), button:has-text("daha fazla"), button:has-text("Devam"), [class*="load-more"], [class*="loadMore"], a:has-text("Sonraki")');
      if (loadMoreBtn) {
        await loadMoreBtn.click();
        console.log('  "Daha Fazla" butonuna tiklandi.');
        await sleep(DELAY_MS);
      }
    } catch (_) { /* no load-more button */ }

    // Count products after scroll
    const afterCount = await page.evaluate(() => {
      return document.querySelectorAll('[data-product-sku], [class*="product-card"], [class*="product-item"]').length;
    });

    console.log(`  Scroll ${scroll + 1}/${MAX_SCROLLS}: ${afterCount} element`);

    if (afterCount === beforeCount && scroll > 0) {
      console.log('  Yeni urun yuklenmedi, scroll durduruluyor.');
      break;
    }
  }

  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);

  // Collect elastic products captured for this category
  const elasticCategoryProducts = elasticProducts
    .filter(p => p._category === category.name)
    .map(({ _category, ...rest }) => rest);

  if (elasticCategoryProducts.length > 0) {
    console.log(`  Elasticsearch API'den ${elasticCategoryProducts.length} urun yakalandi.`);
    allProducts.push(...elasticCategoryProducts);
  }

  // Try inline data extraction
  const inlineProducts = await extractFromInlineData(page, category.name, category.label);
  if (inlineProducts.length > 0) {
    console.log(`  Inline veriden ${inlineProducts.length} urun cikarildi.`);
    allProducts.push(...inlineProducts);
  }

  // Try DOM extraction
  const domProducts = await extractFromDOM(page, category.name, category.label);
  if (domProducts.length > 0) {
    console.log(`  DOM'dan ${domProducts.length} urun cikarildi.`);
    allProducts.push(...domProducts);
  }

  // Also try paginated URLs (?page=2, ?page=3) if we have products
  if (allProducts.length > 0) {
    for (let pageNum = 2; pageNum <= MAX_SCROLLS; pageNum++) {
      const pageUrl = `${loadedUrl}${loadedUrl.includes('?') ? '&' : '?'}page=${pageNum}`;
      console.log(`  Sayfa ${pageNum}: ${pageUrl}`);
      try {
        const response = await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (response && response.status() >= 400) break;

        await sleep(2000);
        // Scroll for lazy loading
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await sleep(500);
        }

        const pageProducts = await extractFromDOM(page, category.name, category.label);
        const inlinePage = await extractFromInlineData(page, category.name, category.label);

        const combined = [...pageProducts, ...inlinePage];
        if (combined.length === 0) {
          console.log('  Bos sayfa, pagination durduruluyor.');
          break;
        }
        console.log(`  Sayfa ${pageNum}: ${combined.length} urun`);
        allProducts.push(...combined);
        await sleep(DELAY_MS);
      } catch (err) {
        console.log(`  Sayfa ${pageNum} hatasi: ${err.message}`);
        break;
      }
    }
  }

  // Deduplicate by productUrl or name
  const deduped = [];
  const seenKeys = new Set();
  for (const p of allProducts) {
    const key = p.productUrl || p.name;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(p);
  }

  console.log(`  => ${category.label}: toplam ${deduped.length} urun`);
  return deduped;
}

async function main() {
  console.log('Rossmann TR Scraper basliyor...');
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

  // Intercept Elasticsearch API calls to capture product data
  const elasticProducts = [];
  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.includes('elastic.php') || url.includes('elastic') || url.includes('search/products') || url.includes('catalog/product')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json') || contentType.includes('text')) {
          const body = await response.json().catch(() => null);
          if (body) {
            // Determine current category from the page URL
            const pageUrl = page.url();
            let currentCat = null;
            for (const cat of CATEGORIES) {
              if (pageUrl.includes(cat.url) || pageUrl.includes(cat.name)) {
                currentCat = cat;
                break;
              }
            }
            if (currentCat) {
              const parsed = parseElasticResponse(body, currentCat.name, currentCat.label);
              for (const p of parsed) {
                p._category = currentCat.name;
                elasticProducts.push(p);
              }
              if (parsed.length > 0) {
                console.log(`  [ELASTIC] ${parsed.length} urun yakalandi (${url.substring(0, 80)}...)`);
              }
            }
          }
        }
      }
    } catch (_) { /* response parse error, ignore */ }
  });

  // Visit homepage to pick up cookies
  console.log('Ana sayfa ziyaret ediliyor...');
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    // Accept cookies if a banner appears
    try {
      await page.click(
        'button[id*="cookie"], button[class*="cookie"], [id*="onetrust"] button, button:has-text("Kabul"), button:has-text("kabul"), button:has-text("Tamam"), [class*="consent"] button',
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
      const products = await scrapeCategory(page, cat, elasticProducts);
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
      // Deduplicate by name for products without URL
      const key = `_nourl_${p.name}_${p.brand}`;
      if (!urlMap.has(key)) {
        urlMap.set(key, p);
      }
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
