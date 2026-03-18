/**
 * Çoklu Satıcı → Site products-data.js dönüştürücü
 * Tüm satıcı JSON dosyalarını birleştirir, aynı ürünleri eşleştirir
 * Çalıştır: node generate-site-data.js
 */

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'products-data.js');

// ── Satıcı dosyaları ──
const SOURCES = [
  { file: 'sephora-products.json',  site: 'Sephora' },
  { file: 'trendyol-products.json', site: 'Trendyol' },
  { file: 'gratis-products.json',   site: 'Gratis' },
  { file: 'watsons-products.json',  site: 'Watsons' },
  { file: 'rossmann-products.json', site: 'Rossmann' },
];

// ── Kategori → skinType varsayılanları ──
const skinDefaults = {
  fondoten:      ['normal', 'karma'],
  kapatici:      ['normal', 'karma', 'yağlı'],
  primer:        ['yağlı', 'karma'],
  allik:         ['normal', 'kuru', 'karma'],
  aydinlatici:   ['kuru', 'normal'],
  bronzer:       ['normal', 'karma'],
  kontur:        ['normal', 'karma'],
  pudra:         ['yağlı', 'karma'],
  maskara:       ['normal', 'kuru', 'karma'],
  far:           ['normal', 'kuru', 'karma'],
  'far-paleti':  ['normal', 'kuru', 'karma'],
  eyeliner:      ['yağlı', 'karma'],
  'goz-kalemi':  ['normal', 'karma'],
  ruj:           ['kuru', 'normal'],
  'dudak-parlatici': ['kuru', 'normal'],
  'dudak-kalemi':    ['normal', 'karma'],
};

// ── Marka ismi normalizasyonu ──
function normalizeBrand(brand) {
  return (brand || '')
    .toUpperCase()
    .replace(/[''`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Ürün ismi normalizasyonu (eşleştirme için) ──
function normalizeNameForMatch(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── İsim benzerliği (basit Jaccard) ──
function similarity(a, b) {
  const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

// ── İsmi temizle (gösterim için) ──
function cleanName(name, brand) {
  return name
    .replace(/\s+/g, ' ')
    .replace(new RegExp(brand, 'gi'), '')
    .trim()
    .substring(0, 80)
    .trim();
}

// ── Rating tahmin ──
function fakeRating(price) {
  if (price > 3000) return +(4.5 + Math.random() * 0.4).toFixed(1);
  if (price > 1500) return +(4.2 + Math.random() * 0.5).toFixed(1);
  return +(3.8 + Math.random() * 0.7).toFixed(1);
}
function fakeReviews(price) {
  if (price > 3000) return Math.floor(50 + Math.random() * 500);
  if (price > 1500) return Math.floor(100 + Math.random() * 1000);
  return Math.floor(200 + Math.random() * 3000);
}

// ── Tüm kaynaklardan verileri yükle ──
let allRaw = [];
const sourceCounts = {};

for (const src of SOURCES) {
  const filePath = path.join(__dirname, src.file);
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️  ${src.site}: ${src.file} bulunamadı, atlanıyor`);
    sourceCounts[src.site] = 0;
    continue;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const tagged = data.map(p => ({ ...p, _site: src.site }));
    allRaw.push(...tagged);
    sourceCounts[src.site] = data.length;
    console.log(`📦 ${src.site}: ${data.length} ürün yüklendi`);
  } catch (err) {
    console.error(`❌ ${src.site}: JSON parse hatası — ${err.message}`);
    sourceCounts[src.site] = 0;
  }
}

console.log(`\n📊 Toplam ham veri: ${allRaw.length} ürün`);

// ── Ürünleri eşleştir ve birleştir ──
// Aynı marka + benzer isim + aynı kategori = aynı ürün
const merged = []; // Final ürün listesi
const used = new Set(); // Kullanılmış indexler

for (let i = 0; i < allRaw.length; i++) {
  if (used.has(i)) continue;
  used.add(i);

  const base = allRaw[i];
  const baseBrand = normalizeBrand(base.brand);
  const baseName = normalizeNameForMatch(base.name);

  // Bu ürünün fiyat bilgileri
  const prices = [{
    site: base._site,
    price: base.price,
    url: base.productUrl,
  }];

  // Diğer kaynaklarda aynı ürünü bul
  for (let j = i + 1; j < allRaw.length; j++) {
    if (used.has(j)) continue;
    const other = allRaw[j];

    // Aynı kaynaktan geliyorsa atla
    if (other._site === base._site) continue;

    // Aynı kategori mi?
    if (other.category !== base.category) continue;

    // Marka eşleşmesi
    const otherBrand = normalizeBrand(other.brand);
    if (baseBrand !== otherBrand) continue;

    // İsim benzerliği
    const otherName = normalizeNameForMatch(other.name);
    const sim = similarity(baseName, otherName);
    if (sim < 0.5) continue;

    // Eşleşti!
    used.add(j);
    prices.push({
      site: other._site,
      price: other.price,
      url: other.productUrl,
    });
  }

  // Fiyatları sırala (düşükten yükseğe)
  prices.sort((a, b) => a.price - b.price);

  merged.push({
    ...base,
    prices,
    _matchCount: prices.length,
  });
}

console.log(`🔗 Eşleştirme sonucu: ${merged.length} benzersiz ürün (${allRaw.length} ham veriden)`);

// ── Final ürün listesini oluştur ──
const products = merged.map((p, i) => {
  const rating = p.rating > 0 ? p.rating : fakeRating(p.prices[0].price);
  const reviews = p.reviews > 0 ? p.reviews : fakeReviews(p.prices[0].price);
  const name = cleanName(p.name, p.brand);

  return {
    id: i + 1,
    brand: p.brand,
    name,
    category: p.category,
    categoryLabel: p.categoryLabel,
    skinType: skinDefaults[p.category] || ['normal'],
    shades: [],
    prices: p.prices,
    rating: +parseFloat(rating).toFixed(1),
    reviews: Math.round(reviews),
    imageUrl: p.imageUrl,
    productUrl: p.productUrl,
    desc: p.desc || '',
    trending: rating >= 4.7,
    vegan: p.vegan || false,
    crueltyFree: p.crueltyFree || false,
    spf: false,
    dupeFor: [],
    dupeOf: [],
    ingredients: [],
    ingredientWarnings: [],
    source: p._site?.toLowerCase() || p.source || 'unknown',
    priceCount: p.prices.length,
  };
});

// ── Dosyaya yaz ──
const siteCount = Object.entries(sourceCounts).filter(([,v]) => v > 0).length;
const multiPriceCount = products.filter(p => p.prices.length > 1).length;

const js = \`// Beauté ürün verisi — \${products.length} ürün, \${siteCount} satıcı
// Otomatik üretildi: \${new Date().toLocaleDateString('tr-TR')}
// Çoklu fiyat: \${multiPriceCount} üründe birden fazla satıcı
const products = \${JSON.stringify(products, null, 2)};
\`;

fs.writeFileSync(OUTPUT, js, 'utf8');

// ── Özet ──
console.log(\`\n✅ \${products.length} ürün → products-data.js\`);
console.log(\`🏪 Satıcılar:\`);
for (const [site, count] of Object.entries(sourceCounts)) {
  console.log(\`   \${count > 0 ? '✅' : '⏭️'} \${site}: \${count}\`);
}
console.log(\`🔗 Çoklu fiyat: \${multiPriceCount} üründe\`);

const cats = {};
products.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
console.log(\`📂 Kategoriler:\`);
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(\`   \${k}: \${v}\`));
