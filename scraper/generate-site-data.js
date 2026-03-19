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
  kapatici:      ['normal', 'karma', 'yagli'],
  primer:        ['yagli', 'karma'],
  allik:         ['normal', 'kuru', 'karma'],
  aydinlatici:   ['kuru', 'normal'],
  bronzer:       ['normal', 'karma'],
  kontur:        ['normal', 'karma'],
  pudra:         ['yagli', 'karma'],
  maskara:       ['normal', 'kuru', 'karma'],
  far:           ['normal', 'kuru', 'karma'],
  'far-paleti':  ['normal', 'kuru', 'karma'],
  eyeliner:      ['yagli', 'karma'],
  'goz-kalemi':  ['normal', 'karma'],
  ruj:           ['kuru', 'normal'],
  'dudak-parlatici': ['kuru', 'normal'],
  'dudak-kalemi':    ['normal', 'karma'],
  'kas':             ['normal', 'karma'],
  'bronzer':         ['normal', 'karma'],
};

// ── Kategori label normalizasyonu (Türkçe karakter birleştirme) ──
var categoryLabelMap = {
  'Fondoten': 'Fondöten',
  'Fondöten': 'Fondöten',
  'Maskara': 'Maskara',
  'Ruj': 'Ruj',
  'Goz Fari': 'Göz Farı',
  'Göz Farı': 'Göz Farı',
  'Far Paleti': 'Far Paleti',
  'Eyeliner': 'Eyeliner',
  'Goz Kalemi': 'Göz Kalemi',
  'Göz Kalemi': 'Göz Kalemi',
  'Allik': 'Allık',
  'Allık': 'Allık',
  'Aydinlatici': 'Aydınlatıcı',
  'Aydınlatıcı': 'Aydınlatıcı',
  'Bronzer': 'Bronzer',
  'Kontur': 'Kontür',
  'Kontür': 'Kontür',
  'Kapatici': 'Kapatıcı',
  'Kapatıcı': 'Kapatıcı',
  'Primer': 'Primer',
  'Pudra': 'Pudra',
  'Dudak Parlatici': 'Dudak Parlatıcı',
  'Dudak Parlatıcı': 'Dudak Parlatıcı',
  'Dudak Kalemi': 'Dudak Kalemi',
  'Kas Makyaji': 'Kaş Makyajı',
  'Kaş Makyajı': 'Kaş Makyajı',
  'Dudak Parlatici': 'Dudak Parlatıcı',
  'Kontur': 'Kontür',
};

function normalizeCategoryLabel(label) {
  return categoryLabelMap[label] || label;
}

// ── Kategori name normalizasyonu (eşleştirme için) ──
var categoryNameMap = {
  'fondoten': 'fondoten',
  'maskara': 'maskara',
  'ruj': 'ruj',
  'ruj-likit': 'ruj',
  'far': 'far',
  'far-paleti': 'far-paleti',
  'eyeliner': 'eyeliner',
  'goz-kalemi': 'goz-kalemi',
  'allik': 'allik',
  'aydinlatici': 'aydinlatici',
  'bronzer': 'bronzer',
  'kontur': 'kontur',
  'kapatici': 'kapatici',
  'primer': 'primer',
  'pudra': 'pudra',
  'dudak-parlatici': 'dudak-parlatici',
  'dudak-kalemi': 'dudak-kalemi',
  'kas': 'kas',
  'bronzer': 'bronzer',
  'kontur': 'kontur',
};

function normalizeCategoryName(name) {
  return categoryNameMap[name] || name;
}

// ── Marka ismi normalizasyonu (agresif eşleştirme için) ──
var brandAliases = {
  'MAYBELLINE': 'MAYBELLINE',
  'MAYBELLINE NEW YORK': 'MAYBELLINE',
  'LOREAL': 'LOREAL PARIS',
  'LOREAL PARIS': 'LOREAL PARIS',
  'L OREAL PARIS': 'LOREAL PARIS',
  'ESTEE LAUDER': 'ESTEE LAUDER',
  'CLINIQUE': 'CLINIQUE',
  'FLORMAR': 'FLORMAR',
  'ESSENCE': 'ESSENCE',
  'GOLDEN ROSE': 'GOLDEN ROSE',
  'NYX': 'NYX',
  'NYX PROFESSIONAL MAKEUP': 'NYX',
  'NYX PROFESSIONAL': 'NYX',
  'MAC': 'MAC',
  'MAC COSMETICS': 'MAC',
  'BENEFIT': 'BENEFIT',
  'BENEFIT COSMETICS': 'BENEFIT',
  'NARS': 'NARS',
  'NARS COSMETICS': 'NARS',
  'DIOR': 'DIOR',
  'DIOR BACKSTAGE': 'DIOR',
  'CHARLOTTE TILBURY': 'CHARLOTTE TILBURY',
  'FENTY BEAUTY': 'FENTY BEAUTY',
  'BOBBI BROWN': 'BOBBI BROWN',
  'URBAN DECAY': 'URBAN DECAY',
  'TOO FACED': 'TOO FACED',
  'CATRICE': 'CATRICE',
  'PUPA': 'PUPA',
  'PUPA MILANO': 'PUPA',
  'INGLOT': 'INGLOT',
  'FARMASI': 'FARMASI',
  'PASTEL': 'PASTEL',
  'PASTEL PROFASHION': 'PASTEL',
  'SHOW BY PASTEL': 'PASTEL',
  'REVOLUTION': 'REVOLUTION',
  'REVOLUTION PRO': 'REVOLUTION',
  'MAKEUP REVOLUTION': 'REVOLUTION',
  'WET N WLD': 'WET N WILD',
  'WET N WILD': 'WET N WILD',
  'LOREAL': 'LOREAL PARIS',
  'L OREAL': 'LOREAL PARIS',
  'MISSHA': 'MISSHA',
  'KIKO': 'KIKO',
  'KIKO MILANO': 'KIKO',
  'PIERRE CARDIN': 'PIERRE CARDIN',
  'CATHERINE ARLEY': 'CATHERINE ARLEY',
  'THE PUREST SOLUTIONS': 'THE PUREST SOLUTIONS',
  'YVES ROCHER': 'YVES ROCHER',
  'NIVEA': 'NIVEA',
  'SHISEIDO': 'SHISEIDO',
  'LANCOME': 'LANCOME',
  'LANCME': 'LANCOME',
  'GUERLAIN': 'GUERLAIN',
  'ARMANI': 'ARMANI',
  'GIORGIO ARMANI': 'ARMANI',
  'YSL': 'YSL',
  'YVES SAINT LAURENT': 'YSL',
  'SISLEY': 'SISLEY',
  'GIVENCHY': 'GIVENCHY',
  'VALENTINO': 'VALENTINO',
  'HUDA BEAUTY': 'HUDA BEAUTY',
  'RARE BEAUTY': 'RARE BEAUTY',
  'TARTE': 'TARTE',
  'SEPHORA COLLECTION': 'SEPHORA COLLECTION',
  'SEPHORA': 'SEPHORA COLLECTION',
  'HOURGLASS': 'HOURGLASS',
  'BELL': 'BELL',
  'GABRINI': 'GABRINI',
  'CALLISTA': 'CALLISTA',
  'NASCITA': 'NASCITA',
  'NOTE': 'NOTE',
  'NOTE COSMETICS': 'NOTE',
};

function normalizeBrand(brand) {
  var clean = (brand || '')
    .toUpperCase()
    .replace(/[''`\u2019\u00B4\u0060\u2018]/g, '')
    .replace(/[éèêë]/gi, 'E')
    .replace(/[àâä]/gi, 'A')
    .replace(/[ùûü]/gi, 'U')
    .replace(/[îï]/gi, 'I')
    .replace(/[ôö]/gi, 'O')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return brandAliases[clean] || clean;
}

// ── Kategori grupları (benzer kategoriler eşleşebilir) ──
var categoryGroups = {
  'fondoten': 'yuz',
  'kapatici': 'yuz',
  'primer': 'yuz',
  'pudra': 'yuz',
  'bronzer': 'yuz',
  'kontur': 'yuz',
  'allik': 'yanak',
  'aydinlatici': 'yanak',
  'maskara': 'goz',
  'far': 'goz',
  'far-paleti': 'goz',
  'eyeliner': 'goz',
  'goz-kalemi': 'goz',
  'ruj': 'dudak',
  'dudak-parlatici': 'dudak',
  'dudak-kalemi': 'dudak',
  'kas': 'kas',
};

function categoryCompatible(catA, catB) {
  if (catA === catB) return true;
  var groupA = categoryGroups[catA];
  var groupB = categoryGroups[catB];
  return groupA && groupB && groupA === groupB;
}

// ── Ürün ismi normalizasyonu (eşleştirme için) ──
function normalizeNameForMatch(name, brand) {
  var clean = (name || '').toLowerCase();
  // Marka ismini ürün adından çıkar
  if (brand) {
    var brandLower = brand.toLowerCase();
    clean = clean.replace(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  return clean
    .replace(/[^a-z0-9\sğüşıöç]/g, '')
    .replace(/\b(adet|ml|gr|spf|no|numara|1|2|3|4|5)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── "Temel ürün adı" — renk/ton/numara bilgilerini çıkar ──
function coreProductName(name, brand) {
  var clean = (name || '').toLowerCase();
  if (brand) {
    var brandLower = brand.toLowerCase();
    clean = clean.replace(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // Renk/ton kodlarını çıkar (örn: "013 Gorgeous Pink", "- 701 Matte Onyx", "No:25")
  clean = clean
    .replace(/[-–]\s*\d+\s*.*/g, '')           // "- 701 Matte Onyx" kısmını sil
    .replace(/\b\d{2,3}\s+[a-z]/g, '')          // "013 gorgeous" → sil
    .replace(/\bno[:\s]*\d+/gi, '')             // "No:25" → sil
    .replace(/\b\d+\s*(ml|gr|g|oz)\b/gi, '')    // "30 ml" → sil
    .replace(/[^a-z0-9\sğüşıöç]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // İlk 4-5 anlamlı kelimeyi tut (ürün tipi genelde burada)
  var words = clean.split(' ').filter(function(w) { return w.length > 2; });
  return words.slice(0, 6).join(' ');
}

// ── İsim benzerliği (basit Jaccard) ──
function similarity(a, b) {
  var wordsA = new Set(a.split(' ').filter(function(w) { return w.length > 1; }));
  var wordsB = new Set(b.split(' ').filter(function(w) { return w.length > 1; }));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  var intersection = 0;
  wordsA.forEach(function(w) { if (wordsB.has(w)) intersection++; });
  var union = new Set();
  wordsA.forEach(function(w) { union.add(w); });
  wordsB.forEach(function(w) { union.add(w); });
  return intersection / union.size;
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

// ── Bilinen markalar listesi (ürün adından marka çıkarmak için) ──
var knownBrands = [
  'Maybelline New York', 'Maybelline', 'L\'Oreal Paris', 'L\'Oréal Paris',
  'Flormar', 'Golden Rose', 'Essence', 'Catrice', 'NOTE', 'Pastel',
  'NYX Professional Makeup', 'NYX', 'MAC', 'Clinique', 'Estee Lauder',
  'Benefit', 'NARS', 'Dior', 'Charlotte Tilbury', 'Fenty Beauty',
  'Bobbi Brown', 'Urban Decay', 'Too Faced', 'Inglot', 'Farmasi',
  'Pupa', 'Revolution', 'Wet n Wild', 'Revlon', 'Rimmel',
  'Shiseido', 'Armani', 'Lancome', 'Lancôme', 'Guerlain',
  'rom&nd', 'Astra', 'Influence Beauty', 'Mixup', 'Sephora Collection',
  'Huda Beauty', 'Rare Beauty', 'Pixi', 'Kosas', 'Tarte',
  'Make Up For Ever', 'Sisley', 'Clarins', 'Givenchy', 'YSL',
  'Yves Saint Laurent', 'Valentino', 'Dolce & Gabbana',
  'Anastasia Beverly Hills', 'Nudestix', 'Milk Makeup',
  'Kiko', 'Pierre Cardin', 'Catherine Arley', 'Bell',
  'Callista', 'Isana', 'Alterra', 'Rival de Loop',
].sort(function(a, b) { return b.length - a.length; }); // En uzun önce (greedy match)

function extractBrandFromName(name) {
  if (!name) return { brand: '', cleanName: name };
  var nameLower = name.toLowerCase();
  for (var i = 0; i < knownBrands.length; i++) {
    var b = knownBrands[i];
    var bLower = b.toLowerCase();
    if (nameLower.startsWith(bLower + ' ') || nameLower.startsWith(bLower + ',') || nameLower.includes(bLower)) {
      var cleanName = name.replace(new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
      cleanName = cleanName.replace(/^[-–,\s]+/, '').trim();
      return { brand: b, cleanName: cleanName };
    }
  }
  return { brand: '', cleanName: name };
}

// ── Tüm kaynaklardan verileri yükle ──
var allRaw = [];
var sourceCounts = {};

for (var s = 0; s < SOURCES.length; s++) {
  var src = SOURCES[s];
  var filePath = path.join(__dirname, src.file);
  if (!fs.existsSync(filePath)) {
    console.log('  ' + src.site + ': ' + src.file + ' bulunamadi, atlaniyor');
    sourceCounts[src.site] = 0;
    continue;
  }
  try {
    var data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data) || data.length === 0) {
      console.log('  ' + src.site + ': bos dosya, atlaniyor');
      sourceCounts[src.site] = 0;
      continue;
    }
    var tagged = data.map(function(p) {
      var brand = p.brand;
      var name = p.name;
      // Marka boşsa ürün adından çıkar
      if (!brand || brand.trim() === '') {
        var extracted = extractBrandFromName(name);
        brand = extracted.brand;
        if (brand) name = extracted.cleanName;
      }
      return Object.assign({}, p, {
        brand: brand,
        name: name,
        _site: src.site,
        category: normalizeCategoryName(p.category),
        categoryLabel: normalizeCategoryLabel(p.categoryLabel),
      });
    });
    allRaw = allRaw.concat(tagged);
    sourceCounts[src.site] = data.length;
    console.log('  ' + src.site + ': ' + data.length + ' urun yuklendi');
  } catch (err) {
    console.error('  ' + src.site + ': JSON parse hatasi - ' + err.message);
    sourceCounts[src.site] = 0;
  }
}

console.log('\nToplam ham veri: ' + allRaw.length + ' urun');

// ── Ürünleri eşleştir ve birleştir ──
var merged = [];
var used = {};

for (var i = 0; i < allRaw.length; i++) {
  if (used[i]) continue;
  used[i] = true;

  var base = allRaw[i];
  var baseBrand = normalizeBrand(base.brand);
  var baseName = normalizeNameForMatch(base.name, base.brand);
  var baseCore = coreProductName(base.name, base.brand);

  var prices = [{
    site: base._site,
    price: base.price,
    url: base.productUrl,
  }];

  // En iyi eşleşmeyi bul (her farklı satıcı için)
  var candidatesBySite = {};

  for (var j = i + 1; j < allRaw.length; j++) {
    if (used[j]) continue;
    var other = allRaw[j];
    if (other._site === base._site) continue;

    // Marka kontrolü — boş marka toleranslı
    var otherBrand = normalizeBrand(other.brand);
    var brandMatch = false;
    if (baseBrand && otherBrand) {
      brandMatch = (baseBrand === otherBrand);
    } else if (!baseBrand || !otherBrand) {
      // Marka boşsa isim içinde marka arayarak eşleştir
      brandMatch = true; // isim benzerliğine bırak
    }
    if (!brandMatch) continue;

    // Kategori kontrolü — aynı grup yeterli
    if (!categoryCompatible(base.category, other.category)) continue;

    var otherName = normalizeNameForMatch(other.name, other.brand);
    var otherCore = coreProductName(other.name, other.brand);

    // İki benzerlik skoru hesapla: tam isim ve temel isim
    var simFull = similarity(baseName, otherName);
    var simCore = similarity(baseCore, otherCore);
    var sim = Math.max(simFull, simCore);

    // Aynı kategori ise threshold düşük, farklı ama uyumlu kategori ise yüksek
    var threshold = (base.category === other.category) ? 0.28 : 0.45;
    if (sim < threshold) continue;

    // Bu satıcı için en iyi eşleşmeyi sakla
    var siteKey = other._site;
    if (!candidatesBySite[siteKey] || candidatesBySite[siteKey].sim < sim) {
      candidatesBySite[siteKey] = { idx: j, sim: sim, other: other };
    }
  }

  // En iyi eşleşmeleri ekle
  Object.keys(candidatesBySite).forEach(function(siteKey) {
    var cand = candidatesBySite[siteKey];
    used[cand.idx] = true;
    prices.push({
      site: cand.other._site,
      price: cand.other.price,
      url: cand.other.productUrl,
    });
  });

  // Aynı satıcıdan gelen duplicate fiyatları kaldır (en düşüğü tut)
  var uniquePrices = [];
  var seenSites = {};
  prices.sort(function(a, b) { return a.price - b.price; });
  for (var k = 0; k < prices.length; k++) {
    if (!seenSites[prices[k].site]) {
      seenSites[prices[k].site] = true;
      uniquePrices.push(prices[k]);
    }
  }
  prices = uniquePrices;

  merged.push(Object.assign({}, base, {
    prices: prices,
    _matchCount: prices.length,
  }));
}

console.log('Eslestirme sonucu: ' + merged.length + ' benzersiz urun (' + allRaw.length + ' ham veriden)');

// ── Final ürün listesini oluştur ──
var products = merged.map(function(p, i) {
  var rating = p.rating > 0 ? p.rating : fakeRating(p.prices[0].price);
  var reviews = p.reviews > 0 ? p.reviews : fakeReviews(p.prices[0].price);
  var name = cleanName(p.name, p.brand);

  return {
    id: i + 1,
    brand: p.brand,
    name: name,
    category: p.category,
    categoryLabel: p.categoryLabel,
    skinType: skinDefaults[p.category] || ['normal'],
    shades: [],
    prices: p.prices,
    rating: +parseFloat(rating).toFixed(1),
    reviews: Math.round(reviews),
    imageUrl: Array.isArray(p.imageUrl) ? (p.imageUrl[0] || '') : (p.imageUrl || ''),
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
    source: (p._site || p.source || 'unknown').toLowerCase(),
    priceCount: p.prices.length,
  };
});

// ── Dosyaya yaz ──
var siteCount = Object.keys(sourceCounts).filter(function(k) { return sourceCounts[k] > 0; }).length;
var multiPriceCount = products.filter(function(p) { return p.prices.length > 1; }).length;

var header = '// Beaute urun verisi — ' + products.length + ' urun, ' + siteCount + ' satici\n';
header += '// Otomatik uretildi: ' + new Date().toLocaleDateString('tr-TR') + '\n';
header += '// Coklu fiyat: ' + multiPriceCount + ' urunde birden fazla satici\n';
var js = header + 'const products = ' + JSON.stringify(products, null, 2) + ';\n';

fs.writeFileSync(OUTPUT, js, 'utf8');

// ── Özet ──
console.log('\n' + products.length + ' urun -> products-data.js');
console.log('Saticilar:');
Object.keys(sourceCounts).forEach(function(site) {
  var count = sourceCounts[site];
  console.log('   ' + (count > 0 ? 'OK' : 'ATLA') + ' ' + site + ': ' + count);
});
console.log('Coklu fiyat: ' + multiPriceCount + ' urunde');

var cats = {};
products.forEach(function(p) { cats[p.categoryLabel] = (cats[p.categoryLabel] || 0) + 1; });
console.log('Kategoriler:');
Object.keys(cats).sort(function(a,b) { return cats[b] - cats[a]; }).forEach(function(k) {
  console.log('   ' + k + ': ' + cats[k]);
});
