/**
 * Sephora TR — Ton/renk verisi çekici (Playwright)
 * .product-variations container'ındaki linklerden ton isimlerini çeker
 *
 * Çalıştır:  cd scraper && node fetch-sephora-shades.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'products-data.js');
const CHECKPOINT_FILE = path.join(__dirname, 'sephora-shades-checkpoint.json');
const DELAY_MS = 1800;

// Load products
const src = fs.readFileSync(DATA_FILE, 'utf8');
eval(src.replace('const products', 'var products'));

// Load checkpoint
let checkpoint = {};
if (fs.existsSync(CHECKPOINT_FILE)) {
  checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function saveCheckpoint() {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

async function extractShadesFromPage(page) {
  return page.evaluate(() => {
    const shades = [];
    const seen = new Set();

    // Method 1: Links inside .product-variations container
    const container = document.querySelector('.product-variations');
    if (container) {
      container.querySelectorAll('a').forEach(a => {
        const text = a.textContent.trim();
        if (text && text.length > 1 && text.length < 80 && !seen.has(text)) {
          seen.add(text);
          shades.push(text);
        }
      });
    }

    // Method 2: li items with shade data
    document.querySelectorAll('.product-variations li[data-value], .product-variations li[data-attr-value]').forEach(li => {
      const val = li.getAttribute('data-value') || li.getAttribute('data-attr-value') || '';
      if (val && !seen.has(val)) {
        seen.add(val);
        shades.push(val);
      }
    });

    // Method 3: Buttons with aria-label containing shade info
    document.querySelectorAll('.product-variations button[aria-label], .product-variations [title]').forEach(el => {
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || '';
      const cleaned = name.replace(/^(Seçili\s+)?renk:\s*/i, '').trim();
      if (cleaned && cleaned.length > 1 && cleaned.length < 80 && !seen.has(cleaned)) {
        seen.add(cleaned);
        shades.push(cleaned);
      }
    });

    // Method 4: Selected shade display (fallback)
    if (shades.length === 0) {
      const selected = document.querySelector('.variations-shade-selected, .selected-shade, .shade-name');
      if (selected) {
        const text = selected.textContent.trim();
        if (text && text.length > 1 && text.length < 80) {
          shades.push(text);
        }
      }
    }

    // Clean: remove duplicates and "(30 ml)" etc. patterns from end — keep the shade name
    return shades.map(s => s.replace(/\s*\(\d+\s*(?:ml|g|oz)\)/gi, '').trim()).filter(s => s.length > 0);
  });
}

async function main() {
  const sepProducts = products.filter(p => p.source === 'sephora' && p.productUrl);
  const toProcess = sepProducts.filter(p => !checkpoint[p.id]);

  console.log('\n🛍️  Sephora Ton Verisi Çekici');
  console.log('📦 Toplam Sephora ürünü: ' + sepProducts.length);
  console.log('✅ Zaten işlenmiş: ' + Object.keys(checkpoint).length);
  console.log('⏳ İşlenecek: ' + toProcess.length + '\n');

  if (toProcess.length === 0) {
    console.log('Tüm ürünler zaten işlenmiş.');
    applyShades();
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'tr-TR',
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  // Block heavy resources
  await page.route('**/*.{png,jpg,jpeg,gif,webp,woff2,woff,mp4,webm}', route => route.abort());
  await page.route('**/analytics/**', route => route.abort());
  await page.route('**/gtm.js', route => route.abort());
  await page.route('**/tc_*.js', route => route.abort());

  let processed = 0, found = 0, errors = 0, consecutiveErrors = 0;

  for (const p of toProcess) {
    processed++;
    const shortName = (p.brand + ' ' + p.name).substring(0, 55);
    process.stdout.write('[' + processed + '/' + toProcess.length + '] ' + shortName + '...');

    try {
      await page.goto(p.productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2500);

      // Accept cookies first time
      if (processed === 1) {
        try { await page.click('#onetrust-accept-btn-handler', { timeout: 2000 }); } catch(e) {}
      }

      const shades = await extractShadesFromPage(page);

      // Deduplicate
      const unique = [...new Set(shades)].filter(s => s.length > 0);

      checkpoint[p.id] = {
        shades: unique,
        count: unique.length,
        fetchedAt: new Date().toISOString()
      };

      consecutiveErrors = 0;

      if (unique.length > 1) {
        found++;
        console.log(' ✓ ' + unique.length + ' ton: ' + unique.slice(0, 3).join(', ') + (unique.length > 3 ? '...' : ''));
      } else if (unique.length === 1) {
        console.log(' — tek ton: ' + unique[0]);
      } else {
        console.log(' — veri yok');
      }

      if (processed % 20 === 0) {
        saveCheckpoint();
        console.log('  💾 Checkpoint (' + Object.keys(checkpoint).length + ' ürün, ' + found + ' çoklu ton)');
      }

      await sleep(DELAY_MS);

    } catch (e) {
      errors++;
      consecutiveErrors++;
      console.log(' ✗ ' + e.message.substring(0, 60));
      checkpoint[p.id] = { shades: [], count: 0, error: e.message.substring(0, 100), fetchedAt: new Date().toISOString() };

      if (consecutiveErrors > 15) {
        console.log('\n⚠️  15 ardışık hata — blok olabilir. 30 saniye bekleniyor...');
        await sleep(30000);
        consecutiveErrors = 0;
      }
    }
  }

  await browser.close();
  saveCheckpoint();
  console.log('\n✅ Tamamlandı: ' + processed + ' işlendi, ' + found + ' çoklu ton, ' + errors + ' hata');

  applyShades();
}

function applyShades() {
  console.log('\n🔄 Sephora ton verileri uygulanıyor...');

  let updated = 0;
  for (const p of products) {
    const cp = checkpoint[p.id];
    if (!cp || !cp.shades || cp.shades.length <= 1) continue;

    const existing = p.shadeOptions || [];
    const merged = [...new Set([...existing, ...cp.shades])];

    if (merged.length > (p.shadeOptions || []).length) {
      p.shadeOptions = merged;
      updated++;
    }
  }

  const headerLines = [];
  const lines = src.split('\n');
  for (const line of lines) {
    if (line.startsWith('//')) headerLines.push(line);
    else break;
  }

  const newSrc = headerLines.join('\n') + '\nconst products = ' + JSON.stringify(products, null, 2) + ';\n';
  fs.writeFileSync(DATA_FILE, newSrc);

  console.log('✅ ' + updated + ' Sephora ürünü güncellendi');
  const totalWithShades = products.filter(p => p.shadeOptions && p.shadeOptions.length > 1).length;
  console.log('📊 Toplam ton verisi olan: ' + totalWithShades + '/' + products.length);
}

main().catch(e => {
  console.error('Fatal:', e);
  saveCheckpoint();
  process.exit(1);
});
