// fetch-shades.js — Trendyol ürün sayfalarından ton/renk verisi çeker
// Kullanım: node scraper/fetch-shades.js
const fs = require('fs');
const https = require('https');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'products-data.js');
const CHECKPOINT_FILE = path.join(__dirname, 'shades-checkpoint.json');
const DELAY_MS = 800;
const MAX_PRODUCTS = 523; // All Trendyol products

// Load products
const src = fs.readFileSync(DATA_FILE, 'utf8');
eval(src.replace('const products', 'var products'));

// Load checkpoint
let checkpoint = {};
if (fs.existsSync(CHECKPOINT_FILE)) {
  checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
}

function fetchUrl(url, retries = 2) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 12000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) { const u = new URL(url); loc = u.protocol + '//' + u.host + loc; }
        return fetchUrl(loc, retries).then(resolve).catch(reject);
      }
      if (res.statusCode === 429 && retries > 0) {
        setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 3000);
        return;
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', e => {
      if (retries > 0) setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 2000);
      else reject(e);
    }).on('timeout', function () { this.destroy(); reject(new Error('timeout')); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Clean shade name: remove brand + product prefix, keep just shade part
function cleanShadeName(rawName, brand, productName) {
  let s = rawName;
  // Remove brand prefix
  if (brand) s = s.replace(new RegExp('^' + escapeRegex(brand) + '\\s*', 'i'), '');
  // Try to find shade part after product name match
  // The raw name is usually: "Brand ProductName - ShadeCode ShadeName"
  // Remove common product name words
  if (productName) {
    // Find longest common prefix
    const prodWords = productName.toLowerCase().split(/[\s-]+/);
    const nameWords = s.split(/[\s-]+/);
    let matchEnd = 0;
    for (let i = 0; i < Math.min(prodWords.length, nameWords.length); i++) {
      if (prodWords[i] === nameWords[i].toLowerCase()) matchEnd = i + 1;
      else break;
    }
    if (matchEnd > 0) {
      s = nameWords.slice(matchEnd).join(' ');
    }
  }
  // Clean up leading separators
  s = s.replace(/^[\s\-–—:·]+/, '').trim();
  // If empty, use the raw name
  if (!s) s = rawName;
  return s;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractShades(html, brand, productName) {
  const shades = [];

  // JSON-LD structured data
  const jsonLdMatches = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonStr = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
        const data = JSON.parse(jsonStr);
        if (data.hasVariant) {
          for (const v of data.hasVariant) {
            const raw = v.name || '';
            if (!raw) continue;
            const clean = cleanShadeName(raw, brand, productName);
            const price = v.offers ? (v.offers.price || v.offers.lowPrice || null) : null;
            const url = v.url || '';
            const img = v.image || '';
            if (!shades.find(s => s.raw === raw)) {
              shades.push({ shade: clean, raw: raw, price: price ? Number(price) : null, url, img });
            }
          }
        }
      } catch (e) { /* skip */ }
    }
  }

  return shades;
}

async function main() {
  const trendyolProducts = products.filter(p => {
    return p.productUrl && p.productUrl.includes('trendyol.com');
  });

  const toProcess = trendyolProducts.filter(p => !checkpoint[p.id]);

  console.log(`\n📦 Toplam ürün: ${products.length}`);
  console.log(`🔗 Trendyol: ${trendyolProducts.length}`);
  console.log(`✅ Zaten işlenmiş: ${Object.keys(checkpoint).length}`);
  console.log(`⏳ İşlenecek: ${toProcess.length}\n`);

  let processed = 0, found = 0, errors = 0;

  for (const p of toProcess) {
    processed++;
    try {
      const shortName = (p.brand + ' ' + p.name).substring(0, 50);
      process.stdout.write(`[${processed}/${toProcess.length}] ${shortName}...`);

      const html = await fetchUrl(p.productUrl);
      const shades = extractShades(html, p.brand, p.name);

      checkpoint[p.id] = {
        shades: shades.map(s => ({ shade: s.shade, price: s.price })),
        count: shades.length,
        fetchedAt: new Date().toISOString()
      };

      if (shades.length > 1) {
        found++;
        console.log(` ✓ ${shades.length} ton: ${shades.slice(0, 3).map(s => s.shade).join(', ')}${shades.length > 3 ? '...' : ''}`);
      } else if (shades.length === 1) {
        console.log(` — tek ton: ${shades[0].shade}`);
      } else {
        console.log(` — veri yok`);
      }

      // Save checkpoint every 20 products
      if (processed % 20 === 0) {
        fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
        console.log(`  💾 Checkpoint (${Object.keys(checkpoint).length} ürün, ${found} çoklu ton)`);
      }

      await sleep(DELAY_MS);
    } catch (e) {
      errors++;
      console.log(` ✗ ${e.message}`);
      checkpoint[p.id] = { shades: [], count: 0, error: e.message, fetchedAt: new Date().toISOString() };
    }
  }

  // Final save
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  console.log(`\n✅ Tamamlandı: ${processed} işlendi, ${found} çoklu ton, ${errors} hata`);

  // Apply to products
  applyShades();
}

function applyShades() {
  console.log('\n🔄 Ton verileri uygulanıyor...');

  let updated = 0;
  for (const p of products) {
    const cp = checkpoint[p.id];
    if (!cp || !cp.shades || cp.shades.length <= 0) continue;

    // Add shadeOptions field
    p.shadeOptions = cp.shades.map(s => s.shade);
    if (cp.shades.length > 1) updated++;
  }

  // Preserve the file header comments
  const headerLines = [];
  const lines = src.split('\n');
  for (const line of lines) {
    if (line.startsWith('//')) headerLines.push(line);
    else break;
  }

  const newSrc = headerLines.join('\n') + '\nconst products = ' + JSON.stringify(products, null, 2) + ';\n';
  fs.writeFileSync(DATA_FILE, newSrc);

  console.log(`✅ ${updated} üründe çoklu ton eklendi, products-data.js güncellendi`);
}

main().catch(e => {
  console.error('Fatal:', e);
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  process.exit(1);
});
