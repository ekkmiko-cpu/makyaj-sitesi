/**
 * Master Scraper — Tüm satıcıları sırayla çalıştırır
 * Çalıştır: node run-all.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRAPERS = [
  { name: 'Sephora TR',  script: 'sephora-scraper.js',  output: 'sephora-products.json' },
  { name: 'Trendyol',    script: 'trendyol-scraper.js',  output: 'trendyol-products.json' },
  { name: 'Gratis',      script: 'gratis-scraper.js',    output: 'gratis-products.json' },
  { name: 'Watsons',     script: 'watsons-scraper.js',   output: 'watsons-products.json' },
  { name: 'Rossmann',    script: 'rossmann-scraper.js',  output: 'rossmann-products.json' },
];

const results = {};
const startTime = Date.now();

console.log('═══════════════════════════════════════════');
console.log('  🚀 BEAUTÉ — Çoklu Satıcı Scraper');
console.log('═══════════════════════════════════════════\n');

for (const scraper of SCRAPERS) {
  const scriptPath = path.join(__dirname, scraper.script);
  const outputPath = path.join(__dirname, scraper.output);

  // Script dosyası var mı?
  if (!fs.existsSync(scriptPath)) {
    console.log(`⚠️  ${scraper.name}: ${scraper.script} bulunamadı, atlanıyor.\n`);
    results[scraper.name] = { status: 'skipped', count: 0 };
    continue;
  }

  console.log(`\n▶ ${scraper.name} başlıyor...`);
  const t0 = Date.now();

  try {
    execSync(`node ${scriptPath}`, {
      cwd: __dirname,
      stdio: 'inherit',
      timeout: 15 * 60 * 1000, // 15 dk limit per scraper
      env: { ...process.env },
    });

    // Sonuç dosyasını kontrol et
    if (fs.existsSync(outputPath)) {
      const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`✅ ${scraper.name}: ${data.length} ürün (${elapsed}s)\n`);
      results[scraper.name] = { status: 'ok', count: data.length };
    } else {
      console.log(`⚠️  ${scraper.name}: Script çalıştı ama output dosyası bulunamadı\n`);
      results[scraper.name] = { status: 'no-output', count: 0 };
    }
  } catch (err) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    console.error(`❌ ${scraper.name}: Hata (${elapsed}s) — ${err.message?.substring(0, 100)}\n`);
    results[scraper.name] = { status: 'error', count: 0 };
  }
}

// Özet
const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log('\n═══════════════════════════════════════════');
console.log('  📊 ÖZET');
console.log('═══════════════════════════════════════════');
let totalProducts = 0;
for (const [name, r] of Object.entries(results)) {
  const icon = r.status === 'ok' ? '✅' : r.status === 'skipped' ? '⏭️' : '❌';
  console.log(`  ${icon} ${name}: ${r.count} ürün (${r.status})`);
  totalProducts += r.count;
}
console.log(`\n  🎯 Toplam: ${totalProducts} ürün`);
console.log(`  ⏱️  Süre: ${totalTime} dk`);
console.log('═══════════════════════════════════════════\n');

// En az 1 scraper başarılı olduysa devam et
const successCount = Object.values(results).filter(r => r.status === 'ok').length;
if (successCount === 0) {
  console.error('❌ Hiçbir scraper başarılı olamadı!');
  process.exit(1);
}

// generate-site-data.js çalıştır
console.log('📦 products-data.js oluşturuluyor...');
try {
  execSync('node generate-site-data.js', { cwd: __dirname, stdio: 'inherit' });
  console.log('\n🎉 Tamamlandı!');
} catch (err) {
  console.error('❌ generate-site-data.js hatası:', err.message);
  process.exit(1);
}
