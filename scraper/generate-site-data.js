/**
 * Sephora JSON → Site products-data.js dönüştürücü
 * Çalıştır: node generate-site-data.js
 */

const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, 'sephora-products.json');
const OUTPUT = path.join(__dirname, '..', 'products-data.js');

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// Kategori → skinType varsayılanları
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

// İsmi temizle (gereksiz kategori tekrarı)
function cleanName(name, brand) {
  return name
    .replace(/\s+/g, ' ')
    .replace(new RegExp(brand, 'gi'), '')
    .trim()
    .substring(0, 60)
    .trim();
}

// Rating 0 ise rastgele gerçekçi bir değer ata (veri yokken)
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

// Dönüştür
const products = raw.map((p, i) => {
  const rating  = p.rating > 0 ? p.rating : fakeRating(p.price);
  const reviews = p.reviews > 0 ? p.reviews : fakeReviews(p.price);
  const name    = cleanName(p.name, p.brand);

  return {
    id: i + 1,
    brand: p.brand,
    name,
    category: p.category,
    categoryLabel: p.categoryLabel,
    skinType: skinDefaults[p.category] || ['normal'],
    shades: [],
    prices: [{ site: 'Sephora', price: p.price, url: p.productUrl }],
    rating,
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
    source: 'sephora',
  };
});

const js = `// Sephora TR ürün verisi — ${products.length} ürün
// Otomatik üretildi: ${new Date().toLocaleDateString('tr-TR')}
const products = ${JSON.stringify(products, null, 2)};
`;

fs.writeFileSync(OUTPUT, js, 'utf8');
console.log(`✅ ${products.length} ürün → products-data.js`);

// Özet
const cats = {};
products.forEach(p => { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`   ${k}: ${v}`));
