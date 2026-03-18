/**
 * Watsons TR Makeup Scraper
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node watsons-scraper.js
 *
 * Watsons.com.tr 403 dondurdugu icin Playwright ile gercek tarayici kullanilir.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE_URL = 'https://www.watsons.com.tr';
const CATEGORIES = [
  { name: 'fondoten',         url: '/makyaj/yuz-makyaji/fondoten/c/003001001',           label: 'Fondoten' },
  { name: 'maskara',          url: '/makyaj/goz-makyaji/maskara/c/003002001',             label: 'Maskara' },
  { name: 'ruj',              url: '/makyaj/dudak-makyaji/ruj/c/003003001',               label: 'Ruj' },
  { name: 'far',              url: '/makyaj/goz-makyaji/goz-fari/c/003002002',            label: 'Goz Fari' },
  { name: 'eyeliner',         url: '/makyaj/goz-makyaji/eyeliner/c/003002003',            label: 'Eyeliner' },
  { name: 'goz-kalemi',       url: '/makyaj/goz-makyaji/goz-kalemi/c/003002004',          label: 'Goz Kalemi' },
  { name: 'allik',            url: '/makyaj/yuz-makyaji/allik/c/003001002',               label: 'Allik' },
  { name: 'kapatici',         url: '/makyaj/yuz-makyaji/kapatici/c/003001003',            label: 'Kapatici' },
  { name: 'primer',           url: '/makyaj/yuz-makyaji/primer/c/003001004',              label: 'Primer' },
  { name: 'pudra',            url: '/makyaj/yuz-makyaji/pudra/c/003001005',               label: 'Pudra' },
  { name: 'dudak-parlatici',  url: '/makyaj/dudak-makyaji/dudak-parlatici/c/003003002',   label: 'Dudak Parlatici' },
  { name: 'dudak-kalemi',     url: '/makyaj/dudak-makyaji/dudak-kalemi/c/003003003',      label: 'Dudak Kalemi' },
];

// Alternatif URL desenleri: Watsons kategori URL'leri farkli olabilir
const ALT_URL_PATTERNS = [
  // Desen 1: /c/CATID
  (cat) => `/c/${cat.name}`,
  // Desen 2: Search fallback
  (cat) => `/search?q=${encodeURIComponent(cat.label)}`,
  // Desen 3: Farkli URL yapisi
  (cat) => `/makyaj/c/003?q=%3Arelevance%3Acategory%3A${cat.name}`,
];

const OUTPUT_FILE = path.join(__dirname, 'watsons-products.json');
const DELAY_MS = 2000;
const MAX_PAGES_PER_CATEGORY = 5;
const START_ID = 15000;
// -----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Sayfadaki urun kartlarindan urunleri cikarir.
 * Watsons SAP Hybris tabanli olabilir, bu nedenle birden fazla selektor denenir.
 */
async function extractProducts(page, catName, catLabel) {
  return page.evaluate(({ catName, catLabel }) => {
    // Olasi urun karti selektorleri (SAP Hybris / standart e-ticaret)
    const selectors = [
      '.product-card',
      '.product-item',
      '.productCard',
      '.product-list-item',
      '.product__item',
      '.product-tile',
      '.grid-tile',
      '.plp-card',
      '[data-product]',
      '.product-box',
      '.search-product-card',
      'li[class*="product"]',
      'div[class*="ProductCard"]',
      'div[class*="product-card"]',
      'a[class*="product"]',
    ];

    let tiles = [];
    for (const sel of selectors) {
      tiles = document.querySelectorAll(sel);
      if (tiles.length > 0) break;
    }

    // Eger hala bulunamadiysa, linklerdeki urun URL'lerinden cikar
    if (tiles.length === 0) {
      const links = document.querySelectorAll('a[href*="/p/"], a[href*="/product/"], a[href*="/urun/"]');
      if (links.length > 0) {
        tiles = Array.from(links).map(a => a.closest('div, li, article') || a);
        // Benzersiz yap
        tiles = [...new Set(tiles)];
      }
    }

    return Array.from(tiles).map(tile => {
      // Isim
      const nameSelectors = [
        '.product-name', '.product-title', '.productName',
        '.product__name', '.name', 'h3', 'h2',
        '[class*="productName"]', '[class*="product-name"]',
        '[class*="ProductName"]', '[class*="title"]',
        'a[title]',
      ];
      let name = '';
      for (const sel of nameSelectors) {
        const el = tile.querySelector(sel);
        if (el) {
          name = el.getAttribute('title') || el.textContent || '';
          name = name.replace(/\s+/g, ' ').trim();
          if (name.length > 2) break;
        }
      }

      // Marka
      const brandSelectors = [
        '.product-brand', '.brand', '.productBrand',
        '[class*="brand"]', '[class*="Brand"]',
        '.product__brand', '.manufacturer',
      ];
      let brand = '';
      for (const sel of brandSelectors) {
        const el = tile.querySelector(sel);
        if (el) {
          brand = el.textContent.replace(/\s+/g, ' ').trim();
          if (brand.length > 1) break;
        }
      }

      // URL
      const linkSelectors = [
        'a[href*="/p/"]', 'a[href*="/product/"]', 'a[href*="/urun/"]',
        'a.product-link', 'a.product-tile-link', 'a',
      ];
      let productUrl = '';
      for (const sel of linkSelectors) {
        const el = tile.querySelector(sel);
        if (el && el.href) {
          productUrl = el.href;
          break;
        }
      }

      // Gorsel
      const imgSelectors = [
        'img[src*="product"]', 'img[data-src]', 'img.product-image',
        'img.lazyload', 'img[class*="product"]', 'img',
      ];
      let imageUrl = '';
      for (const sel of imgSelectors) {
        const el = tile.querySelector(sel);
        if (el) {
          imageUrl = el.getAttribute('src') || el.getAttribute('data-src') ||
                     el.getAttribute('data-lazy-src') || el.getAttribute('data-original') || '';
          if (imageUrl && !imageUrl.includes('placeholder') && !imageUrl.startsWith('data:')) break;
        }
      }

      // Fiyat
      const priceSelectors = [
        '.product-price', '.price', '.productPrice',
        '.price-sales', '[class*="price"]', '[class*="Price"]',
        '.product__price', '.sale-price', '.current-price',
      ];
      let priceNum = 0;
      for (const sel of priceSelectors) {
        const el = tile.querySelector(sel);
        if (el) {
          const priceText = el.textContent.replace(/\s+/g, ' ').trim();
          const match = priceText.match(/([\d.,]+)\s*TL/i) || priceText.match(/([\d.,]+)/);
          if (match) {
            priceNum = parseFloat(match[1].replace(/\./g, '').replace(',', '.')) || 0;
            if (priceNum > 0) break;
          }
        }
      }

      // Rating
      const ratingSelectors = [
        '[class*="rating"]', '[class*="star"]', '[data-rating]',
      ];
      let rating = 0;
      for (const sel of ratingSelectors) {
        const el = tile.querySelector(sel);
        if (el) {
          const raw = el.getAttribute('data-rating') || el.getAttribute('aria-label') || el.textContent || '';
          const m = raw.match(/([\d.]+)/);
          if (m) {
            const val = parseFloat(m[1]);
            rating = val <= 5 ? val : (val <= 100 ? Math.round((val / 20) * 10) / 10 : 0);
            if (rating > 0) break;
          }
        }
      }

      // Yorum sayisi
      const reviewSelectors = [
        '[class*="review-count"]', '[class*="reviewCount"]',
        '[class*="rating-count"]', '.reviews',
      ];
      let reviews = 0;
      for (const sel of reviewSelectors) {
        const el = tile.querySelector(sel);
        if (el) {
          const m = el.textContent.match(/(\d+)/);
          if (m) { reviews = parseInt(m[1]) || 0; break; }
        }
      }

      if (!name && !productUrl) return null;

      return {
        name: name || 'Bilinmeyen Urun',
        brand,
        category: catName,
        categoryLabel: catLabel,
        price: priceNum,
        imageUrl,
        productUrl,
        rating,
        reviews,
        source: 'watsons',
      };
    }).filter(Boolean);
  }, { catName, catLabel });
}

/**
 * Sayfanin yuklendigini ve urunlerin gorunur oldugunu bekler.
 */
async function waitForProducts(page) {
  const productSelectors = [
    '.product-card', '.product-item', '.productCard',
    '.product-list-item', '.product-tile', '.grid-tile',
    '.plp-card', '[data-product]', '.product-box',
    '.search-product-card',
  ];

  for (const sel of productSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      return true;
    } catch {
      // Bu selektor bulunamadi, sonrakini dene
    }
  }
  return false;
}

/**
 * Sayfayi asagi kaydirarak lazy-load urunlerin yuklenmesini saglar.
 */
async function scrollForLazyLoad(page) {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.8));
    await sleep(600);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
}

/**
 * Cookie consent popup'ini kapatir.
 */
async function handleCookieConsent(page) {
  const cookieSelectors = [
    '#onetrust-accept-btn-handler',
    '[class*="cookie"] button',
    'button[id*="cookie"]',
    'button[class*="accept"]',
    '.cookie-consent button',
    '#cookieConsent button',
    'button:has-text("Kabul")',
    'button:has-text("Kabul Et")',
    'button:has-text("Accept")',
    'button:has-text("Tamam")',
    '.consent-accept',
    '#acceptCookies',
  ];

  for (const sel of cookieSelectors) {
    try {
      await page.click(sel, { timeout: 2000 });
      console.log('   Cerezler kabul edildi');
      await sleep(1000);
      return;
    } catch {
      // Bu selektor bulunamadi
    }
  }
}

/**
 * Bir kategoriyi verilen URL ile tarar. 404 gelirse false doner.
 */
async function tryCategoryUrl(page, fullUrl) {
  try {
    const response = await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response) return false;

    const status = response.status();
    if (status === 404 || status === 403 || status >= 500) {
      console.log(`   URL ${status} dondurdu: ${fullUrl}`);
      return false;
    }

    await sleep(2000);

    // Sayfa icerigini kontrol et: 404 sayfasi olabilir
    const is404Page = await page.evaluate(() => {
      const text = document.body ? document.body.innerText.toLowerCase() : '';
      return text.includes('sayfa bulunamadi') ||
             text.includes('page not found') ||
             text.includes('404') && text.length < 2000;
    });

    if (is404Page) {
      console.log(`   Sayfa 404 icerigi iceriyor: ${fullUrl}`);
      return false;
    }

    return true;
  } catch (err) {
    console.log(`   URL erisim hatasi: ${err.message.substring(0, 80)}`);
    return false;
  }
}

/**
 * Sonraki sayfaya gecmeyi dener. Basariliysa true doner.
 */
async function goToNextPage(page, currentPage, baseUrl) {
  // Desen 1: ?currentPage=N (SAP Hybris)
  const url1 = baseUrl.includes('?')
    ? `${baseUrl}&currentPage=${currentPage}`
    : `${baseUrl}?currentPage=${currentPage}`;

  // Desen 2: ?page=N
  const url2 = baseUrl.includes('?')
    ? `${baseUrl}&page=${currentPage}`
    : `${baseUrl}?page=${currentPage}`;

  // Once currentPage dene (Hybris standardi)
  for (const url of [url1, url2]) {
    const success = await tryCategoryUrl(page, url);
    if (success) return true;
  }

  // Son cozum: sayfadaki "sonraki" butonuna tikla
  const nextSelectors = [
    'a.next', '.pagination .next a', 'a[rel="next"]',
    'button.next', '[class*="next-page"]', '[class*="pagination"] a:last-child',
    'a:has-text("Sonraki")', 'a:has-text(">")',
  ];
  for (const sel of nextSelectors) {
    try {
      await page.click(sel, { timeout: 3000 });
      await sleep(2000);
      return true;
    } catch {
      // Bulunamadi
    }
  }

  return false;
}

/**
 * Bir kategoriyi tum sayfalariyla tara.
 */
async function scrapeCategory(page, category) {
  console.log(`\n[${category.label}] taranıyor...`);
  const allProducts = [];

  // Ana URL'yi dene
  let workingUrl = `${BASE_URL}${category.url}`;
  let urlWorks = await tryCategoryUrl(page, workingUrl);

  // Ana URL calismadiysa alternatifleri dene
  if (!urlWorks) {
    console.log(`   Ana URL calismadi, alternatifler deneniyor...`);
    for (const patternFn of ALT_URL_PATTERNS) {
      const altPath = patternFn(category);
      const altUrl = `${BASE_URL}${altPath}`;
      console.log(`   Deneniyor: ${altUrl}`);
      urlWorks = await tryCategoryUrl(page, altUrl);
      if (urlWorks) {
        workingUrl = altUrl;
        break;
      }
      await sleep(1000);
    }
  }

  if (!urlWorks) {
    console.log(`   [${category.label}] icin calisan URL bulunamadi, atlaniyor.`);
    return allProducts;
  }

  console.log(`   Calisan URL: ${workingUrl}`);

  // Urunlerin yuklenmesini bekle
  await waitForProducts(page);
  await scrollForLazyLoad(page);

  // Ilk sayfa urunlerini cikar
  let products = await extractProducts(page, category.name, category.label);
  console.log(`   Sayfa 1: ${products.length} urun bulundu`);
  allProducts.push(...products);

  // Sonraki sayfalar
  for (let pageNum = 1; pageNum < MAX_PAGES_PER_CATEGORY; pageNum++) {
    if (products.length === 0) break; // Onceki sayfada urun yoksa dur

    await sleep(DELAY_MS);
    const hasNext = await goToNextPage(page, pageNum, workingUrl);
    if (!hasNext) {
      console.log(`   Sayfa ${pageNum + 1}: Sonraki sayfa yok, kategori tamamlandi.`);
      break;
    }

    await waitForProducts(page);
    await scrollForLazyLoad(page);

    products = await extractProducts(page, category.name, category.label);
    console.log(`   Sayfa ${pageNum + 1}: ${products.length} urun bulundu`);

    if (products.length === 0) break;
    allProducts.push(...products);
  }

  return allProducts;
}

/**
 * Debug: Sayfa icerigini logla (sorun giderme icin)
 */
async function debugPageContent(page) {
  const info = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const classes = new Set();
    for (const el of allElements) {
      for (const cls of el.classList) {
        if (cls.toLowerCase().includes('product') || cls.toLowerCase().includes('card') ||
            cls.toLowerCase().includes('item') || cls.toLowerCase().includes('tile')) {
          classes.add(cls);
        }
      }
    }
    return {
      title: document.title,
      url: window.location.href,
      relevantClasses: Array.from(classes).slice(0, 30),
      bodyLength: document.body ? document.body.innerText.length : 0,
    };
  });
  console.log(`   Debug - Title: ${info.title}`);
  console.log(`   Debug - URL: ${info.url}`);
  console.log(`   Debug - Body length: ${info.bodyLength}`);
  if (info.relevantClasses.length > 0) {
    console.log(`   Debug - Relevant classes: ${info.relevantClasses.join(', ')}`);
  }
}

async function main() {
  console.log('Watsons TR Scraper basliyor...');
  console.log('Acilan tarayiciyi KAPATMAYIN!\n');

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
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'tr-TR',
    extraHTTPHeaders: {
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    },
  });

  // Webdriver algılanmasini engelle
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Chrome runtime simulasyonu
    window.chrome = { runtime: {} };
    // Permissions override
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });

  const page = await context.newPage();

  // Ana sayfayi ziyaret et ve cookie'leri kabul et
  console.log('Ana sayfa ziyaret ediliyor...');
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);
    await handleCookieConsent(page);

    // Debug: Ana sayfanin yuklendini dogrula
    await debugPageContent(page);
  } catch (err) {
    console.log(`Ana sayfa yuklenemedi: ${err.message}`);
    console.log('Yine de kategoriler denenecek...');
  }

  // Tum kategorileri tara
  let allProducts = [];
  for (const cat of CATEGORIES) {
    try {
      const products = await scrapeCategory(page, cat);
      allProducts.push(...products);
    } catch (err) {
      console.log(`   [${cat.label}] hata: ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nToplam ${allProducts.length} urun listelendi`);

  // Tekrarlanan urunleri cikar (ayni productUrl)
  const seen = new Set();
  allProducts = allProducts.filter(p => {
    const key = p.productUrl || `${p.name}-${p.brand}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`Tekrarlar cikarildi: ${allProducts.length} benzersiz urun`);

  // ID ata
  allProducts = allProducts.map((p, i) => ({
    id: START_ID + i,
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

main().catch(err => {
  console.error('Kritik hata:', err.message);
  process.exit(1);
});
