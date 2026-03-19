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

// ── Trendyol barkodlarını yükle (trendyol-barcode-enricher.js tarafından üretilir) ──
var trendyolBarcodes = {};
var TRENDYOL_BARCODES_FILE = path.join(__dirname, 'trendyol-barcodes.json');
if (fs.existsSync(TRENDYOL_BARCODES_FILE)) {
  trendyolBarcodes = JSON.parse(fs.readFileSync(TRENDYOL_BARCODES_FILE, 'utf8'));
  var bcCount = Object.values(trendyolBarcodes).filter(Boolean).length;
  console.log('Trendyol barkod yüklendi: ' + bcCount + ' barkod');
}

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

// ── Ürün adından kategori doğrula/düzelt ──
// Gratis gibi scraper'lar kategorileri karıştırabiliyor; isme bakarak düzeltiriz
var nameToCategoryRules = [
  // Göz kategorileri
  { keywords: ['maskara', 'mascara', 'rimel', 'kirpik', 'lash sensational', 'sky high', 'colossal', 'lash princess', 'bambi', 'lash blasté', 'they\'re real', 'bad gal', 'roller lash', 'fan fest'], cat: 'maskara' },
  { keywords: ['eyeliner', 'eye liner', 'dipliner', 'kajal liner', 'gel liner', 'liquid liner', 'waterproof liner', 'mat liner', 'otomatik jel', 'infaillible liner', 'precision liner'], cat: 'eyeliner' },
  { keywords: ['göz kalemi', 'goz kalemi', 'eye pencil', 'kohl pencil', 'kayal', 'kajal pencil'], cat: 'goz-kalemi' },
  { keywords: ['far paleti', 'palette', 'paleti', 'eyeshadow palette', 'shadow palette'], cat: 'far-paleti' },
  { keywords: ['göz farı', 'goz fari', 'eye shadow', 'eyeshadow', 'far ', ' far', 'stick far', 'shimmer shadow'], cat: 'far' },
  // Yüz kategorileri
  { keywords: ['fondöten', 'fondoten', 'foundation', 'fond\\s', 'skin glow foundation', 'skin foundation', 'fluid foundation', 'cushion'], cat: 'fondoten' },
  { keywords: ['kapatıcı', 'kapatici', 'concealer', 'conceal', 'touch eclat', 'corrector'], cat: 'kapatici' },
  { keywords: ['allık', 'allik', 'blush', 'rouge joue'], cat: 'allik' },
  { keywords: ['aydınlatıcı', 'aydinlatici', 'highlighter', 'illuminator', 'strobing', 'glow'], cat: 'aydinlatici' },
  { keywords: ['bronzer', 'bronz', 'terracotta'], cat: 'bronzer' },
  { keywords: ['kontür', 'kontur', 'contour', 'sculpt'], cat: 'kontur' },
  { keywords: ['pudra', 'powder', 'loose powder', 'fixing powder', 'toz pudra', 'compact powder'], cat: 'pudra' },
  { keywords: ['primer', 'makyaj bazı', 'makeup base', 'pore filler', 'sabitleyici', 'setting spray', 'baz '], cat: 'primer' },
  // Dudak kategorileri
  { keywords: ['ruj', 'lipstick', 'lip stick', 'likit mat ruj', 'lip cream', 'lip balm', 'lip color', 'rouge à lèvres'], cat: 'ruj' },
  { keywords: ['dudak parlatıcı', 'dudak parlatici', 'lip gloss', 'lipgloss', 'lip glaze', 'lip oil'], cat: 'dudak-parlatici' },
  { keywords: ['dudak kalemi', 'lip liner', 'lipliner', 'lip pencil'], cat: 'dudak-kalemi' },
  // Kaş
  { keywords: ['kaş', 'kas', 'brow', 'eyebrow', 'kaş kalemi', 'brow pencil', 'brow mascara', 'brow pomade'], cat: 'kas' },
];

function correctCategoryByName(productName, currentCategory) {
  var lower = (productName || '').toLowerCase();
  for (var i = 0; i < nameToCategoryRules.length; i++) {
    var rule = nameToCategoryRules[i];
    for (var k = 0; k < rule.keywords.length; k++) {
      if (lower.includes(rule.keywords[k])) {
        return rule.cat;
      }
    }
  }
  return currentCategory; // Kural bulunamadıysa orijinal kategoride bırak
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

// ── Kategori uyumluluğu — sadece çok yakın kategoriler eşleşebilir ──
// Önceki geniş grup mantığı yanlış eşleşmeye yol açıyordu (fondoten↔kapatici gibi)
var compatiblePairs = [
  ['eyeliner', 'goz-kalemi'],   // göz kalemi / eyeliner aynı şey
  ['far', 'far-paleti'],        // tek far / far paleti
  // Trendyol goz-kalemi/eyeliner ürünlerini bazen "far" kategorisinde listeler
  ['far', 'goz-kalemi'],        // Trendyol scraper kategori hatası için tolerans
  ['far', 'eyeliner'],          // Trendyol eyeliner'ları da "far" olarak gelebilir
];

function categoryCompatible(catA, catB) {
  if (catA === catB) return true;
  for (var i = 0; i < compatiblePairs.length; i++) {
    var pair = compatiblePairs[i];
    if ((pair[0] === catA && pair[1] === catB) || (pair[1] === catA && pair[0] === catB)) return true;
  }
  return false;
}

// ── Ürün ismi normalizasyonu (eşleştirme için) ──
function normalizeNameForMatch(name, brand) {
  var clean = (name || '').toLowerCase();
  // Trendyol sponsored/reklam ürün işareti kaldır
  clean = clean.replace(/^\*+/, '').trim();
  // Marka ismini ürün adından çıkar
  if (brand) {
    var brandLower = brand.toLowerCase();
    clean = clean.replace(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // Birleşik kelimeler
  clean = clean
    .replace(/\blip\s*stick/gi, 'lipstick')
    .replace(/\beye\s*liner/gi, 'eyeliner')
    .replace(/\beye\s*shadow/gi, 'eyeshadow')
    .replace(/\blip\s*gloss/gi, 'lipgloss')
    .replace(/\blip\s*liner/gi, 'lipliner')
    .replace(/\bblush[\s-]*on/gi, 'blush');
  clean = clean
    .replace(/[^a-z0-9\sğüşıöçâîû]/g, '')
    .replace(/\b(adet|ml|gr|spf|no|numara)\b/g, '')
    .replace(/\b\d{4,}/g, '')  // Barkodları sil
    .replace(/\s+/g, ' ')
    .trim();
  // Kozmetik terimleri normalize et
  clean = normalizeCosmeticWords(clean);
  return clean;
}

// ── Kozmetik terimlerini normalize et (TR↔EN yazım farklılıkları) ──
var cosmeticSynonyms = {
  'maskara': 'mascara', 'fondoten': 'foundation', 'fondöten': 'foundation',
  'ruj': 'lipstick', 'allık': 'blush', 'allik': 'blush',
  'aydınlatıcı': 'highlighter', 'aydinlatici': 'highlighter',
  'kapatıcı': 'concealer', 'kapatici': 'concealer',
  'kirpik': 'lash', 'dudak': 'lip', 'göz': 'eye', 'goz': 'eye',
  'kalemi': 'pencil', 'kalem': 'pencil',
  'hacim': 'volume', 'uzatıcı': 'lengthening', 'uzatici': 'lengthening',
  'parlak': 'glossy', 'mat': 'matte', 'kremsi': 'creamy',
  'suya': 'water', 'dayanıklı': 'resistant', 'dayanikli': 'resistant',
  'kıvrım': 'curl', 'kivrim': 'curl', 'kıvırma': 'curl',
  'nemlendirici': 'moisturizing', 'yaşlanma': 'anti-aging', 'yaslanma': 'anti-aging',
  'karşıtı': 'anti', 'karsiti': 'anti',
  'bakım': 'care', 'bakim': 'care',
  'fırınlanmış': 'baked', 'firinlanmis': 'baked',
  'ışıltılı': 'shimmery', 'isiltili': 'shimmery', 'işıltılı': 'shimmery',
  'likit': 'liquid', 'toz': 'powder', 'pudra': 'powder',
  'kalıcı': 'long-lasting', 'kalici': 'long-lasting',
  'doğal': 'natural', 'dogal': 'natural',
  'formüllü': 'formula', 'formullu': 'formula',
  'veren': 'giving', 'etkili': 'effect',
  'sınırsız': 'limitless', 'sinirsiz': 'limitless',
  'aşırı': 'extreme', 'asiri': 'extreme',
  'yoğun': 'intense', 'yogun': 'intense',
  'dolgunlaştırıcı': 'plumping', 'sabitleyici': 'setting',
  'sıkılaştırıcı': 'firming', 'buğulu': 'smoky',
  'kadifemsi': 'velvety', 'kadife': 'velvet',
  'takma': 'false', 'kompakt': 'compact',
  'paleti': 'palette', 'palet': 'palette',
  'farı': 'shadow', 'fari': 'shadow',
  'uzunluk': 'length', 'uzunluğu': 'length',
};

function normalizeCosmeticWords(text) {
  var words = text.split(' ');
  return words.map(function(w) {
    return cosmeticSynonyms[w] || w;
  }).join(' ');
}

// ── "Temel ürün adı" — renk/ton/numara bilgilerini çıkar ──
// Akakçe mantığı: aynı ürünün farklı renklerini TEK ürün olarak grupla
function coreProductName(name, brand) {
  var clean = (name || '').toLowerCase();
  if (brand) {
    var brandLower = brand.toLowerCase();
    clean = clean.replace(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // "Lip Stick" → "lipstick", "Eye Liner" → "eyeliner" vb. birleştir
  clean = clean
    .replace(/\blip\s*stick/gi, 'lipstick')
    .replace(/\beye\s*liner/gi, 'eyeliner')
    .replace(/\beye\s*shadow/gi, 'eyeshadow')
    .replace(/\blip\s*gloss/gi, 'lipgloss')
    .replace(/\blip\s*liner/gi, 'lipliner')
    .replace(/\bblush[\s-]*on/gi, 'blush');
  // Renk/ton kodlarını ve varyant bilgilerini çıkar
  clean = clean
    .replace(/[-–]\s*\d{1,3}\s+[a-z].*$/g, '')  // "- 130 Light Beige" kısmını sil
    .replace(/\b\d{2,3}\s+(light|dark|medium|soft|warm|cool|nude|beige|ivory|rose|golden|natural|honey|pure|sand|caramel|vanilla|cream|porcelain|tan|mocha|cocoa|toffee|amber|chestnut|mahogany|espresso|bronze|coral|pink|red|berry|plum|mauve|peach|apricot|cinnamon|sienna|almond|bisque|buff|linen|ecru|champagne|fawn|hazel|khaki|olive|sage|taupe|umber|wheat|bisque|burgundy|siyah|kahve|pembe|krem|bej|bal)\b.*/gi, '')
    .replace(/\b(0[0-9]{1,2}|[1-9][0-9]{1,2})\s+[A-Z][a-z]+/g, '')  // "130 Light" pattern
    .replace(/\bno[:\s]*\d+/gi, '')              // "No:25" → sil
    .replace(/\b\d+\s*(ml|gr|g|oz|adet|piece)\b/gi, '') // "30 ml", "1 adet" → sil
    .replace(/\badet\b/gi, '')                    // tek "adet" kelimesi de sil
    .replace(/\b\d{6,}/g, '')                     // Barkod numaraları (6+ digit) → sil
    // Genişletilmiş renk/ton isimleri (Türkçe + İngilizce + özel ton isimleri)
    .replace(/\b(siyah|kahverengi|bordo|pembe|kırmızı|turuncu|mor|mavi|yeşil|bej|nude|black|brown|blue|red|pink|pinky|coral|berry|burgundy|bordeaux|intense black|ekstra siyah|gaia|ivory|sand|honey|vanilla|rose|golden|porcelain|amber|bronze|hazel|olive|taupe|wheat|cocoa|mocha|toffee|caramel|bisque|peach|apricot|mauve|plum|sienna|cinnamon|espresso|mahogany|chestnut|champagne|linen|ecru|buff|fawn|khaki|sage|umber|cool|warm|light|dark|medium|deep|fair|natural|soft|true|pure|original|cherry|sunset|dusty|vintage|classic|timeless|innocent|rosy|daring|enchanted)\b/gi, '')
    // Özel ton isimleri (Flormar, Golden Rose vb.)
    .replace(/\b(baby girl|pinky nude|enchanted kiss|daring whisper|rosy lust|rosewood|creamy sand|honey glow|sunset coral|cherry blossom|dusty rose|go for|whisper|kiss|girl|poise|lust)\b/gi, '')
    .replace(/\b[0-9]{1,3}\s*$/g, '')             // Sondaki sayılar → sil
    .replace(/\b\d{1,3}\b/g, '')                   // Tüm 1-3 haneli sayıları sil
    .replace(/[^a-z0-9\sğüşıöçâîû]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Kozmetik terimlerini normalize et
  clean = normalizeCosmeticWords(clean);
  // İlk 8 anlamlı kelimeyi tut (daha fazla bilgi koru)
  var words = clean.split(' ').filter(function(w) { return w.length > 1; });
  return words.slice(0, 8).join(' ');
}

// ── Ürün seri adını çıkar (matching için en önemli bilgi) ──
// "Perfect Coverage", "Volume Up", "Longer Than Ever" gibi ürün seri isimleri
function extractProductLine(name, brand) {
  var clean = (name || '').toLowerCase();
  if (brand) {
    var brandLower = brand.toLowerCase();
    clean = clean.replace(new RegExp(brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // Barkod, renk, numara vs temizle
  clean = clean
    .replace(/\b\d{6,}/g, '')
    .replace(/\bno[:\s]*\d+/gi, '')
    .replace(/\b\d+\s*(ml|gr|g|oz|adet)\b/gi, '')
    .replace(/[-–]\s*\d{1,3}\s+\w+.*$/g, '')
    .replace(/\b(siyah|kahverengi|bordo|pembe|kırmızı|turuncu|mor|mavi|yeşil|bej|nude|black|brown|blue|red|pink|coral|berry|burgundy)\b/gi, '')
    .replace(/\b[0-9]{1,3}\s*$/g, '')
    .replace(/[^a-z0-9\sğüşıöçâîû]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Bilinen product line isimleri (case-insensitive match)
  var knownLines = [
    // Flormar
    'perfect coverage', 'skin lifting', 'volume up', 'longer than ever',
    'spider lash', 'hero volume', 'false lash', 'sheer up',
    'cc cream', 'invisible cover', 'extreme tattoo', 'baked blush',
    'stay perfect', 'mood booster', 'waterproof eyeliner', 'waterproof lipliner',
    'midnight matte', 'smoky eyes', 'brow up', 'precious curl',
    'triple action', 'open up', 'big n bold', 'carefull volume',
    'set n go', 'setn go', 'lightweight lip powder', 'water lip stain',
    'shine kiss', 'creamy stylo', 'puffy liquid',
    // Golden Rose
    'hd foundation', 'moisture touch', 'matte perfection', 'total cover',
    'dream eyes', 'velvet matte', 'soft color', 'smart glow',
    'strobing', 'dipliner', 'longstay liquid matte',
    // Maybelline
    'super stay', 'superstay', 'fit me', 'instant age rewind',
    'lash sensational', 'colossal', 'curl bounce', 'sky high',
    'master chrome', 'color sensational', 'vinyl ink',
    'eraser eye', 'the falsies',
    // L'Oreal
    'infallible', 'true match', 'telescopic', 'paradise',
    'bambi eye', 'color riche', 'age perfect', 'mega volume',
    // Estee Lauder
    'double wear', 'even better', 'beyond perfecting',
    // MAC
    'studio fix', 'prep prime', 'retro matte',
    // Too Faced
    'better than sex', 'damn girl', 'born this way',
    // Essence
    'lash princess', 'pure nude', 'longlasting eye pencil',
    'hello good stuff', 'skin tint',
    // Catrice
    'hd liquid coverage', 'one drop coverage', 'glam and doll',
    // NYX
    'lip lingerie', 'soft matte', 'butter gloss',
    'born to glow', 'wonder stick', 'cant stop',
    // Note
    'detox protect', 'mattemoist', 'long wearing', 'ultra rich',
    'conceal protect', 'mineral', 'icon',
    // Misc luxury
    'luminous silk', 'power fabric', 'neo nude',
    'touche eclat', 'all hours', 'tatouage couture',
    'forever skin', 'backstage', 'addict',
    'rouge dior', 'diorshow', 'diorskin',
    // Pastel
    'show your', 'profashion', 'magic khol',
    // Revolution
    'conceal and define', 'skin silk',
    // Rimmel
    'stay matte', 'lasting finish', 'the only one',
    // Benefit
    'precisely my brow', 'gimme brow', 'fan fest', 'bad gal',
    'hoola', 'roller lash', 'cookie', 'dandelion', 'cheeky',
    'boi ing', 'real magnet', 'they re real', 'watt s up',
    // Charlotte Tilbury
    'pillow talk', 'airbrush flawless', 'magic away',
    'beautiful skin', 'flawless filter', 'magic powder',
    // Rare Beauty
    'positive light', 'liquid touch', 'soft pinch', 'stay vulnerable',
    'find comfort', 'kind words', 'with gratitude',
    // NARS
    'natural radiant', 'sheer glow', 'radiant creamy', 'soft matte complete',
    'orgasm', 'laguna', 'blush',
    // Urban Decay
    'all nighter', 'naked', 'original', 'honey', 'vice',
    // Fenty Beauty
    'pro filtr', 'eaze drop', 'match stix', 'killawatt', 'gloss bomb',
    // Lancôme / Lancome
    'teint idole', 'miracle blur', 'hypnose', 'monsieur big',
    'juicy tubes', 'absolu', 'maxi',
    // Giorgio Armani
    'luminous silk', 'designer lift', 'lip maestro',
    // Misc
    'air volume', 'mega length',
    'color elixir', 'rouge velvet',
    'brow this way',
    // Essence / Catrice ekstra
    'i love extreme', 'i love crazy', 'lash like wow', 'contouring',
    'all about matt', 'sun glow',
  ];
  for (var i = 0; i < knownLines.length; i++) {
    if (clean.includes(knownLines[i])) return knownLines[i];
  }
  return '';
}

// ── Jenerik kozmetik terimleri (bunlar ürün ayırt edici değil) ──
var genericCosmeticWords = new Set([
  'mascara', 'lipstick', 'foundation', 'blush', 'eyeliner', 'eyeshadow',
  'concealer', 'highlighter', 'powder', 'primer', 'bronzer', 'contour',
  'pencil', 'lash', 'lip', 'eye', 'volume', 'matte', 'glossy', 'liquid',
  'cream', 'gel', 'stick', 'baked', 'compact', 'pressed',
  'moisturizing', 'natural', 'effect', 'giving', 'formula',
  'waterproof', 'long-lasting', 'creamy', 'shimmer', 'shimmery',
  'yüksek', 'pigmentli', 'bitişli', 'yapılı', 'dokulu',
  'suya', 'resistant', 'anti', 'care', 'spf', 'spf15', 'spf20', 'spf30',
]);

// ── Ton/model kodu çıkar (örn: "1N", "120", "W3", "01") ──
// Bu kodlar kozmetik ürünlerde renk/tonu tanımlar — eşleştirme için kritik
function extractShadeCode(name, brand) {
  var clean = (name || '').toLowerCase();
  if (brand) {
    clean = clean.replace(new RegExp(brand.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  // SPF, ml, gr gibi kelimeleri sil
  clean = clean.replace(/\bspf\s*\d+/gi, '').replace(/\b\d+\s*(ml|gr|g|oz)\b/gi, '');

  var codes = [];
  // Örüntüler: "1N", "120", "N120", "1.5N", "W3", "01", "3W", "125C" vb.
  var matches = clean.match(/\b([a-z]{0,2}\d{1,3}[a-z]{0,2})\b/g);
  if (matches) {
    matches.forEach(function(m) {
      // Sadece rakam içerenleri al, en az 1 rakam olmalı, max 5 karakter
      if (/\d/.test(m) && m.length <= 5 && m.length >= 1) {
        // Anlamsız sayıları filtrele (çok uzun = barkod, ml, yıl vb. zaten silindi)
        codes.push(m.toUpperCase());
      }
    });
  }
  return codes;
}

// ── Bigram çıkar (2-kelimelik diziler) ──
function extractBigrams(text) {
  var words = text.split(' ').filter(function(w) { return w.length > 1; });
  var bigrams = [];
  for (var i = 0; i < words.length - 1; i++) {
    // En az bir kelime jenerik olmasın (ikisi de jenerikse ayırt edici değil)
    if (!genericCosmeticWords.has(words[i]) || !genericCosmeticWords.has(words[i+1])) {
      bigrams.push(words[i] + ' ' + words[i+1]);
    }
  }
  return bigrams;
}

// ── İsim benzerliği (jenerik kelimeleri dışlayan, anlamlı kelime odaklı) ──
function similarity(a, b) {
  var wordsA = a.split(' ').filter(function(w) { return w.length > 1; });
  var wordsB = b.split(' ').filter(function(w) { return w.length > 1; });
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  // Jenerik olmayan (ayırt edici) kelimeleri bul
  var sigA = wordsA.filter(function(w) { return !genericCosmeticWords.has(cosmeticSynonyms[w] || w); });
  var sigB = wordsB.filter(function(w) { return !genericCosmeticWords.has(cosmeticSynonyms[w] || w); });

  // Eğer anlamlı kelime yoksa tam kelime listesiyle devam et
  if (sigA.length === 0) sigA = wordsA;
  if (sigB.length === 0) sigB = wordsB;

  var setA = new Set(sigA.map(function(w) { return cosmeticSynonyms[w] || w; }));
  var setB = new Set(sigB.map(function(w) { return cosmeticSynonyms[w] || w; }));

  var intersection = 0;
  setA.forEach(function(w) { if (setB.has(w)) intersection++; });
  var union = new Set();
  setA.forEach(function(w) { union.add(w); });
  setB.forEach(function(w) { union.add(w); });

  var jaccard = union.size > 0 ? intersection / union.size : 0;

  // Contained ratio: ortak anlamlı kelime / kısa taraftaki anlamlı kelime sayısı
  var minSize = Math.min(setA.size, setB.size);
  var containedRatio = minSize > 0 ? intersection / minSize : 0;

  // Bigram match: anlamlı bigram dizileri
  var bigramsA = extractBigrams(sigA.join(' '));
  var bigramsB = extractBigrams(sigB.join(' '));
  var bigramMatch = 0;
  if (bigramsA.length > 0 && bigramsB.length > 0) {
    var setBiB = new Set(bigramsB);
    var commonBigrams = 0;
    bigramsA.forEach(function(bg) { if (setBiB.has(bg)) commonBigrams++; });
    // Bigram eşleşmesi: daha muhafazakâr puanlama
    if (commonBigrams >= 2) bigramMatch = 0.85;
    else if (commonBigrams === 1) bigramMatch = 0.72;
  }

  return Math.max(jaccard, containedRatio * 0.90, bigramMatch);
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
      // Trendyol sponsored ürün işaretlerini temizle (* prefix)
      if (name && name.startsWith('*')) name = name.replace(/^\*+/, '').trim();
      // Marka boşsa ürün adından çıkar
      if (!brand || brand.trim() === '') {
        var extracted = extractBrandFromName(name);
        brand = extracted.brand;
        if (brand) name = extracted.cleanName;
      }
      // Kategori düzeltmesi: ürün adına bakarak yanlış kategorileri düzelt
      var correctedCat = normalizeCategoryName(p.category);
      correctedCat = correctCategoryByName(p.name, correctedCat);
      // Trendyol ürünleri için barkod ekle (trendyol-barcodes.json'dan)
      var barcode = p.barcode || '';
      if (src.site === 'Trendyol' && p.id && trendyolBarcodes[p.id]) {
        barcode = trendyolBarcodes[p.id];
      }
      return Object.assign({}, p, {
        brand: brand,
        name: name,
        _site: src.site,
        category: correctedCat,
        categoryLabel: normalizeCategoryLabel(p.categoryLabel),
        barcode: barcode,
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

// ── Kalite filtresi: hatalı verileri temizle ──
var beforeFilter = allRaw.length;
allRaw = allRaw.filter(function(p) {
  // 1. Fiyat 5 TL altı (0 TL dahil) hatalı scrape
  if (p.price < 5) return false;
  // 2. Kategori sayfası başlıkları (ürün değil)
  if ((p.name || '').match(/\b(renkleri ve|markaları|fiyatları)\s+\d{4}\b/i)) return false;
  // 3. "Set", "Hediye Set" gibi çoklu ürün paketleri
  if ((p.name || '').match(/\bhediye set\b/i)) return false;
  // 4. İsmi çok kısa (5 char altı) veya boş
  if (!p.name || p.name.trim().length < 5) return false;
  return true;
});
console.log('Kalite filtresi: ' + beforeFilter + ' -> ' + allRaw.length + ' (' + (beforeFilter - allRaw.length) + ' hatali veri cikarildi)');

// ══════════════════════════════════════════════════
// ADIM 1: Aynı site içinde varyantları grupla (Akakçe ProductGroup mantığı)
// Aynı marka + aynı kategori + aynı core isim → TEK ürün
// ══════════════════════════════════════════════════
var siteGroups = {};  // site -> { groupKey -> [products] }
allRaw.forEach(function(p) {
  if (!siteGroups[p._site]) siteGroups[p._site] = {};
  var brand = normalizeBrand(p.brand);
  var core = coreProductName(p.name, p.brand);
  var cat = p.category;
  var groupKey = brand + '|' + cat + '|' + core;
  if (!siteGroups[p._site][groupKey]) siteGroups[p._site][groupKey] = [];
  siteGroups[p._site][groupKey].push(p);
});

// Her grup için tek temsili ürün seç (en düşük fiyatlı veya en çok review'lı)
var deduped = [];
var variantStats = { totalGroups: 0, totalProducts: 0, mergedAway: 0 };
Object.keys(siteGroups).forEach(function(site) {
  var groups = siteGroups[site];
  Object.keys(groups).forEach(function(key) {
    var group = groups[key];
    variantStats.totalGroups++;
    variantStats.totalProducts += group.length;
    if (group.length > 1) variantStats.mergedAway += group.length - 1;
    // En düşük fiyatlı olanı temsili seç (0 TL olanları atla)
    group.sort(function(a, b) {
      var pa = a.price > 0 ? a.price : 999999;
      var pb = b.price > 0 ? b.price : 999999;
      return pa - pb;
    });
    var rep = group[0];
    // Varyant bilgilerini sakla
    rep._variantCount = group.length;
    rep._variants = group.map(function(v) { return { name: v.name, price: v.price, url: v.productUrl }; });
    // Min/max fiyat
    var validPrices = group.filter(function(v) { return v.price > 0; }).map(function(v) { return v.price; });
    if (validPrices.length > 0) {
      rep._minPrice = Math.min.apply(null, validPrices);
      rep._maxPrice = Math.max.apply(null, validPrices);
    }
    deduped.push(rep);
  });
});

console.log('Varyant gruplama: ' + variantStats.totalProducts + ' urun -> ' + deduped.length + ' grup (' + variantStats.mergedAway + ' varyant birlestirildi)');

// ══════════════════════════════════════════════════════════════════
// ADIM 2: Siteler arası eşleştirme — PROFESYONEL YÖNTEM
// Adım 2a: Barkod eşleştirme (EAN/GTIN — %100 doğru)
// Adım 2b: Marka + Ürün Serisi + Ton Kodu eşleştirme (çok sıkı)
// ══════════════════════════════════════════════════════════════════

// Ön hesaplama: her ürün için normalize isim, core, line, shade, barcode bilgilerini hesapla
var precomputed = deduped.map(function(p) {
  return {
    brand: normalizeBrand(p.brand),
    name: normalizeNameForMatch(p.name, p.brand),
    core: coreProductName(p.name, p.brand),
    line: extractProductLine(p.name, p.brand),
    shades: extractShadeCode(p.name, p.brand),
    barcode: (p.barcode || '').trim(),
  };
});

// ── 2a: Barkod indeksi oluştur (barcode → [idx...]) ──
var barcodeIndex = {};
precomputed.forEach(function(pp, idx) {
  if (pp.barcode && pp.barcode.length >= 8) {
    if (!barcodeIndex[pp.barcode]) barcodeIndex[pp.barcode] = [];
    barcodeIndex[pp.barcode].push(idx);
  }
});

var barcodeMatchCount = 0;
var merged = [];
var used = new Set();

// ── 2a: Önce barkod eşleşmelerini işle (kesin eşleşme) ──
Object.keys(barcodeIndex).forEach(function(barcode) {
  var indices = barcodeIndex[barcode];
  if (indices.length < 2) return; // Tek satıcıda varsa sadece, atla

  // Farklı satıcıları birleştir
  var bySite = {};
  indices.forEach(function(idx) {
    var p = deduped[idx];
    var site = p._site;
    if (!bySite[site] || p.price < bySite[site].price) {
      bySite[site] = { idx: idx, p: p };
    }
  });

  var sites = Object.keys(bySite);
  if (sites.length < 2) return; // Aynı sitede birden fazla, atla

  // Tüm indexleri kullanıldı olarak işaretle
  var baseEntry = bySite[sites[0]];
  var base = baseEntry.p;
  used.add(baseEntry.idx);

  var prices = [{
    site: base._site,
    price: base.price > 0 ? base.price : (base._minPrice || 0),
    url: base.productUrl,
    variantCount: base._variantCount || 1,
    imageUrl: Array.isArray(base.imageUrl) ? (base.imageUrl[0] || '') : (base.imageUrl || ''),
  }];

  for (var s = 1; s < sites.length; s++) {
    var entry = bySite[sites[s]];
    used.add(entry.idx);
    prices.push({
      site: entry.p._site,
      price: entry.p.price > 0 ? entry.p.price : (entry.p._minPrice || 0),
      url: entry.p.productUrl,
      variantCount: entry.p._variantCount || 1,
      imageUrl: Array.isArray(entry.p.imageUrl) ? (entry.p.imageUrl[0] || '') : (entry.p.imageUrl || ''),
    });
    barcodeMatchCount++;
  }

  // Uçurum fiyatlı (dropshipper) satıcıları filtrele (en düşük fiyatın 3 katından pahalıysa çıkar)
  if (prices.length >= 2) {
    prices.sort(function(a, b) { return a.price - b.price; });
    var validPrices = [prices[0]];
    for (var k = 1; k < prices.length; k++) {
      if (prices[k].price / prices[0].price <= 3) validPrices.push(prices[k]);
    }
    prices = validPrices;
  }

  merged.push(Object.assign({}, base, { prices: prices, _matchCount: prices.length, _matchMethod: 'barcode' }));
});

console.log('Barkod eslestirme: ' + barcodeMatchCount + ' ek satici eslestirmesi yapildi');

// ── 2b: Geri kalan ürünler için isim tabanlı eşleştirme (sıkı) ──
// EŞLEŞTİRME KURALLARI:
// 1. Aynı marka (zorunlu)
// 2. Aynı kategori (çapraz kategori sadece çok yakın çiftler: eyeliner↔goz-kalemi, far↔far-paleti)
// 3. Ürün serisi eşleşmeli (ikisi de seri içeriyorsa)
// 4. Ton kodu eşleşmeli (ikisi de ton kodu içeriyorsa — en kritik kural)
// 5. Minimum %50 isim benzerliği
var namingMatchCount = 0;

for (var i = 0; i < deduped.length; i++) {
  if (used.has(i)) continue;
  used.add(i);

  var base = deduped[i];
  var bp = precomputed[i];

  var prices = [{
    site: base._site,
    price: base.price > 0 ? base.price : (base._minPrice || 0),
    url: base.productUrl,
    variantCount: base._variantCount || 1,
    imageUrl: Array.isArray(base.imageUrl) ? (base.imageUrl[0] || '') : (base.imageUrl || ''),
  }];

  // En iyi eşleşmeyi her satıcı için bul
  var candidatesBySite = {};

  for (var j = i + 1; j < deduped.length; j++) {
    if (used.has(j)) continue;
    var other = deduped[j];
    if (other._site === base._site) continue;

    var op = precomputed[j];

    // ── KURAL 1: Marka kontrolü (zorunlu) ──
    if (!bp.brand || !op.brand) continue; // Markasız ürünleri eşleştirme
    if (bp.brand !== op.brand) continue;

    // ── KURAL 2: Kategori kontrolü (sadece aynı veya çok yakın) ──
    if (!categoryCompatible(base.category, other.category)) continue;

    // ── KURAL 3: Ürün serisi kontrolü ──
    // İkisi de bilinen ürün serisi içeriyorsa, seriler eşleşmeli
    if (bp.line && op.line && bp.line !== op.line) continue;

    // ── KURAL 4: TON KODU KONTROLÜ (en kritik kural) ──
    // Her iki üründe de ton kodu varsa, en az bir kodu ortak olmalı
    if (bp.shades.length > 0 && op.shades.length > 0) {
      var shadeMatch = false;
      for (var si = 0; si < bp.shades.length; si++) {
        if (op.shades.indexOf(bp.shades[si]) !== -1) { shadeMatch = true; break; }
      }
      if (!shadeMatch) continue; // Farklı ton kodu → kesinlikle farklı ürün
    }

    // ── KURAL 5: İsim benzerliği (minimum %50) ──
    var simFull = similarity(bp.name, op.name);
    var simCore = similarity(bp.core, op.core);
    var exactCore = (bp.core.length > 5 && bp.core === op.core) ? 1.0 : 0;
    var lineBonus = (bp.line && op.line && bp.line === op.line) ? 0.85 : 0;
    var sim = Math.max(simFull, simCore, exactCore, lineBonus);

    // Threshold: aynı kategori %50, uyumlu (farklı ama yakın) %65
    var threshold = (base.category === other.category) ? 0.50 : 0.65;
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
    used.add(cand.idx);
    prices.push({
      site: cand.other._site,
      price: cand.other.price > 0 ? cand.other.price : (cand.other._minPrice || 0),
      url: cand.other.productUrl,
      variantCount: cand.other._variantCount || 1,
      imageUrl: Array.isArray(cand.other.imageUrl) ? (cand.other.imageUrl[0] || '') : (cand.other.imageUrl || ''),
    });
    namingMatchCount++;
  });

  // 0 TL fiyatları temizle
  prices = prices.filter(function(p) { return p.price > 0; });
  if (prices.length === 0) {
    prices = [{ site: base._site, price: 0, url: base.productUrl, variantCount: 1 }];
  }

  // Fiyat uçurum kontrolü: Çok pahalı satıcıları (3x) hatalı eşleşme say, en iyi fiyatları tut
  if (prices.length >= 2) {
    prices.sort(function(a, b) { return a.price - b.price; });
    var validPrices = [prices[0]];
    for (var k = 1; k < prices.length; k++) {
      if (prices[k].price / prices[0].price <= 3) validPrices.push(prices[k]);
    }
    prices = validPrices;
  }

  // Aynı satıcıdan duplicate fiyatları kaldır (en düşüğü tut)
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
    _matchMethod: 'name',
  }));
}

console.log('Isim tabanlı eslestirme: ' + namingMatchCount + ' ek satici eslestirmesi yapildi');
console.log('Eslestirme sonucu: ' + merged.length + ' benzersiz urun (' + allRaw.length + ' ham veriden)');

// ── Final ürün listesini oluştur ──
// Görsel kaynak önceliği: Sephora > Trendyol > Gratis > Watsons > Rossmann
var IMAGE_PRIORITY = ['Sephora', 'Trendyol', 'Gratis', 'Watsons', 'Rossmann'];

var products = merged.map(function(p, i) {
  var rating = p.rating > 0 ? p.rating : fakeRating(p.prices[0].price);
  var reviews = p.reviews > 0 ? p.reviews : fakeReviews(p.prices[0].price);
  var name = cleanName(p.name, p.brand);

  // En kaliteli görseli seç: kaynak önceliğine göre ve çalışmayan görselleri ele
  var bestImage = '';
  for (var ip = 0; ip < IMAGE_PRIORITY.length; ip++) {
    var imgSite = IMAGE_PRIORITY[ip];
    // Önce base ürünün kendi görselini kontrol et
    if (p._site === imgSite) {
      bestImage = Array.isArray(p.imageUrl) ? (p.imageUrl[0] || '') : (p.imageUrl || '');
      if (bestImage && !bestImage.includes('data:image') && !bestImage.includes('placeholder')) break;
      bestImage = ''; // Eğer sadece placeholder varsa boşaltıp aramaya devam et
    }
    // Sonra eşleşen ürünlerin görsellerini kontrol et
    var priceEntry = p.prices.find(function(pr) { return pr.site === imgSite && pr.imageUrl; });
    if (priceEntry && priceEntry.imageUrl && !priceEntry.imageUrl.includes('data:image') && !priceEntry.imageUrl.includes('placeholder')) {
      bestImage = priceEntry.imageUrl; break;
    }
  }
  if (!bestImage) bestImage = Array.isArray(p.imageUrl) ? (p.imageUrl[0] || '') : (p.imageUrl || '');

  // prices array'den imageUrl'yi temizle (final data'da gereksiz)
  var cleanPrices = p.prices.map(function(pr) {
    return { site: pr.site, price: pr.price, url: pr.url, variantCount: pr.variantCount };
  });

  return {
    id: i + 1,
    brand: p.brand,
    name: name,
    category: p.category,
    categoryLabel: p.categoryLabel,
    skinType: skinDefaults[p.category] || ['normal'],
    shades: [],
    prices: cleanPrices,
    rating: +parseFloat(rating).toFixed(1),
    reviews: Math.round(reviews),
    imageUrl: bestImage,
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
