/**
 * Yves Rocher TR — TAM KATALOG Scraper (Playwright + Chrome)
 *
 * Strateji:
 *  Aşama 1a — Makeup kategorileri: Her kategori sayfasını say+paginle → tüm makeup ürünleri
 *  Aşama 1b — Diğer kategoriler: /search?text=* ile skincare, parfüm vb.
 *  Aşama 2  — EAN barkod zenginleştirme (her ürün sayfasından)
 *
 * Çalıştır:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node yvesrocher-scraper.js
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const { preflightCheck } = require('./robots-checker');

// -- AYARLAR ------------------------------------------------------------------
const BASE       = 'https://www.yvesrocher.com.tr';
const OUTPUT     = path.join(__dirname, 'yvesrocher-products.json');
const BARCODE_CK = path.join(__dirname, 'yvesrocher-barcodes.json');
const ID_START   = 50000;
const DELAY_MS   = 700;
const BARCODE_CONCURRENCY = 4;
// ----------------------------------------------------------------------------

// Makeup kategori sayfaları (1a — kesin tüm ürünler)
const MAKEUP_CATEGORIES = [
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

// Search sonuçlarından ek kategori tespiti (1b)
const URL_CAT_MAP = [
  // Cilt Bakımı
  ['/nemlendirici/',    { name: 'nemlendirici',   label: 'Nemlendirici'    }],
  ['/serum/',           { name: 'serum',           label: 'Serum'           }],
  ['/gunes-koruyucu/',  { name: 'gunes-koruyucu',  label: 'Güneş Koruyucu'  }],
  ['/temizleme/',       { name: 'cilt-temizleme',  label: 'Cilt Temizleme'  }],
  ['/tonik/',           { name: 'tonik',           label: 'Tonik'           }],
  ['/goz-kremi/',       { name: 'goz-kremi',       label: 'Göz Kremi'       }],
  ['/maske/',           { name: 'cilt-maskesi',    label: 'Cilt Maskesi'    }],
  ['/peeling/',         { name: 'peeling',         label: 'Peeling'         }],
  ['/krem/',            { name: 'nemlendirici',    label: 'Nemlendirici'    }],
  ['/cilt-bakimi/',     { name: 'nemlendirici',    label: 'Nemlendirici'    }],
  // Parfüm
  ['/parfum/',          { name: 'parfum',          label: 'Parfüm'          }],
  // Vücut
  ['/dus-jeli/',        { name: 'dus-jeli',        label: 'Duş Jeli'        }],
  ['/vucut-losyonu/',   { name: 'vucut-losyonu',   label: 'Vücut Losyonu'   }],
  ['/vucut-bakimi/',    { name: 'vucut-losyonu',   label: 'Vücut Bakımı'    }],
];

function getCatFromUrl(url) {
  for (const [seg, cat] of URL_CAT_MAP) {
    if (url.includes(seg)) return cat;
  }
  return null;
}

// Makeup URL mi? → search aşamasında makeup ürünlerini atla (zaten kategori aşamasında aldık)
const MAKEUP_URL_SEGS = ['/makyaj/', '/ten-makyaji/', '/dudak-makyaji/', '/goz-makyaji/'];
function isMakeupUrl(url) { return MAKEUP_URL_SEGS.some(s => url.includes(s)); }

const EMOJI_MAP = {
  fondoten:'✨', kapatici:'💫', primer:'🌟', allik:'🌸',
  aydinlatici:'💡', bronzer:'🌞', kontur:'🎭', pudra:'🌿',
  maskara:'👁️', far:'💜', 'far-paleti':'🎨', eyeliner:'✏️',
  'goz-kalemi':'🖊️', ruj:'💄', 'dudak-parlatici':'✨', 'dudak-kalemi':'🖊️',
  kas:'🖌️',
  nemlendirici:'💧', serum:'⚗️', 'gunes-koruyucu':'☀️', 'cilt-temizleme':'🫧',
  tonik:'🌿', 'goz-kremi':'👁️', 'cilt-maskesi':'🌸', peeling:'✨',
  'dus-jeli':'🚿', 'vucut-losyonu':'🧴', parfum:'🌸',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function createCtx(browser) {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'tr-TR', viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'tr-TR,tr;q=0.9' },
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  return ctx;
}

// Kategori listesinden ürün verisi çek
function extractProducts(data, catName, catLabel) {
  if (!data || !data.products) return [];
  return data.products
    .filter(p => p.purchasable !== false && p.name && p.price > 0)
    .map(p => {
      const imgRaw   = (p.pictureUrl || '').split('?')[0];
      const imageUrl = imgRaw ? (imgRaw.startsWith('http') ? imgRaw : 'https://medias.yvesrocher.com.tr' + imgRaw) : '';
      return {
        code:          String(p.code || ''),
        name:          String(p.name).trim(),
        brand:         'Yves Rocher',
        category:      catName,
        categoryLabel: catLabel,
        price:         parseFloat(p.price) || 0,
        imageUrl,
        productUrl:    p.url ? (p.url.startsWith('http') ? p.url : BASE + p.url) : '',
        barcode:       '',
        rating:        parseFloat(p.rating)  || 0,
        reviews:       parseInt(p.reviews)   || 0,
        source:        'yvesrocher',
      };
    })
    .filter(p => p.productUrl && p.price > 0);
}

// ── AŞAMA 1a: Makeup kategori sayfaları ──────────────────────────────────────
async function scrapeMakeupCategories(ctx) {
  console.log('[1a] Makeup kategorileri taranıyor...');
  const page = await ctx.newPage();
  const all = [];
  const seenCode = new Set();

  for (const cat of MAKEUP_CATEGORIES) {
    process.stdout.write('  ' + cat.label + '...');
    let pageNum = 1, totalPages = 1;

    do {
      const url = cat.url + (pageNum > 1 ? '?currentPage=' + pageNum : '');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await sleep(300);

      const data = await page.evaluate(() => {
        const pl = window.data && window.data.components && window.data.components['product-list'];
        if (!pl) return null;
        return {
          totalPages: pl.pagination ? pl.pagination.totalPages : 1,
          products: (pl.products || []).map(p => ({
            code:       p.code || '',
            name:       p.name || '',
            url:        p.url  || '',
            price:      p.price ? p.price.value : 0,
            pictureUrl: p.picture ? p.picture.url : '',
            rating:     p.averageRating   || 0,
            reviews:    p.numberOfReviews || 0,
            purchasable: p.purchasable !== false,
          })),
        };
      });

      if (!data) { process.stdout.write(' [window.data yok]\n'); break; }
      totalPages = data.totalPages || 1;

      const products = extractProducts(data, cat.name, cat.label);
      products.forEach(p => {
        if (!seenCode.has(p.code)) { seenCode.add(p.code); all.push(p); }
      });

      pageNum++;
      if (pageNum <= totalPages) await sleep(DELAY_MS);
    } while (pageNum <= totalPages);

    process.stdout.write(' ' + all.filter(p => p.category === cat.name).length + ' ürün\n');
    await sleep(DELAY_MS);
  }

  await page.close();
  console.log('  Makeup toplam:', all.length, 'ürün\n');
  return { products: all, seenCodes: seenCode };
}

// ── AŞAMA 1b: Search ile ek kategoriler (skincare, parfüm vb.) ────────────────
async function scrapeSearchExtra(ctx, seenCodes) {
  console.log('[1b] Ek kategoriler /search?text=* ile taranıyor...');
  const page = await ctx.newPage();
  const extra = [];

  // Toplam sayfa sayısını öğren
  await page.goto(BASE + '/search?text=*&pageSize=20&currentPage=0', { waitUntil: 'domcontentloaded', timeout: 25000 });
  const first = await page.evaluate(() => {
    const pl = window.data && window.data.components && window.data.components['product-list'];
    return pl ? pl.pagination : null;
  });
  if (!first) { await page.close(); return extra; }
  const totalPages = first.totalPages || 1;
  console.log('  Search toplam sayfa:', totalPages, '(' + first.totalResults + ' sonuç)');

  for (let p = 0; p < totalPages; p++) {
    if (p > 0) {
      await page.goto(BASE + '/search?text=*&pageSize=20&currentPage=' + p, { waitUntil: 'domcontentloaded', timeout: 25000 });
    }

    const products = await page.evaluate(() => {
      const pl = window.data && window.data.components && window.data.components['product-list'];
      if (!pl || !pl.products) return [];
      return pl.products.map(pr => ({
        code:       pr.code || '',
        name:       pr.name || '',
        url:        pr.url  || '',
        price:      pr.price ? pr.price.value : 0,
        pictureUrl: pr.picture ? pr.picture.url : '',
        rating:     pr.averageRating   || 0,
        reviews:    pr.numberOfReviews || 0,
        purchasable: pr.purchasable !== false,
      }));
    });

    for (const pr of products) {
      if (!pr.purchasable || !pr.name || pr.price <= 0 || !pr.url) continue;
      if (seenCodes.has(String(pr.code))) continue; // Makeup'ta zaten var
      if (isMakeupUrl(pr.url)) continue;            // Makeup URL → atla

      const cat = getCatFromUrl(pr.url);
      if (!cat) continue;

      seenCodes.add(String(pr.code));
      const imgRaw   = (pr.pictureUrl || '').split('?')[0];
      const imageUrl = imgRaw ? (imgRaw.startsWith('http') ? imgRaw : 'https://medias.yvesrocher.com.tr' + imgRaw) : '';

      extra.push({
        code:          String(pr.code),
        name:          String(pr.name).trim(),
        brand:         'Yves Rocher',
        category:      cat.name,
        categoryLabel: cat.label,
        price:         parseFloat(pr.price) || 0,
        imageUrl,
        productUrl:    pr.url.startsWith('http') ? pr.url : BASE + pr.url,
        barcode:       '',
        rating:        parseFloat(pr.rating)  || 0,
        reviews:       parseInt(pr.reviews)   || 0,
        source:        'yvesrocher',
      });
    }

    process.stdout.write('\r  Sayfa ' + (p+1) + '/' + totalPages + ' → ekstra ürün: ' + extra.length + '   ');
    await sleep(DELAY_MS);
  }

  await page.close();
  console.log('\n  Ekstra ürün:', extra.length, '\n');
  return extra;
}

// ── AŞAMA 2: EAN barkod zenginleştirme ───────────────────────────────────────
async function enrichBarcodes(ctx, products) {
  let barcodes = {};
  if (fs.existsSync(BARCODE_CK)) {
    try { barcodes = JSON.parse(fs.readFileSync(BARCODE_CK, 'utf8')); } catch (_) {}
  }
  const todo = products.filter(p => p.code && !(p.code in barcodes));
  console.log('[2] EAN barkod zenginleştirme:', todo.length, 'ürün...');

  let done = 0, found = 0;
  for (let i = 0; i < todo.length; i += BARCODE_CONCURRENCY) {
    const batch = todo.slice(i, i + BARCODE_CONCURRENCY);
    const pages = await Promise.all(batch.map(() => ctx.newPage()));
    await Promise.all(batch.map(async (prod, j) => {
      const pg = pages[j];
      try {
        await pg.goto(prod.productUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
        const ean = await pg.evaluate(() => {
          try {
            const comp = window.data && window.data.components && window.data.components['product'];
            return (comp && comp.product && comp.product.ean) ? String(comp.product.ean) : '';
          } catch (_) { return ''; }
        });
        barcodes[prod.code] = ean || '';
        if (ean) found++;
      } catch (_) {
        barcodes[prod.code] = '';
      } finally {
        await pg.close().catch(() => {});
      }
    }));
    done += batch.length;
    if (done % (BARCODE_CONCURRENCY * 4) === 0 || i + BARCODE_CONCURRENCY >= todo.length) {
      fs.writeFileSync(BARCODE_CK, JSON.stringify(barcodes));
      process.stdout.write('\r  ' + done + '/' + todo.length + ' işlendi → barkod: ' + found + '   ');
    }
    await sleep(DELAY_MS);
  }

  products.forEach(p => { if (p.code && barcodes[p.code]) p.barcode = barcodes[p.code]; });
  console.log('\n  Tamamlandı. Bulunan:', Object.values(barcodes).filter(Boolean).length, '\n');
}

// ── Ana akış ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════');
  console.log('  Yves Rocher TR — TAM KATALOG Scraper');
  console.log('══════════════════════════════════════════════════════\n');

  // robots.txt kontrolü
  const checkPaths = MAKEUP_CATEGORIES.map(c => new URL(c.url).pathname);
  checkPaths.push('/search');
  const { blockedPaths } = await preflightCheck(BASE, checkPaths);
  const activeCats = MAKEUP_CATEGORIES.filter(c => !blockedPaths.includes(new URL(c.url).pathname));
  if (activeCats.length === 0) {
    console.log('❌ Tüm kategori yolları robots.txt tarafından engellenmiş. Çıkılıyor.');
    return;
  }
  if (blockedPaths.length > 0) {
    console.log(`ℹ️  ${blockedPaths.length} yol engellendi, ${activeCats.length} kategori taranacak.`);
  }

  const browser = await chromium.launch({
    headless: true, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await createCtx(browser);

  // Sadece izinli kategorileri tara
  const origCats = MAKEUP_CATEGORIES.splice(0, MAKEUP_CATEGORIES.length, ...activeCats);
  const { products: makeup, seenCodes } = await scrapeMakeupCategories(ctx);
  MAKEUP_CATEGORIES.splice(0, MAKEUP_CATEGORIES.length, ...origCats); // geri yükle
  const extra = await scrapeSearchExtra(ctx, seenCodes);
  await enrichBarcodes(ctx, [...makeup, ...extra]);

  await browser.close();

  const allProducts = [...makeup, ...extra];
  const final = allProducts.map((p, i) => ({
    id:    ID_START + i,
    emoji: EMOJI_MAP[p.category] || '💄',
    ...p,
  }));

  fs.writeFileSync(OUTPUT, JSON.stringify(final, null, 2), 'utf8');

  console.log('══════════════════════════════════════════════════════');
  console.log('  Kaydedildi:', OUTPUT);
  console.log('──────────────────────────────────────────────────────');
  const cats = {};
  final.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([k,v]) =>
    console.log('  ' + k.padEnd(25) + v));
  console.log('──────────────────────────────────────────────────────');
  console.log('  Toplam   :', final.length, 'ürün');
  console.log('  Barkodlu :', final.filter(p => p.barcode).length, 'ürün');
  console.log('══════════════════════════════════════════════════════');
}

main().catch(e => { console.error('\nKritik hata:', e.message); process.exit(1); });
