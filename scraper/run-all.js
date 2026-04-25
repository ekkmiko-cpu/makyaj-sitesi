/**
 * Master Scraper — Tüm satıcıları paralel havuzla çalıştırır
 * Çalıştır: node run-all.js
 *
 * OPTİMİZASYON:
 *  - Sequential -> parallel pool (concurrency=3). Her satıcı farklı domain
 *    olduğundan paralel koşmak nezaket kuralını ihlal etmez; her bir
 *    scraper kendi içindeki DELAY_MS'e uyar.
 *  - Tipik tam tur: ~7h -> ~2-2.5h.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CONCURRENCY = 3;
const PER_SCRAPER_TIMEOUT_MS = 90 * 60 * 1000; // 90 dk

const SCRAPERS = [
  // ── Büyük platformlar ─────────────────────────────────────────────────────
  { name: 'Trendyol',      script: 'trendyol-scraper.js',     output: 'trendyol-products.json'     },
  { name: 'Hepsiburada',   script: 'hepsiburada-scraper.js',  output: 'hepsiburada-products.json'  },
  { name: 'Amazon TR',     script: 'amazon-scraper.js',       output: 'amazon-products.json'       },
  // ── Güzellik/kozmetik zincirler ───────────────────────────────────────────
  { name: 'Rossmann',      script: 'rossmann-scraper.js',     output: 'rossmann-products.json'     },
  { name: 'Gratis',        script: 'gratis-scraper.js',       output: 'gratis-products.json'       },
  { name: 'Yves Rocher',   script: 'yvesrocher-scraper.js',   output: 'yvesrocher-products.json'   },
  // ── Genel marketplace ─────────────────────────────────────────────────────
  { name: 'İdefix',        script: 'idefix-scraper.js',       output: 'idefix-products.json'       },
  { name: 'Pazarama',      script: 'pazarama-scraper.js',     output: 'pazarama-products.json'     },
  { name: 'PTT AVM',       script: 'pttavm-scraper.js',       output: 'pttavm-products.json'       },
  // ── Akamai IP engeli (residential proxy gerekli) ──────────────────────────
  // { name: 'Sephora TR', script: 'sephora-scraper.js',      output: 'sephora-products.json'      }, // tüm domain 403
  // { name: 'Watsons',    script: 'watsons-scraper.js',      output: 'watsons-products.json'      }, // tüm domain 403
];

const results = {};
const startTime = Date.now();

console.log('═══════════════════════════════════════════');
console.log('  🚀 KOZMELOVE — Çoklu Satıcı Scraper');
console.log(`  ⚙  Paralel havuz (concurrency=${CONCURRENCY})`);
console.log('═══════════════════════════════════════════\n');

function runScraper(scraper) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scraper.script);
    const outputPath = path.join(__dirname, scraper.output);
    const tag = scraper.name.padEnd(12);

    if (!fs.existsSync(scriptPath)) {
      console.log(`⚠️  [${tag}] ${scraper.script} bulunamadı, atlanıyor.`);
      results[scraper.name] = { status: 'skipped', count: 0 };
      return resolve();
    }

    console.log(`▶  [${tag}] başlıyor...`);
    const t0 = Date.now();

    const child = spawn('node', [scriptPath], {
      cwd: __dirname,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Çıktıları satıcı etiketiyle önekleyerek karıştırılan logları okunur tut
    const prefix = (line) => `   [${tag}] ${line}`;
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let idx;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (line.trim()) console.log(prefix(line));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      let idx;
      while ((idx = stderrBuf.indexOf('\n')) >= 0) {
        const line = stderrBuf.slice(0, idx);
        stderrBuf = stderrBuf.slice(idx + 1);
        if (line.trim()) console.error(prefix(line));
      }
    });

    const killTimer = setTimeout(() => {
      console.error(`⏱  [${tag}] timeout (${PER_SCRAPER_TIMEOUT_MS / 60000} dk) — sonlandırılıyor`);
      try { child.kill('SIGKILL'); } catch {}
    }, PER_SCRAPER_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(killTimer);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

      if (code === 0 && fs.existsSync(outputPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
          console.log(`✅ [${tag}] ${data.length} ürün (${elapsed}s)`);
          results[scraper.name] = { status: 'ok', count: data.length };
        } catch (e) {
          console.error(`⚠️  [${tag}] output JSON parse hatası: ${e.message}`);
          results[scraper.name] = { status: 'bad-output', count: 0 };
        }
      } else if (code === 0) {
        console.log(`⚠️  [${tag}] çalıştı ama output yok (${elapsed}s)`);
        results[scraper.name] = { status: 'no-output', count: 0 };
      } else {
        console.error(`❌ [${tag}] exit=${code} (${elapsed}s)`);
        results[scraper.name] = { status: 'error', count: 0 };
      }
      resolve();
    });
  });
}

async function pool(items, size, worker) {
  const queue = [...items];
  const inflight = new Set();
  while (queue.length || inflight.size) {
    while (inflight.size < size && queue.length) {
      const item = queue.shift();
      const p = worker(item).finally(() => inflight.delete(p));
      inflight.add(p);
    }
    await Promise.race(inflight);
  }
}

(async () => {
  await pool(SCRAPERS, CONCURRENCY, runScraper);

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
  console.log(`  ⏱  Süre: ${totalTime} dk`);
  console.log('═══════════════════════════════════════════\n');

  const successCount = Object.values(results).filter((r) => r.status === 'ok').length;
  if (successCount === 0) {
    console.error('❌ Hiçbir scraper başarılı olamadı!');
    process.exit(1);
  }

  // generate-site-data.js
  console.log('📦 products-data.js oluşturuluyor...');
  const gen = spawn('node', ['generate-site-data.js'], { cwd: __dirname, stdio: 'inherit' });
  gen.on('close', (code) => {
    if (code === 0) console.log('\n🎉 Tamamlandı!');
    else { console.error('❌ generate-site-data.js exit=' + code); process.exit(1); }
  });
})();
