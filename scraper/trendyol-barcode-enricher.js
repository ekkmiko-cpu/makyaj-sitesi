/**
 * Trendyol Barkod Toplayici
 * Her Trendyol ürününe ait ürün sayfasından EAN barkodunu çeker.
 * Çalıştırmak için: node trendyol-barcode-enricher.js
 */

const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, 'trendyol-products.json');
const OUTPUT = path.join(__dirname, 'trendyol-barcodes.json');
const CONCURRENCY = 6;
const DELAY_MS = 400;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchPage(url) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    };
    try {
      const req = https.get(options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const encoding = res.headers['content-encoding'];
          // Gzip decompress
          if (encoding === 'gzip') {
            zlib.gunzip(buf, (err, decoded) => {
              if (err) { resolve(''); return; }
              resolve(decoded.toString('utf8'));
            });
          } else if (encoding === 'deflate') {
            zlib.inflate(buf, (err, decoded) => {
              if (err) { resolve(''); return; }
              resolve(decoded.toString('utf8'));
            });
          } else {
            resolve(buf.toString('utf8'));
          }
        });
      });
      req.on('error', () => resolve(''));
      req.setTimeout(15000, () => { req.destroy(); resolve(''); });
    } catch { resolve(''); }
  });
}

function extractBarcode(html) {
  // Trendyol ürün sayfasında barkod JSON içinde: "barcode":"3600531541699"
  const m = html.match(/"barcode":"?(\d{8,14})"?/);
  if (m) return m[1];
  return null;
}

async function main() {
  const products = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

  // Mevcut çalışmayı yükle (devam desteği)
  let existing = {};
  if (fs.existsSync(OUTPUT)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
    const prevFound = Object.values(existing).filter(Boolean).length;
    console.log(`Mevcut kayıt: ${Object.keys(existing).length} tarandı, ${prevFound} barkod`);
  }

  const toProcess = products.filter(p => !existing[p.id]);
  console.log(`Taranacak: ${toProcess.length} ürün (toplam: ${products.length})`);

  let done = 0, found = 0;

  // Batch processing
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);

    const results = await Promise.all(batch.map(async (prod) => {
      const html = await fetchPage(prod.productUrl);
      const barcode = extractBarcode(html);
      return { id: prod.id, barcode };
    }));

    results.forEach(({ id, barcode }) => {
      existing[id] = barcode || null;
      if (barcode) found++;
    });
    done += batch.length;

    // Her 48 üründe bir kaydet
    if (done % 48 === 0 || i + CONCURRENCY >= toProcess.length) {
      fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2));
      const pct = Math.round(done / toProcess.length * 100);
      process.stdout.write(`\r  ${done}/${toProcess.length} (${pct}%) - barkod: ${found}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nTamamlandı! ${found}/${products.length} ürün için barkod bulundu.`);
  console.log(`Kayıt: ${OUTPUT}`);
}

main().catch(console.error);
