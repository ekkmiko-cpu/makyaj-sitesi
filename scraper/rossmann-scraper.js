/**
 * Rossmann TR Kozmetik Scraper — API tabanli
 * Rossmann elastic.php API'sini dogrudan kullanir (tarayici gerektirmez).
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node rossmann-scraper.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// -- AYARLAR -----------------------------------------------------------------
const BASE_URL = 'https://www.rossmann.com.tr';
const API_URL = 'https://www.rossmann.com.tr/elastic.php';
const CDN_IMG = 'https://cdn.rossmann.com.tr/mnresize/228/-//media/catalog/product/';

// Kategori ID'leri (elastic.php?categoryId=XX ile calisiyor)
const CATEGORIES = [
  { id: 27,  name: 'fondoten',        label: 'Fondoten' },
  { id: 25,  name: 'maskara',         label: 'Maskara' },
  { id: 15,  name: 'ruj',             label: 'Ruj' },
  { id: 22,  name: 'far',             label: 'Goz Fari' },
  { id: 21,  name: 'eyeliner',        label: 'Eyeliner' },
  { id: 23,  name: 'goz-kalemi',      label: 'Goz Kalemi' },
  { id: 29,  name: 'allik',           label: 'Allik' },
  { id: 28,  name: 'pudra',           label: 'Pudra' },
  { id: 31,  name: 'kapatici',        label: 'Kapatici' },
  { id: 19,  name: 'dudak-parlatici', label: 'Dudak Parlatici' },
  { id: 16,  name: 'dudak-kalemi',    label: 'Dudak Kalemi' },
  { id: 24,  name: 'kas',             label: 'Kas Makyaji' },
  { id: 32,  name: 'primer',          label: 'Primer' },
  { id: 30,  name: 'bronzer',         label: 'Bronzer' },
];

const OUTPUT_FILE = path.join(__dirname, 'rossmann-products.json');
const PAGE_SIZE = 50;
const ID_START = 20000;
const DELAY_MS = 500;
// ----------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * HTTPS GET ile JSON cek
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Referer': 'https://www.rossmann.com.tr/',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse hatasi: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Elasticsearch API response'undan urunleri cikar
 */
function parseProducts(data, catName, catLabel) {
  const products = [];

  if (!data || !data.product || !data.product.hits || !data.product.hits.hits) {
    return products;
  }

  for (const hit of data.product.hits.hits) {
    const item = hit._source;
    if (!item) continue;

    const name = (item.name || '').trim();
    if (!name) continue;

    // En düşük mevcut fiyatı al (kart/kampanya fiyatları dahil)
    const candidatePrices = [
      parseFloat(item.special_price || 0),
      parseFloat(item.crm_price    || 0),  // Rossmann kart/CRM fiyatı
      parseFloat(item.ross_60_price|| 0),  // Rossmann 60 üye fiyatı
      parseFloat(item.price        || 0),
    ].filter(v => v > 0);
    let price = candidatePrices.length > 0 ? Math.min(...candidatePrices) : 0;

    // Gorsel URL
    let imageUrl = '';
    if (item.image) {
      imageUrl = item.image.startsWith('http') ? item.image : CDN_IMG + item.image;
    }

    // Urun URL — .html olmadan (404 veriyor)
    let productUrl = '';
    if (item.url_key) {
      productUrl = BASE_URL + '/' + item.url_key;
    }

    // Marka
    const brand = (typeof item.brand === 'string' ? item.brand : '').trim();

    // Barkod (EAN-13) — profesyonel urun eslestirmesi icin
    const barcode = (item.barcode || '').trim();

    products.push({
      name,
      brand,
      category: catName,
      categoryLabel: catLabel,
      price,
      imageUrl,
      productUrl,
      barcode,
      rating: parseFloat(item.rating || 0) || 0,
      reviews: parseInt(item.review_count || 0) || 0,
      source: 'rossmann',
    });
  }

  return products;
}

/**
 * Bir kategoriyi elastic API'den tamamen cek (sayfalama ile)
 */
async function scrapeCategory(category) {
  console.log('\n[KATEGORI] ' + category.label + ' (catId=' + category.id + ') taraniyor...');
  const allProducts = [];
  let from = 0;
  let total = Infinity;

  while (from < total) {
    const url = API_URL + '?categoryId=' + category.id +
      '&order=position&direction=asc' +
      '&from=' + from + '&size=' + PAGE_SIZE +
      '&filters[is_in_stock]=1';

    try {
      const data = await fetchJSON(url);

      if (data.product && data.product.hits && data.product.hits.total) {
        total = data.product.hits.total.value || 0;
      } else {
        break;
      }

      const products = parseProducts(data, category.name, category.label);
      console.log('  Sayfa ' + Math.floor(from / PAGE_SIZE + 1) + ': ' + products.length + ' urun (toplam ' + total + ')');

      if (products.length === 0) break;

      allProducts.push(...products);
      from += PAGE_SIZE;
      await sleep(DELAY_MS);
    } catch (err) {
      console.error('  [HATA] ' + err.message);
      break;
    }
  }

  console.log('  => ' + category.label + ': ' + allProducts.length + ' urun');
  return allProducts;
}

async function main() {
  console.log('Rossmann TR API Scraper basliyor...\n');

  let allProducts = [];

  for (const cat of CATEGORIES) {
    try {
      const products = await scrapeCategory(cat);
      allProducts.push(...products);
    } catch (err) {
      console.error('[HATA] ' + cat.label + ': ' + err.message);
    }
    await sleep(DELAY_MS);
  }

  // Tekrarlanan urunleri cikar (ayni SKU veya URL'e sahip)
  const seen = new Set();
  allProducts = allProducts.filter(p => {
    const key = p.productUrl || p.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ID ata
  const emojiMap = {
    fondoten: '✨', kapatici: '💫', primer: '🌟', allik: '🌸',
    aydinlatici: '💡', bronzer: '🌞', kontur: '🎭', pudra: '🌿',
    maskara: '👁️', far: '💜', 'far-paleti': '🎨', eyeliner: '✏️',
    'goz-kalemi': '🖊️', ruj: '💄', 'dudak-parlatici': '✨', 'dudak-kalemi': '🖊️',
    kas: '🖌️',
  };
  allProducts = allProducts.map((p, i) => ({
    id: ID_START + i,
    emoji: emojiMap[p.category] || '💄',
    ...p,
  }));

  // Kaydet — 0 urun donerse mevcut dosyayi koru (API blok veya network hatasi)
  if (allProducts.length === 0) {
    const existing = fs.existsSync(OUTPUT_FILE) ? JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8') || '[]') : [];
    if (existing.length > 0) {
      console.warn('\n[UYARI] Hic urun cekilemedi — mevcut ' + existing.length + ' urunluk cache korunuyor.');
      console.log('\nKaydedildi (cache): ' + OUTPUT_FILE);
      return;
    }
    console.warn('\n[UYARI] Hic urun cekilemedi ve cache yok.');
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allProducts, null, 2), 'utf8');

  // Ozet
  console.log('\nKaydedildi: ' + OUTPUT_FILE);
  console.log('Kategori ozeti:');
  const cats = {};
  allProducts.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
  Object.entries(cats).forEach(([k, v]) => console.log('   ' + k + ': ' + v + ' urun'));
  console.log('\nToplam: ' + allProducts.length + ' urun');
}

main().catch(err => { console.error('Kritik hata:', err.message); process.exit(1); });
