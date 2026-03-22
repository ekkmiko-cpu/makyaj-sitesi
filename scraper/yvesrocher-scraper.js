/**
 * Yves Rocher TR Makyaj Scraper — Playwright tabanlı (Kategori Listesi)
 * Akamai korumasini asmak icin gercek Chromium kullanir.
 * Kategori sayfalarindan window.data.components['product-list'] ile urun listesi alir.
 * Urun detay sayfasindan EAN barkod alir.
 *
 * Calistir:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node yvesrocher-scraper.js
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// -- AYARLAR ------------------------------------------------------------------
const BASE       = 'https://www.yvesrocher.com.tr';
const OUTPUT     = path.join(__dirname, 'yvesrocher-products.json');
const BARCODE_CK = path.join(__dirname, 'yvesrocher-barcodes.json');  // EAN checkpoint
const ID_START   = 50000;
const DELAY_MS   = 800;
// ----------------------------------------------------------------------------

// Kategori URL'leri
const CATEGORIES = [
  { url: BASE + '/makyaj/ten-makyaji/fondoten/c/21100',              name: 'fondoten',        label: 'Fondöten'        },
  { url: BASE + '/makyaj/ten-makyaji/kapatici/c/21200',              name: 'kapatici',        label: 'Kapatıcı'        },
  { url: BASE + '/makyaj/ten-makyaji/pudra-ve-kontur/c/21300',       name: 'pudra',           label: 'Pudra'           },
  { url: BASE + '/makyaj/ten-makyaji/allik/c/21400',                 name: 'allik',           label: 'Allık'           },
  { url: BASE + '/makyaj/ten-makyaji/makyaj-bazi/c/21800',           name: 'primer',          label: 'Primer'          },
  { url: BASE + '/makyaj/ten-makyaji/aydinlatici/c/21900',           name: 'aydinlatici',     label: 'Aydınlatıcı'     },
  { url: BASE + '/makyaj/dudak-makyaji/ruj/c/22100',                 name: 'ruj',             label: 'Ruj'             },
  { url: BASE + '/makyaj/dudak-makyaji/dudak-parlatici/c/22200',     name: 'dudak-parlatici', label: 'Dudak Parlatıcı' },
  { url: BASE + '/makyaj/dudak-makyaji/dudak-kalemi/c/22300',        name: 'dudak-kalemi',    label: 'Dudak Kalemi'    },
  { url: BASE + '/makyaj/goz-makyaji/maskara/c/23100',               name: 'maskara',         label: 'Maskara'         },
  { url: BASE + '/makyaj/goz-makyaji/goz-kalemi/c/23200',            name: 'goz-kalemi',      label: 'Göz Kalemi'      },
  { url: BASE + '/makyaj/goz-makyaji/goz-fari/c/23300',              name: 'far',             label: 'Göz Farı'        },
  { url: BASE + '/makyaj/goz-makyaji/goz-makyaj-paleti/c/23400',     name: 'far-paleti',      label: 'Far Paleti'      },
  { url: BASE + '/makyaj/goz-makyaji/kas-kalemi-ve-maskarasi/c/23500', name: 'kas',           label: 'Kaş Makyajı'     },
  { url: BASE + '/makyaj/goz-makyaji/eyeliner/c/23900',              name: 'eyeliner',        label: 'Eyeliner'        },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createContext(browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale:    'tr-TR',
    viewport:  { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return ctx;
}

/** Bir kategori sayfasindaki tum urunleri topla (sayfalama ile) */
async function scrapeCategory(ctx, category) {
  console.log('\n[KATEGORİ]', category.label, category.url);
  const allProducts = [];
  const page = await ctx.newPage();

  try {
    let pageNum = 1;
    let totalPages = 1;

    do {
      const url = category.url + (pageNum > 1 ? '?currentPage=' + pageNum : '');
      console.log('  Sayfa', pageNum + '/' + totalPages, '→', url);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(500);

      const data = await page.evaluate(() => {
        try {
          const pl = window.data && window.data.components && window.data.components['product-list'];
          if (!pl) return null;
          return {
            pagination: pl.pagination || {},
            products:   (pl.products || []).map(p => ({
              code:          p.code || '',
              name:          p.name || '',
              url:           p.url  || '',
              price:         p.price ? (p.price.value || 0) : 0,
              pictureUrl:    (p.picture && p.picture.url) ? p.picture.url : '',
              rating:        p.averageRating   || 0,
              reviews:       p.numberOfReviews || 0,
              purchasable:   p.purchasable !== false,
            })),
          };
        } catch (e) { return null; }
      });

      if (!data) {
        console.log('  window.data bulunamadi, sayfa atiliyor');
        break;
      }

      totalPages = data.pagination.totalPages || 1;
      const products = data.products.filter(p => p.purchasable && p.name && p.price > 0);
      console.log('  ' + products.length + ' urun / toplam:', data.pagination.totalResults || '?');

      products.forEach(p => {
        const imgRaw  = (p.pictureUrl || '').split('?')[0];
        const imgFull = imgRaw
          ? (imgRaw.startsWith('http') ? imgRaw : 'https://medias.yvesrocher.com.tr' + imgRaw)
          : '';
        const productUrl = p.url.startsWith('http') ? p.url : BASE + p.url;

        allProducts.push({
          name:          p.name.trim(),
          brand:         'Yves Rocher',
          category:      category.name,
          categoryLabel: category.label,
          price:         parseFloat(p.price) || 0,
          imageUrl:      imgFull,
          productUrl,
          barcode:       '',  // EAN enrichment adiminda doldurulacak
          code:          String(p.code),
          rating:        parseFloat(p.rating)  || 0,
          reviews:       parseInt(p.reviews)   || 0,
          source:        'yvesrocher',
        });
      });

      pageNum++;
      if (pageNum <= totalPages) await sleep(DELAY_MS);

    } while (pageNum <= totalPages);

  } finally {
    await page.close().catch(() => {});
  }

  console.log('  =>', category.label + ':', allProducts.length, 'urun');
  return allProducts;
}

/** Urun detay sayfasindan EAN barkod al */
async function enrichBarcodes(ctx, products) {
  // Checkpoint yukle
  let barcodes = {};
  if (fs.existsSync(BARCODE_CK)) {
    try { barcodes = JSON.parse(fs.readFileSync(BARCODE_CK, 'utf8')); } catch (_) {}
  }

  const todo = products.filter(p => p.code && !(p.code in barcodes));
  console.log('\n[BARKOD ENRİCHMENT]', todo.length, 'urun isleniyor...');

  if (todo.length === 0) {
    console.log('  Hepsi zaten barkod checkpoint\'te.');
    products.forEach(p => { if (p.code && barcodes[p.code]) p.barcode = barcodes[p.code]; });
    return;
  }

  const BATCH = 3;
  let done = 0, found = 0;

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const pages = await Promise.all(batch.map(() => ctx.newPage()));

    await Promise.all(batch.map(async (p, j) => {
      const pg = pages[j];
      try {
        await pg.goto(p.productUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        const ean = await pg.evaluate(() => {
          try {
            const prod = window.data && window.data.components && window.data.components['product'];
            return (prod && prod.product && prod.product.ean) ? String(prod.product.ean) : '';
          } catch (_) { return ''; }
        });
        barcodes[p.code] = ean || '';
        if (ean) found++;
      } catch (_) {
        barcodes[p.code] = '';
      } finally {
        await pg.close().catch(() => {});
      }
    }));

    done += batch.length;
    if (done % (BATCH * 3) === 0 || i + BATCH >= todo.length) {
      fs.writeFileSync(BARCODE_CK, JSON.stringify(barcodes));
      process.stdout.write('\r  ' + done + '/' + todo.length + ' barkod islendi  →  bulunan: ' + found + '   ');
    }

    await sleep(DELAY_MS);
  }

  // Barkodlari urunlere uygula
  products.forEach(p => { if (p.code && barcodes[p.code]) p.barcode = barcodes[p.code]; });
  console.log('\n  Toplam barkod:', Object.values(barcodes).filter(Boolean).length);
}

async function main() {
  console.log('Yves Rocher TR Playwright Scraper basliyor...\n');

  // Akamai TLS parmak izi kontrolunu gecmek icin headless: true + channel: 'chrome' kullan
  const browser = await chromium.launch({
    headless: true,
    channel:  'chrome',   // Sistem Chrome'u kullan (Chromium degil) — Akamai icin kritik
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const ctx = await createContext(browser);

  // ── 1. Kategori listelerini tara ──────────────────────────────────────────
  let allProducts = [];
  for (const cat of CATEGORIES) {
    try {
      const products = await scrapeCategory(ctx, cat);
      allProducts.push(...products);
    } catch (e) {
      console.error('  [HATA]', cat.label + ':', e.message);
    }
    await sleep(DELAY_MS);
  }

  // Tekrarlari kaldir (urun URL bazinda)
  const seen = new Set();
  allProducts = allProducts.filter(p => {
    if (seen.has(p.productUrl)) return false;
    seen.add(p.productUrl);
    return true;
  });
  console.log('\n[TOPLAM] Liste tarama tamamlandi:', allProducts.length, 'urun\n');

  // ── 2. EAN barkod zenginlestirme ──────────────────────────────────────────
  await enrichBarcodes(ctx, allProducts);

  await browser.close();

  // ── 3. Kaydet ─────────────────────────────────────────────────────────────
  const emojiMap = {
    fondoten: '✨', kapatici: '💫', primer: '🌟', allik: '🌸',
    aydinlatici: '💡', bronzer: '🌞', kontur: '🎭', pudra: '🌿',
    maskara: '👁️', far: '💜', 'far-paleti': '🎨', eyeliner: '✏️',
    'goz-kalemi': '🖊️', ruj: '💄', 'dudak-parlatici': '✨', 'dudak-kalemi': '🖊️',
    kas: '🖌️',
  };

  const final = allProducts.map((p, i) => ({
    id:    ID_START + i,
    emoji: emojiMap[p.category] || '💄',
    ...p,
  }));

  fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2), 'utf8');
  console.log('\nKaydedildi:', OUTPUT);

  const cats = {};
  final.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k + ':', v));
  console.log('\nToplam:', final.length, 'urun | barkodlu:', final.filter(p => p.barcode).length);
}

main().catch(e => { console.error('\nKritik hata:', e.message); process.exit(1); });
