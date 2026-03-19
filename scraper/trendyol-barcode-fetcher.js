/**
 * Trendyol Barkod Fetcher
 * Mevcut trendyol-products.json dosyasindaki urunlerin URL'lerinden
 * product ID'yi alir ve Trendyol API'sinden barkod bilgisini ceker.
 * Barkodlar profesyonel urun eslestirmesi icin kullanilir.
 *
 * Calistirmak icin:
 *   cd /Users/ekrem/Documents/GitHub/makyaj-sitesi/scraper
 *   node trendyol-barcode-fetcher.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'trendyol-products.json');
const DELAY_MS = 300;
const BATCH_SIZE = 10;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9',
        'Referer': 'https://www.trendyol.com/',
        ...headers,
      },
      timeout: 10000,
    };
    https.get(url, opts, (res) => {
      // Redirect takip et
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location, headers).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse hatasi: ' + e.message)); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

/**
 * Trendyol URL'sinden product ID'yi cikar
 * Ornek: https://www.trendyol.com/brand/name-p-12345678 => 12345678
 */
function extractProductId(url) {
  if (!url) return null;
  const match = url.match(/-p-(\d+)/);
  return match ? match[1] : null;
}

/**
 * Trendyol product detail API'sinden barkod al
 */
async function fetchBarcode(productId) {
  // Trendyol'un rendering service API'si
  const url = `https://www.trendyol.com/api/rendering-service/product/v2/detail/${productId}`;
  try {
    const data = await fetchJSON(url);
    // Barkod genellikle result.product.barcode veya result.product.variants[0].barcode altinda
    const product = data && (data.result || data);
    if (product && product.product) {
      const p = product.product;
      // Variantlarda barkod ara
      if (p.variants && p.variants.length > 0) {
        const b = p.variants[0].barcode || p.variants[0].gtin || '';
        if (b) return String(b).trim();
      }
      // Dogrudan barkod
      if (p.barcode) return String(p.barcode).trim();
      if (p.gtin) return String(p.gtin).trim();
    }
    return '';
  } catch (err) {
    // Alternatif API endpoint
    try {
      const url2 = `https://public.trendyol.com/discovery-web-websfxproductrecommendation-santral/api/v1/product/${productId}`;
      const data2 = await fetchJSON(url2);
      if (data2 && data2.result && data2.result.variants) {
        const b = data2.result.variants[0] && (data2.result.variants[0].barcode || data2.result.variants[0].gtin);
        if (b) return String(b).trim();
      }
    } catch (_) {}
    return '';
  }
}

async function main() {
  console.log('Trendyol Barkod Fetcher basliyor...\n');

  const products = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  console.log(`Toplam ${products.length} Trendyol urunu bulundu.`);

  let fetched = 0;
  let found = 0;
  let failed = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    // Zaten barkod varsa atla
    if (p.barcode) {
      fetched++;
      found++;
      continue;
    }

    const productId = extractProductId(p.productUrl);
    if (!productId) {
      fetched++;
      failed++;
      continue;
    }

    try {
      const barcode = await fetchBarcode(productId);
      if (barcode) {
        p.barcode = barcode;
        found++;
        if (found % 10 === 0) {
          console.log(`  [${i+1}/${products.length}] Barkod bulundu: ${barcode} — ${p.name.substring(0, 50)}`);
        }
      } else {
        p.barcode = '';
        failed++;
      }
    } catch (err) {
      p.barcode = '';
      failed++;
    }

    fetched++;

    // Her BATCH_SIZE urun sonra kaydet
    if (fetched % BATCH_SIZE === 0) {
      fs.writeFileSync(INPUT_FILE, JSON.stringify(products, null, 2), 'utf8');
      process.stdout.write(`\r  ${fetched}/${products.length} islendi (${found} barkod bulundu, ${failed} basarisiz)...`);
    }

    await sleep(DELAY_MS);
  }

  // Son kaydet
  fs.writeFileSync(INPUT_FILE, JSON.stringify(products, null, 2), 'utf8');

  console.log('\n\nTamamlandi!');
  console.log(`  Toplam islenen: ${fetched}`);
  console.log(`  Barkod bulunan: ${found}`);
  console.log(`  Barkod bulunamayan: ${failed}`);
  console.log(`  Kaydedildi: ${INPUT_FILE}`);
}

main().catch(err => { console.error('Kritik hata:', err.message); process.exit(1); });
