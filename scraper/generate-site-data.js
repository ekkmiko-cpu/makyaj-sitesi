/**
 * Çoklu Satıcı → Site products-data.js dönüştürücü
 * Tüm satıcı JSON dosyalarını birleştirir, aynı ürünleri eşleştirir
 * Çalıştır: node generate-site-data.js
 */

const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'products-data.js');

// ── Bilinen Muadiller (Dupes) ──
const KNOWN_DUPES = [
  { highEnd: { brand: 'CHARLOTTE TILBURY', keyword: 'flawless filter' }, dupe: { brand: 'E.L.F.', keyword: 'halo glow' } },
  { highEnd: { brand: 'DIOR', keyword: 'lip glow oil' }, dupe: { brand: 'NYX', keyword: 'fat oil' } },
  { highEnd: { brand: 'ESTEE LAUDER', keyword: 'double wear' }, dupe: { brand: 'MAYBELLINE', keyword: 'super stay' } },
  { highEnd: { brand: 'NARS', keyword: 'radiant creamy' }, dupe: { brand: 'MAYBELLINE', keyword: 'fit me' } },
  { highEnd: { brand: 'FENTY BEAUTY', keyword: 'gloss bomb' }, dupe: { brand: 'MAYBELLINE', keyword: 'lifter gloss' } },
  { highEnd: { brand: 'CLINIQUE', keyword: 'black honey' }, dupe: { brand: 'E.L.F.', keyword: 'black cherry' } },
  { highEnd: { brand: 'TARTE', keyword: 'shape tape' }, dupe: { brand: 'LOREAL PARIS', keyword: 'infallible' } }
];

// ── Satıcı dosyaları ──
const SOURCES = [
  { file: 'sephora-products.json',      site: 'Sephora'      },
  { file: 'trendyol-products.json',     site: 'Trendyol'     },
  { file: 'gratis-products.json',       site: 'Gratis'       },
  { file: 'watsons-products.json',      site: 'Watsons'      },
  { file: 'rossmann-products.json',     site: 'Rossmann'     },
  { file: 'yvesrocher-products.json',   site: 'YvesRocher'   },
  { file: 'hepsiburada-products.json',  site: 'Hepsiburada'  },
  { file: 'amazon-products.json',      site: 'Amazon'       },
  { file: 'idefix-products.json',      site: 'Idefix'       },
  { file: 'pazarama-products.json',    site: 'Pazarama'     },
  { file: 'pttavm-products.json',      site: 'PttAvm'       },
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
  // ── Yeni kategoriler (Akakce uyumu) ───────────────────────────────────────
  'dipliner':           ['yagli', 'karma'],
  'kas-kalemi':         ['normal', 'karma'],
  'kas-fari':           ['normal', 'kuru', 'karma'],
  'kas-sabitleyici':    ['yagli', 'karma'],
  'bb-cc-krem':         ['normal', 'kuru', 'karma'],
  'makyaj-sabitleyici': ['yagli', 'karma'],
  'makyaj-seti':        ['normal', 'kuru', 'karma', 'yagli'],
  'vucut-simi':         ['normal', 'kuru', 'karma'],
  // Cilt & Vücut Bakımı
  nemlendirici:      ['kuru', 'normal', 'karma'],
  serum:             ['normal', 'kuru', 'karma', 'yagli'],
  'gunes-koruyucu':  ['normal', 'kuru', 'karma', 'yagli', 'hassas'],
  'cilt-temizleme':  ['normal', 'karma', 'yagli'],
  tonik:             ['normal', 'karma', 'yagli'],
  'goz-kremi':       ['kuru', 'normal'],
  'cilt-maskesi':    ['normal', 'kuru', 'karma'],
  peeling:           ['normal', 'karma', 'yagli'],
  'dus-jeli':        ['normal', 'kuru', 'karma'],
  'vucut-losyonu':   ['kuru', 'normal'],
  parfum:            ['normal', 'kuru', 'karma'],
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
  // ── Yeni kategoriler (Akakce uyumu) ───────────────────────────────────────
  'Dipliner': 'Dipliner',
  'Kas Kalemi': 'Kaş Kalemi',
  'Kaş Kalemi': 'Kaş Kalemi',
  'Kas Fari': 'Kaş Farı',
  'Kaş Farı': 'Kaş Farı',
  'Kas Sabitleyici': 'Kaş Sabitleyici',
  'Kaş Sabitleyici': 'Kaş Sabitleyici',
  'BB CC Krem': 'BB & CC Krem',
  'BB & CC Krem': 'BB & CC Krem',
  'Makyaj Sabitleyici': 'Makyaj Sabitleyici',
  'Makyaj Seti': 'Makyaj Seti',
  'Vucut Simi': 'Vücut Simi',
  'Vücut Simi': 'Vücut Simi',
  // Cilt & Vücut Bakımı
  'Nemlendirici': 'Nemlendirici',
  'Serum': 'Serum',
  'Gunes Koruyucu': 'Güneş Koruyucu',
  'Güneş Koruyucu': 'Güneş Koruyucu',
  'Cilt Temizleme': 'Cilt Temizleme',
  'Tonik': 'Tonik',
  'Goz Kremi': 'Göz Kremi',
  'Göz Kremi': 'Göz Kremi',
  'Cilt Maskesi': 'Cilt Maskesi',
  'Peeling': 'Peeling',
  'Dus Jeli': 'Duş Jeli',
  'Duş Jeli': 'Duş Jeli',
  'Vucut Losyonu': 'Vücut Losyonu',
  'Vücut Losyonu': 'Vücut Losyonu',
  'Vücut Bakımı': 'Vücut Bakımı',
  'Parfüm': 'Parfüm',
  'Parfum': 'Parfüm',
};

function normalizeCategoryLabel(label) {
  return categoryLabelMap[label] || label;
}

// ── Kategori slug → label haritası (correctCategoryByName sonrası label güncellemesi için) ──
var categorySlugToLabel = {
  'fondoten': 'Fondöten', 'maskara': 'Maskara', 'ruj': 'Ruj', 'far': 'Göz Farı',
  'far-paleti': 'Far Paleti', 'eyeliner': 'Eyeliner', 'goz-kalemi': 'Göz Kalemi',
  'allik': 'Allık', 'aydinlatici': 'Aydınlatıcı', 'bronzer': 'Bronzer', 'kontur': 'Kontür',
  'kapatici': 'Kapatıcı', 'primer': 'Primer', 'pudra': 'Pudra',
  'dudak-parlatici': 'Dudak Parlatıcı', 'dudak-kalemi': 'Dudak Kalemi',
  'kas': 'Kaş Makyajı', 'dipliner': 'Dipliner', 'kas-kalemi': 'Kaş Kalemi',
  'kas-fari': 'Kaş Farı', 'kas-sabitleyici': 'Kaş Sabitleyici',
  'bb-cc-krem': 'BB & CC Krem', 'makyaj-sabitleyici': 'Makyaj Sabitleyici',
  'makyaj-seti': 'Makyaj Seti', 'vucut-simi': 'Vücut Simi',
  'nemlendirici': 'Nemlendirici', 'vucut-losyonu': 'Vücut Bakımı',
  'parfum': 'Parfüm', 'goz-kremi': 'Göz Kremi',
};

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
  // ── Yeni kategoriler (Akakce uyumu) ───────────────────────────────────────
  'dipliner': 'dipliner',
  'kas-kalemi': 'kas-kalemi',
  'kas-fari': 'kas-fari',
  'kas-sabitleyici': 'kas-sabitleyici',
  'bb-cc-krem': 'bb-cc-krem',
  'makyaj-sabitleyici': 'makyaj-sabitleyici',
  'makyaj-seti': 'makyaj-seti',
  'vucut-simi': 'vucut-simi',
};

function normalizeCategoryName(name) {
  return categoryNameMap[name] || name;
}

// ── Ürün adından kategori doğrula/düzelt ──
// Gratis gibi scraper'lar kategorileri karıştırabiliyor; isme bakarak düzeltiriz
var nameToCategoryRules = [
  // Göz kategorileri
  { keywords: ['maskara', 'mascara', 'rimel', 'kirpik', 'lash sensational', 'sky high', 'colossal', 'lash princess', 'bambi', 'lash blasté', 'they\'re real', 'bad gal', 'roller lash', 'fan fest'], cat: 'maskara' },
  // dipliner önce gelsin (eyeliner'dan daha spesifik)
  { keywords: ['dipliner', 'dip liner', 'likit eyeliner', 'liquid liner', 'likit liner'], cat: 'dipliner' },
  { keywords: ['eyeliner', 'eye liner', 'kajal liner', 'gel liner', 'waterproof liner', 'mat liner', 'otomatik jel', 'infaillible liner', 'precision liner'], cat: 'eyeliner' },
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
  // bb/cc krem primer'dan önce gelsin
  { keywords: ['bb krem', 'bb cream', 'cc krem', 'cc cream', 'bb & cc', 'bb&cc', 'bb ve cc'], cat: 'bb-cc-krem' },
  // setting spray / makyaj sabitleyici
  { keywords: ['setting spray', 'makyaj sabitleyici sprey', 'fixing spray', 'fixer spray', 'sabitleyici sprey', 'fix spray'], cat: 'makyaj-sabitleyici' },
  { keywords: ['primer', 'makyaj bazı', 'makeup base', 'pore filler', 'sabitleyici', 'setting spray', 'baz '], cat: 'primer' },
  // Dudak kategorileri
  { keywords: ['ruj', 'lipstick', 'lip stick', 'likit mat ruj', 'lip cream', 'lip balm', 'lip color', 'rouge à lèvres'], cat: 'ruj' },
  { keywords: ['dudak parlatıcı', 'dudak parlatici', 'lip gloss', 'lipgloss', 'lip glaze', 'lip oil'], cat: 'dudak-parlatici' },
  { keywords: ['dudak kalemi', 'lip liner', 'lipliner', 'lip pencil'], cat: 'dudak-kalemi' },
  // Kaş kategorileri (spesifik önce, genel sonra)
  { keywords: ['kaş kalemi', 'kas kalemi', 'eyebrow pencil', 'brow pencil', 'kaş şekillendirici', 'brow shaper', 'brow definer'], cat: 'kas-kalemi' },
  { keywords: ['kaş farı', 'kas fari', 'eyebrow powder', 'brow powder', 'kaş tozu'], cat: 'kas-fari' },
  { keywords: ['kaş sabitleyici', 'kas sabitleyici', 'kaş jeli', 'brow gel', 'kaş maskara', 'brow mascara', 'brow pomade', 'kaş pomad'], cat: 'kas-sabitleyici' },
  { keywords: ['kaş', 'kas', 'brow', 'eyebrow'], cat: 'kas' },
  // Makyaj seti
  { keywords: ['makyaj seti', 'makeup set', 'beauty set', 'makeup kit', 'makyaj kit'], cat: 'makyaj-seti' },
  // Vücut simi
  { keywords: ['vücut simi', 'vucut simi', 'body shimmer', 'body glitter', 'vücut parıltı', 'body glow', 'vücut ışıltı'], cat: 'vucut-simi' },
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
// ── Marka aliasları: normalizeBrand() çıktısı → dahili canonical key ──
var brandAliases = {
  // Maybelline
  'MAYBELLINE': 'MAYBELLINE',
  'MAYBELLINE NEW YORK': 'MAYBELLINE',
  // L'Oréal
  'LOREAL': 'LOREAL PARIS',
  'LOREAL PARIS': 'LOREAL PARIS',
  'L OREAL PARIS': 'LOREAL PARIS',
  'L OREAL': 'LOREAL PARIS',
  'LOREAL PROFESSIONNEL': 'LOREAL PARIS',
  // Estée Lauder
  'ESTEE LAUDER': 'ESTEE LAUDER',
  'ESTEE LAUDER COMPANIES': 'ESTEE LAUDER',
  // Diğerleri
  'CLINIQUE': 'CLINIQUE',
  'FLORMAR': 'FLORMAR',
  'ESSENCE': 'ESSENCE',
  'GOLDEN ROSE': 'GOLDEN ROSE',
  'NYX': 'NYX',
  'NYX PROFESSIONAL MAKEUP': 'NYX',
  'NYX PROFESSIONAL': 'NYX',
  'MAC': 'MAC',
  'MAC COSMETICS': 'MAC',
  'M.A.C': 'MAC',
  'M.A.C.': 'MAC',
  'BENEFIT': 'BENEFIT',
  'BENEFIT COSMETICS': 'BENEFIT',
  'NARS': 'NARS',
  'NARS COSMETICS': 'NARS',
  'DIOR': 'DIOR',
  'DIOR BACKSTAGE': 'DIOR',
  'CHARLOTTE TILBURY': 'CHARLOTTE TILBURY',
  'FENTY BEAUTY': 'FENTY BEAUTY',
  'FENTY': 'FENTY BEAUTY',
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
  'SHOW PASTEL': 'PASTEL',
  'REVOLUTION': 'REVOLUTION',
  'REVOLUTION PRO': 'REVOLUTION',
  'MAKEUP REVOLUTION': 'REVOLUTION',
  'WET N WLD': 'WET N WILD',
  'WET N WILD': 'WET N WILD',
  'WET AND WILD': 'WET N WILD',
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
  'LANCÔME': 'LANCOME',
  'GUERLAIN': 'GUERLAIN',
  'ARMANI': 'ARMANI',
  'GIORGIO ARMANI': 'ARMANI',
  'ARMANI BEAUTY': 'ARMANI',
  'YSL': 'YSL',
  'YVES SAINT LAURENT': 'YSL',
  'SAINT LAURENT': 'YSL',
  'SISLEY': 'SISLEY',
  'GIVENCHY': 'GIVENCHY',
  'VALENTINO': 'VALENTINO',
  'VALENTINO BEAUTY': 'VALENTINO',
  'HUDA BEAUTY': 'HUDA BEAUTY',
  'RARE BEAUTY': 'RARE BEAUTY',
  'TARTE': 'TARTE',
  'TARTE COSMETICS': 'TARTE',
  'SEPHORA COLLECTION': 'SEPHORA COLLECTION',
  'SEPHORA': 'SEPHORA COLLECTION',
  'HOURGLASS': 'HOURGLASS',
  'BELL': 'BELL',
  'GABRINI': 'GABRINI',
  'CALLISTA': 'CALLISTA',
  'NASCITA': 'NASCITA',
  'NOTE': 'NOTE',
  'NOTE COSMETICS': 'NOTE',
  'ANASTASIA BEVERLY HILLS': 'ANASTASIA BEVERLY HILLS',
  'ABH': 'ANASTASIA BEVERLY HILLS',
  'MAKE UP FOR EVER': 'MAKE UP FOR EVER',
  'MAKEUP FOREVER': 'MAKE UP FOR EVER',
  'NUDESTIX': 'NUDESTIX',
  'MILK MAKEUP': 'MILK MAKEUP',
  'MILK': 'MILK MAKEUP',
  'PIXI': 'PIXI',
  'PIXI BY PETRA': 'PIXI',
  'AVON': 'AVON',
  'CHANEL': 'CHANEL',
  'CHANEL BEAUTY': 'CHANEL',
  'CLARINS': 'CLARINS',
  'DOLCE GABBANA': 'DOLCE & GABBANA',
  'DOLCE AND GABBANA': 'DOLCE & GABBANA',
  'CAUDALIE': 'CAUDALIE',
  'NUXE': 'NUXE',
  'VIVIENNE SABO': 'VIVIENNE SABO',
  'WONDERWAY': 'WONDERWAY',
  'LYKD': 'LYKD',
  'COLOURPOP': 'COLOURPOP',
  'E L F': 'E.L.F.',
  'ELF': 'E.L.F.',
  'ELF COSMETICS': 'E.L.F.',
  'ESSENCE COSMETICS': 'ESSENCE',
  'ESSENCE THE SKIN CARE': 'ESSENCE',
  'LANEIGE': 'LANEIGE',
  'ETUDE': 'ETUDE',
  'ETUDE HOUSE': 'ETUDE',
  'INNISFREE': 'INNISFREE',
  'BABYFACE': 'BABYFACE',
  'FLORMAR COLLECTION': 'FLORMAR',
  'BEAULIS': 'BEAULIS',
  'LUSS': 'LUSS',
  'SKINFOOD': 'SKINFOOD',
  'KUATRA': 'KUATRA',
  'JOWE': 'JOWE',
  'COLORGRAM': 'COLORGRAM',
  'LR': 'LR',
  'LR ZEITGARD': 'LR',
  'MUSON': 'MUSON',
  'WONDERSKIN': 'WONDERSKIN',
  'HOMM LIFE': 'HOMM LIFE',
  'BIOAQUA': 'BIOAQUA',
  'VERACLARA': 'VERACLARA',
  'FOCALLURE': 'FOCALLURE',
  'TTT': 'TTT',
  'MARUDERM': 'MARUDERM',
  'MARUDERM.': 'MARUDERM',
  'MARU.DERM': 'MARUDERM',
};

// ── Marka görüntü adları: dahili canonical key → güzel gösterim ──
var brandDisplayNames = {
  'MAYBELLINE': 'Maybelline',
  'LOREAL PARIS': "L'Oréal Paris",
  'ESTEE LAUDER': 'Estée Lauder',
  'CLINIQUE': 'Clinique',
  'FLORMAR': 'Flormar',
  'ESSENCE': 'Essence',
  'GOLDEN ROSE': 'Golden Rose',
  'NYX': 'NYX',
  'MAC': 'MAC',
  'BENEFIT': 'Benefit',
  'NARS': 'NARS',
  'DIOR': 'Dior',
  'CHARLOTTE TILBURY': 'Charlotte Tilbury',
  'FENTY BEAUTY': 'Fenty Beauty',
  'BOBBI BROWN': 'Bobbi Brown',
  'URBAN DECAY': 'Urban Decay',
  'TOO FACED': 'Too Faced',
  'CATRICE': 'Catrice',
  'PUPA': 'Pupa',
  'INGLOT': 'Inglot',
  'FARMASI': 'Farmasi',
  'PASTEL': 'Pastel',
  'REVOLUTION': 'Revolution',
  'WET N WILD': 'Wet n Wild',
  'MISSHA': 'Missha',
  'KIKO': 'KIKO',
  'PIERRE CARDIN': 'Pierre Cardin',
  'CATHERINE ARLEY': 'Catherine Arley',
  'THE PUREST SOLUTIONS': 'The Purest Solutions',
  'YVES ROCHER': 'Yves Rocher',
  'NIVEA': 'Nivea',
  'SHISEIDO': 'Shiseido',
  'LANCOME': 'Lancôme',
  'GUERLAIN': 'Guerlain',
  'ARMANI': 'Armani Beauty',
  'YSL': 'Yves Saint Laurent',
  'SISLEY': 'Sisley',
  'GIVENCHY': 'Givenchy',
  'VALENTINO': 'Valentino Beauty',
  'HUDA BEAUTY': 'Huda Beauty',
  'RARE BEAUTY': 'Rare Beauty',
  'TARTE': 'Tarte',
  'SEPHORA COLLECTION': 'Sephora Collection',
  'HOURGLASS': 'Hourglass',
  'BELL': 'Bell',
  'GABRINI': 'Gabrini',
  'CALLISTA': 'Callista',
  'NASCITA': 'Nascita',
  'NOTE': 'NOTE',
  'ANASTASIA BEVERLY HILLS': 'Anastasia Beverly Hills',
  'MAKE UP FOR EVER': 'Make Up For Ever',
  'NUDESTIX': 'Nudestix',
  'MILK MAKEUP': 'Milk Makeup',
  'PIXI': 'Pixi',
  'AVON': 'Avon',
  'CHANEL': 'Chanel',
  'CLARINS': 'Clarins',
  'DOLCE & GABBANA': 'Dolce & Gabbana',
  'CAUDALIE': 'Caudalie',
  'NUXE': 'Nuxe',
  'VIVIENNE SABO': 'Vivienne Sabo',
  'WONDERWAY': 'Wonderway',
  'LYKD': 'LYKD',
  'COLOURPOP': 'ColourPop',
  'E.L.F.': 'e.l.f.',
  'LANEIGE': 'Laneige',
  'ETUDE': 'Etude',
  'INNISFREE': 'Innisfree',
  'BABYFACE': 'Babyface',
  'BEAULIS': 'Beaulis',
  'LUSS': 'Luss',
  'SKINFOOD': 'Skinfood',
  'KUATRA': 'Kuatra',
  'JOWE': 'Jowe',
  'COLORGRAM': 'Colorgram',
  'LR': 'LR',
  'MUSON': 'Muson',
  'WONDERSKIN': 'Wonderskin',
  'HOMM LIFE': 'Homm Life',
  'BIOAQUA': 'Bioaqua',
  'VERACLARA': 'Veraclara',
  'FOCALLURE': 'Focallure',
  'MAC': 'M·A·C',
  'TTT': 'TTT',
  'MARUDERM': 'Maru.Derm',
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
    .replace(/[^A-Z0-9\s&.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return brandAliases[clean] || clean;
}

// Canonical key → güzel gösterim adı
function displayBrand(brand) {
  if (!brand || brand.trim() === '') return '';
  var key = normalizeBrand(brand);
  return brandDisplayNames[key] || brand;
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
    .replace(/\b\d+\s*(ml|gr|g|oz|adet|piece)s?\b/gi, '') // "30 ml", "1 adet" → sil
    .replace(/\b\d+(ml|gr|g|oz|adet|piece)s?\b/gi, '') // "30ml" (boşluksuz) → sil
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
  clean = clean.replace(/\bspf\s*\d+/gi, '')
               .replace(/\b\d+\s*(ml|gr|g|oz)s?\b/gi, '')
               .replace(/\b\d+(ml|gr|g|oz)s?\b/gi, '');

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

// ── Varyant Bilgisi Cikar (Ton Kodu + Renk/Sade Kelimeler + Hacim) ──
function extractVariantInfo(name) {
  var clean = (name || '').toLowerCase();
  var codes = [];
  var sizes = [];

  // ── Ölçü/Hacim bilgisi ──
  var sizeMatch1 = clean.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|gr|g|oz|lt|cl)s?\b/gi) || [];
  var sizeMatch2 = clean.match(/\b(\d+(?:[.,]\d+)?)(ml|gr|g|oz|lt|cl)s?\b/gi) || [];
  var allSizes = sizeMatch1.concat(sizeMatch2);
  
  if (allSizes.length > 0) {
    allSizes.forEach(function(s) {
      var norm = s.replace(/\s+/g, '').toLowerCase();
      sizes.push(norm.toUpperCase());
    });
  }

  // Renk/ton kodları (örn. 01, 02, N10, C25)
  var matches = clean.match(/\b([a-z]{0,2}\d{1,3}[a-z]{0,2})\b/g);
  if (matches) {
    matches.forEach(function(m) { if (/\d/.test(m) && m.length <= 5) codes.push(m.toUpperCase()); });
  }
  var colorWords = ['siyah', 'kahverengi', 'bordo', 'pembe', 'kırmızı', 'turuncu', 'mor', 'mavi', 'yeşil', 'bej', 'nude', 'black', 'brown', 'blue', 'red', 'pink', 'coral', 'berry', 'burgundy', 'ivory', 'sand', 'honey', 'vanilla', 'porcelain', 'bronze', 'taupe', 'warm', 'cool', 'light', 'medium', 'dark', 'fair'];
  var words = clean.split(/[\s,.-]+/);
  words.forEach(function(w) {
    if (colorWords.indexOf(w) !== -1) codes.push(w.toUpperCase());
  });
  return { 
    shade: Array.from(new Set(codes)).sort().join('-'),
    size: Array.from(new Set(sizes)).sort().join('-')
  };
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

// ── İsim benzerliği (ÇİFT YÖNLÜ — her iki isim de yüksek eşleşme sağlamalı) ──
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

  // ÇİFT YÖNLÜ kapsam: HER İKİ tarafın da yüksek eşleşme oranı olmalı
  // "Teint Idole Ultra Wear" vs "Teint Idole Ultra Wear Care & Glow"
  // coverageA = 4/4 = 1.0 ama coverageB = 4/6 = 0.67 → min = 0.67 → REDDEDILIR
  var coverageA = setA.size > 0 ? intersection / setA.size : 0;
  var coverageB = setB.size > 0 ? intersection / setB.size : 0;
  var bidirectional = Math.min(coverageA, coverageB);

  // Bigram match: ÇİFT YÖNLÜ bigram kapsam kontrolü
  var bigramsA = extractBigrams(sigA.join(' '));
  var bigramsB = extractBigrams(sigB.join(' '));
  var bigramScore = 0;
  if (bigramsA.length > 0 && bigramsB.length > 0) {
    var setBiB = new Set(bigramsB);
    var setBiA = new Set(bigramsA);
    var commonBigrams = 0;
    bigramsA.forEach(function(bg) { if (setBiB.has(bg)) commonBigrams++; });
    // Çift yönlü bigram kapsam
    var bigramCovA = commonBigrams / bigramsA.length;
    var bigramCovB = commonBigrams / bigramsB.length;
    bigramScore = Math.min(bigramCovA, bigramCovB);
  }

  return Math.max(jaccard, bidirectional, bigramScore);
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
  // Çok kelimeli önce (greedy)
  'Maybelline New York', 'NYX Professional Makeup', 'Make Up For Ever',
  'L\'Oréal Paris', 'L\'Oreal Paris', 'L\'Oréal', 'L\'Oreal',
  'Anastasia Beverly Hills', 'Anastasıa Beverly Hills',
  'Charlotte Tilbury', 'Yves Saint Laurent',
  'Yves Rocher', 'The Purest Solutions', 'Fenty Beauty',
  'Huda Beauty', 'Rare Beauty', 'Dolce & Gabbana', 'Urban Decay',
  'Too Faced', 'Bobbi Brown', 'NARS Cosmetics',
  'Giorgio Armani', 'Armani Beauty',
  'Sephora Collection', 'Benefit Cosmetics',
  'Revolution Pro', 'Makeup Revolution',
  'Pastel Profashion', 'Show By Pastel', 'Show by Pastel',
  'Kiko Milano', 'KIKO Milano', 'KIKO',
  'Pupa Milano',
  'Pierre Cardin', 'Catherine Arley',
  'Wet n Wild', 'Wet N Wild',
  'Vivienne Sabo', 'Golden Rose',
  'ColourPop', 'Colourpop',
  'Pixi by Petra',
  'Alix Avien', 'ALIX AVIEN',
  'New Well', 'NEW WELL',
  'Jane Iredale', 'JANE IREDALE',
  'Bade Natural', 'BADE NATURAL',
  'Max Factor', 'MAX FACTOR',
  'Physicians Formula',
  'Diego Dalla Palma',
  'TCA Studio Make-Up', 'TCA STUDIO MAKE-UP', 'TCA Studio',
  'Pretty Beauty', 'PRETTY BEAUTY',
  'Sweet Kiss', 'SWEET KISS',
  'Naj Oleari', 'NAJ OLEARI',
  'Pop Beauty', 'POP BEAUTY',
  'Estée Lauder', 'Estee Lauder', 'ESTÉE LAUDER',
  'Deborah Milano', 'DEBORAH MILANO',
  'Dilara Zeybek',
  'Cream Co.', 'CREAM CO.',
  'Merit Flush',
  'Lionesse Silver',
  'Nivea Sun', 'NIVEA SUN',
  'Laura Mercier',
  'Smashbox Cosmetics',
  'Becca Cosmetics',
  'Pat McGrath',
  // Tek kelimeli
  'Maybelline', 'Flormar', 'Essence', 'Catrice', 'NOTE', 'Pastel',
  'NYX', 'MAC', 'Clinique', 'Benefit', 'NARS', 'Dior',
  'Farmasi', 'Inglot', 'Revolution',
  'Pupa', 'Revlon', 'Rimmel', 'Shiseido',
  'Armani', 'Lancôme', 'Lancome', 'Guerlain', 'YSL',
  'rom&nd', 'Astra', 'Missha', 'Tarte', 'Sisley',
  'Clarins', 'Givenchy', 'Valentino', 'Nudestix',
  'Pixi', 'Kosas', 'Hourglass', 'Chanel',
  'Kiko', 'Bell', 'Callista', 'Nascita', 'Gabrini',
  'Farmasi', 'Avon', 'Wonderway', 'LYKD', 'Lykd',
  'Isana', 'Alterra', 'Etude', 'Laneige', 'Innisfree',
  'Caudalie', 'Nuxe', 'Milani', 'E.L.F.',
  'Vivienne Sabo', 'Colorgram', 'Jowe', 'Wonderskin',
  'Bioaqua', 'Veraclara', 'Focallure', 'Beaulis',
  'Homm Life', 'Muson', 'LR Zeitgard',
  'Oriflame', 'Nivea', 'NIVEA', 'Deborah',
  'Smashbox', 'Becca', 'Stila', 'Bourjois',
  'Neutrogena', 'Bioderma', 'Vichy', 'Garnier',
  'La Roche-Posay', 'The Ordinary', 'Wella', 'Dove',
  'Monteil', 'Lionesse', 'Merit', 'Peripera',
  'Handaiyan', 'Sheglam', 'SHEGLAM', 'O.TWO.O',
  'Lumene', 'LUMENE', 'MOV', 'Extreme',
  // Ürün serisi → marka mapping (Hepsiburada'da marka eksik olduğunda)
  'Infaillible', // L'Oréal ürün serisi — extractBrandFromName'de yakalanamaz, aşağıda özel mapping var
].sort(function(a, b) { return b.length - a.length; }); // En uzun önce (greedy match)

// ── Ürün serisi → marka mapping (bazı siteler markayı ürün serisiyle karıştırır) ──
var productLineTooBrand = {
  'infaillible': "L'Oréal Paris",
  'true match': "L'Oréal Paris",
  'fit me': 'Maybelline',
  'superstay': 'Maybelline',
  'sky high': 'Maybelline',
  'lash sensational': 'Maybelline',
  'double wear': 'Estée Lauder',
  'stay in place': 'Estée Lauder',
  'teint idole': 'Lancôme',
  'backstage': 'Dior',
  'air blush': 'NARS',
  'matte trance': 'NARS',
  'telescopic': "L'Oréal Paris",
  'true match': "L'Oréal Paris",
  'accord parfait': "L'Oréal Paris",
  'lifter': 'Maybelline',
  'brow up': 'Flormar',
  'colorgram': 'Colorgram',
  'jowe': 'Jowe',
};

function extractBrandFromProductLine(name) {
  if (!name) return '';
  var nameLower = name.toLowerCase();
  for (var line in productLineTooBrand) {
    if (nameLower.includes(line)) return productLineTooBrand[line];
  }
  return '';
}

// Unicode apostrof ve tırnak normalizasyonu (U+2019 ' → ', U+2018 ' → ', U+201C " → ", U+201D " → ")
function normalizeApostrophes(str) {
  return str.replace(/[\u2018\u2019\u02BC\u02BB]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

function extractBrandFromName(name) {
  if (!name) return { brand: '', cleanName: name };
  var normalizedName = normalizeApostrophes(name);
  var nameLower = normalizedName.toLowerCase();
  for (var i = 0; i < knownBrands.length; i++) {
    var b = knownBrands[i];
    var bLower = normalizeApostrophes(b).toLowerCase();
    if (nameLower.startsWith(bLower + ' ') || nameLower.startsWith(bLower + ',') || nameLower.includes(bLower)) {
      var cleanName = normalizedName.replace(new RegExp(normalizeApostrophes(b).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
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
      // Gratis: "+2Vivienne Sabo..." veya "+5Colorgram..." prefix temizle
      if (src.site === 'Gratis' && name) {
        name = name.replace(/^\+\d+\s*/, '').trim();
        // "(238)" gibi suffix temizle
        name = name.replace(/\s*\(\d+\)\s*$/, '').trim();
      }
      // Marka boşsa ürün adından çıkar
      if (!brand || brand.trim() === '') {
        var extracted = extractBrandFromName(name);
        brand = extracted.brand;
        if (brand) name = extracted.cleanName;
      }
      // Hala boşsa ürün serisi adından çıkar
      if (!brand || brand.trim() === '') {
        brand = extractBrandFromProductLine(name);
      }
      // Marka görüntü adını düzelt (canonical display name)
      brand = displayBrand(brand);
      // Kategori düzeltmesi: ürün adına bakarak yanlış kategorileri düzelt
      var correctedCat = normalizeCategoryName(p.category);
      correctedCat = correctCategoryByName(p.name, correctedCat);
      // categoryLabel'ı düzeltilmiş kategoriye göre güncelle
      var correctedLabel = categorySlugToLabel[correctedCat] || normalizeCategoryLabel(p.categoryLabel);
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
        categoryLabel: correctedLabel,
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
  var name = (p.name || '').trim();
  // 1. Fiyat 5 TL altı (0 TL dahil) hatalı scrape
  if (p.price < 5) return false;
  // 2. İsmi çok kısa veya boş
  if (!name || name.length < 5) return false;
  // 2b. Gratis/scraper çöp isimleri: "Gratis Kart ile", "3 Tür", "2 Renk" vb.
  if (/^gratis\s+kart\s+ile\b/i.test(name)) return false;
  if (/^\d+\s+(tür|renk|çeşit|adet|tip)$/i.test(name)) return false;
  // 2c. Marka yoksa ve isim çok genericse eleme (Hepsiburada/Gratis garbage)
  if (!p.brand || p.brand.trim() === '') {
    // Sadece bilinen marka yoksa ve isim generikse at
    if (name.length < 10) return false;
  }
  // 2d. Mağaza adı marka olarak gelmiş olanları at (Diyar-ı Fırsat, Ucuzmağaza, vb.)
  var brandLow = (p.brand || '').toLowerCase();
  if (/fırsat|mağaza|market|indirim|kampanya/.test(brandLow)) return false;
  // 3. SEO kategori sayfaları — "Markaları", "Fiyatları", "Yorumları", "Çeşitleri" vb.
  // Not: \b Türkçe karakterlerle düzgün çalışmaz, bu yüzden daha geniş regex kullan
  if (/(fiyatlar|markalar|çeşitler|modelller|renkleri|yorumlar|cesitler|fiyatlari|markalari)/i.test(name)) return false;
  if (name.match(/\d{4}\s*\|/i) || name.match(/\|\s*trendyol/i)) return false;
  // 4. Trendyol banner/kampanya başlıkları
  if (/(keşfet|yakalayın|ayrıcalıklı|özel fiyat|kampanya)/i.test(name)) return false;
  // 5. Review sayısı gerçek dışı yüksek (SEO aggregation sayfası işareti)
  if (p.reviews > 50000) return false;
  // 6. "Set", "Hediye Set" gibi çoklu ürün paketleri
  if (/(hediye seti|hediye set|avantaj paketi|avantajlı paket|deneme boy|kofre|coffret|promosyon|kutu boy|çanta boy|özel kutu)/i.test(name)) return false;
  // 7. Çoklu ürün setleri ve combo paketler
  if (/\b\d['']?l[iıuü]\s*(set|paket)\b/i.test(name)) return false;
  if (/\b\d['']?l[iıuü]\s*maskara\b/i.test(name)) return false; // "2'li Maskara" = set
  // "Kalemli", "Hediyeli" combo setleri (Pazarama özellikle bunları listeler)
  if (/\b(kalemli|hediyeli|kremli)\s+(maskara|ruj|far)\b/i.test(name)) return false;
  if (/\b(maskara|ruj|far)\s+(kalemli|hediyeli|kremli)\b/i.test(name)) return false;
  // "Jel Göz Kalemli" gibi combo: "Lash Sensational + Jel Göz Kalemi"
  if (/göz\s*kalemli\s/i.test(name)) return false;
  // 8. Aşırı yüksek fiyat — tek kozmetik ürünü 10.000 TL'yi geçmez (Hepsiburada toplu satış hataları)
  // Not: Sensai, La Mer gibi ultra-lüks markalar bile nadiren 10K'yı geçer
  if (p.price > 10000) return false;
  // 9. Otomobil parçaları — "far" kelimesi araba farı olarak çekilmiş
  if (/\b(ford|volkswagen|vw|renault|toyota|honda|bmw|mercedes|audi|opel|fiat|hyundai|kia|peugeot|citroen|seat|skoda|volvo|passat|focus|corolla|civic|golf|polo|mais)\b/i.test(name)) return false;
  // 10. Elektronik/otomotiv/spor/mutfak/ev ürünleri — makyaj sitesine ait olmayan ürünler
  if (/\b(led far|xenon|oto\s|otomobil|araç|araba|motor|motosiklet|ampul|silecek|bisiklet|koşu bandı|çadır|spor aleti|dambıl|halter|kondisyon|çanta|cüzdan|valiz|şemsiye|tarak|törpü|cımbız|yastık|yorgan|battaniye|havlu|bornoz|aksesuar|ocak|fırın|çamaşır|bulaşık|süpürge|aspiratör|klima|televizyon|telefon kart|laptop|tablet|kulaklık|hoparlör|şarj|kablo|pil |halı|perde|tencere|tava|tabak|bardak|çatal|kaşık|bıçak|elektrikli|kontör|ps4|ps5|xbox|playstation|nintendo|oyun kulaklık|penis|anal|vibrat)\b/i.test(name)) return false;
  // 11. Giyim/iç giyim ürünleri — Hepsiburada'dan hatalı çekilmiş
  if (/\b(termal|fanila|korse|atlet|tayt|boxer|külot|çorap|pantolon|gömlek|tişört|t-shirt|sweatshirt|mont|ceket|palto|elbise|etek|şort)\b/i.test(name)) return false;
  // 12. "& xyz Hediye/Set" combo paketleri (Maskara & Krem Hediye gibi)
  if (/&.*hediye\b/i.test(name) || /&.*\bset\b/i.test(name)) return false;
  // 13. Çok uzun isimler genelde combo/set ürünleri
  if (name.length > 120) return false;
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
  var variantInfo = extractVariantInfo(p.name);
  var groupKey = brand + '|' + cat + '|' + core + '|' + variantInfo.shade + '|' + variantInfo.size;
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
    variantInfo: extractVariantInfo(p.name),
    barcode: (p.barcode || '').trim(),
  };
});

// ── Barkod güvenilirlik filtresi ──
// Bazı siteler gerçek EAN-8/EAN-13/UPC-A yerine kendi iç katalog numaralarını barkod olarak kaydeder:
//   Rossmann: 8 haneli "30XXXXXX" article numaraları (EAN değil, iç numara)
//   Gratis: 13 haneli "205XXXXXXXXXX" katalog numaraları (EAN değil, iç numara)
// Bu iç numaralar farklı ürünlere atanabileceğinden yanlış eşleşmelere yol açar.
// Yalnızca gerçek EAN-8 (8 hane), UPC-A (12 hane) veya EAN-13 (13 hane) formatındaki
// ve bilinen iç numara öneklerine girmeyen barkodları kabul et.
function isReliableBarcode(bc) {
  if (!bc) return false;
  // Sadece rakamlardan oluşmalı
  if (!/^\d+$/.test(bc)) return false;
  // EAN-8, UPC-A veya EAN-13 uzunluğunda olmalı
  if (bc.length !== 8 && bc.length !== 12 && bc.length !== 13) return false;
  // Rossmann iç article numaraları: 8 haneli, "30" ile başlayan
  if (bc.length === 8 && bc.startsWith('30')) return false;
  // Gratis iç katalog numaraları: 13 haneli, "205" ile başlayan
  if (bc.length === 13 && bc.startsWith('205')) return false;
  return true;
}

// ── 2a: Barkod indeksi oluştur (barcode → [idx...]) ──
var barcodeIndex = {};
precomputed.forEach(function(pp, idx) {
  if (isReliableBarcode(pp.barcode)) {
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

  // ── Marka tutarlılık kontrolü ──
  var brandKeys = sites.map(function(site) { return normalizeBrand(bySite[site].p.brand); });
  var allSameBrand = brandKeys.every(function(b) { return b === brandKeys[0]; });
  if (!allSameBrand) {
    return;
  }

  // ── Boyut/ML tutarlılık kontrolü ──
  // Aynı barkod ama farklı boyut = veri hatası
  var sizeKeys = sites.map(function(site) {
    var vi = extractVariantInfo(bySite[site].p.name);
    var sizes = (vi.size || '').split('-').filter(Boolean);
    return sizes.length > 0 ? sizes.join(',') : '';
  }).filter(function(s) { return s !== ''; });
  if (sizeKeys.length >= 2) {
    var allSameSize = sizeKeys.every(function(s) { return s === sizeKeys[0]; });
    if (!allSameSize) return; // Farklı boyut = eşleştirme yapma
  }

  // ── İsim tutarlılık kontrolü (KRİTİK) ──
  // Pazarama ve bazı siteler aynı barkodu farklı ürünlere atayabiliyor
  // Barkod eşleşse bile ürün isimleri tamamen farklıysa eşleştirme yapma
  var siteNames = sites.map(function(site) {
    return {
      site: site,
      name: bySite[site].p.name || '',
      words: new Set(
        (bySite[site].p.name || '').toLowerCase()
          .replace(/[^a-zçğıöşü0-9\s]/g, '')
          .split(/\s+/)
          .filter(function(w) { return w.length > 2; })
      )
    };
  });
  // Her çift arasında overlap kontrol et
  var nameConflict = false;
  for (var ni = 0; ni < siteNames.length && !nameConflict; ni++) {
    for (var nj = ni + 1; nj < siteNames.length && !nameConflict; nj++) {
      var common = 0;
      siteNames[ni].words.forEach(function(w) { if (siteNames[nj].words.has(w)) common++; });
      var maxWords = Math.max(siteNames[ni].words.size, siteNames[nj].words.size);
      var overlap = maxWords > 0 ? common / maxWords : 0;
      // Kategori de kontrol et
      var cat1 = (bySite[siteNames[ni].site].p.category || '').toLowerCase();
      var cat2 = (bySite[siteNames[nj].site].p.category || '').toLowerCase();
      var catMismatch = cat1 && cat2 && cat1 !== cat2 && !categoryCompatible(cat1, cat2);
      if (overlap < 0.25 || catMismatch) {
        nameConflict = true;
      }
    }
  }
  if (nameConflict) return; // İsimler uyuşmuyor = farklı ürün, barkod yanlış

  // ── Shade/Ton kodu kontrolü (barkod eşleştirmede de) ──
  // Farklı numara/ton = farklı ürün (105 vs 006 gibi)
  var barcodeShades = sites.map(function(site) {
    return extractShadeCode(bySite[site].p.name, bySite[site].p.brand);
  });
  for (var si = 0; si < barcodeShades.length && !nameConflict; si++) {
    for (var sj = si + 1; sj < barcodeShades.length && !nameConflict; sj++) {
      if (barcodeShades[si].length > 0 && barcodeShades[sj].length > 0) {
        var shadeMatch = barcodeShades[si].some(function(sc) { return barcodeShades[sj].indexOf(sc) !== -1; });
        if (!shadeMatch) nameConflict = true;
      }
    }
  }
  if (nameConflict) return;

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

// ── 2b: SIKI İSİM TABANLI EŞLEŞTİRME ──
// Kural: Aynı marka + aynı/uyumlu kategori + yüksek benzerlik (>=0.80) + boyut eşleşmesi
var nameMatchCount = 0;
var unmatchedIndices = [];
for (var i = 0; i < deduped.length; i++) {
  if (!used.has(i)) unmatchedIndices.push(i);
}

// İndeksi marka bazında grupla (kategori uyumluluğu sonra kontrol edilecek)
var brandGroups = {};
unmatchedIndices.forEach(function(idx) {
  var pp = precomputed[idx];
  if (!brandGroups[pp.brand]) brandGroups[pp.brand] = [];
  brandGroups[pp.brand].push(idx);
});

// Her grupta aynı marka ürünleri karşılaştır (kategori uyumluluğu kontrol edilir)
Object.keys(brandGroups).forEach(function(brandKey) {
  var group = brandGroups[brandKey];
  if (group.length < 2) return;

  // Farklı site ürünlerini ayır
  var bySite = {};
  group.forEach(function(idx) {
    var site = deduped[idx]._site;
    if (!bySite[site]) bySite[site] = [];
    bySite[site].push(idx);
  });

  var sites = Object.keys(bySite);
  if (sites.length < 2) return; // Tek sitede, eşleştirme yok

  // İlk site ürünlerini baz al, diğer sitelerde eşleşme ara
  var baseSite = sites[0];
  bySite[baseSite].forEach(function(baseIdx) {
    if (used.has(baseIdx)) return;
    var basePP = precomputed[baseIdx];
    var baseP = deduped[baseIdx];
    var baseSize = extractVariantInfo(baseP.name);

    var matchedPrices = [{
      site: baseP._site,
      price: baseP.price > 0 ? baseP.price : (baseP._minPrice || 0),
      url: baseP.productUrl,
      variantCount: baseP._variantCount || 1,
      imageUrl: Array.isArray(baseP.imageUrl) ? (baseP.imageUrl[0] || '') : (baseP.imageUrl || ''),
    }];

    for (var s = 1; s < sites.length; s++) {
      var bestMatch = null;
      var bestScore = 0;

      bySite[sites[s]].forEach(function(candIdx) {
        if (used.has(candIdx)) return;
        var candPP = precomputed[candIdx];
        var candP = deduped[candIdx];

        // Kategori uyumluluk kontrolü
        if (!categoryCompatible(baseP.category, candP.category)) return;

        // ── BOYUT/ML KONTROLÜ (KRİTİK) ──
        // Farklı boyutlar (15ml vs 30ml vs 40ml) kesinlikle eşleşmemeli
        var candSize = extractVariantInfo(candP.name);
        var baseSizes = (baseSize.size || '').split('-').filter(Boolean);
        var candSizes = (candSize.size || '').split('-').filter(Boolean);
        if (baseSizes.length > 0 && candSizes.length > 0) {
          // Her iki ürünün de boyut bilgisi varsa, eşleşmeli
          var sizeMatch = baseSizes.some(function(bs) { return candSizes.indexOf(bs) !== -1; });
          if (!sizeMatch) return; // Farklı boyut = farklı ürün
        }
        // Bir tarafta boyut varken diğerinde yoksa — fiyat farkı ile kontrol et
        if ((baseSizes.length > 0) !== (candSizes.length > 0)) {
          var bp2 = baseP.price || baseP._minPrice || 0;
          var cp2 = candP.price || candP._minPrice || 0;
          if (bp2 > 0 && cp2 > 0) {
            var sizeRatio = Math.max(bp2, cp2) / Math.min(bp2, cp2);
            if (sizeRatio > 2) return; // Büyük fiyat farkı + boyut uyumsuzluğu = farklı ürün
          }
        }

        // ── TON/SHADE KODU KONTROLÜ (KRİTİK) ──
        // Farklı ton numaraları (01 vs 02, Light vs Medium) kesinlikle eşleşmemeli
        var baseShadeCodes = extractShadeCode(baseP.name, basePP.brand);
        var candShadeCodes = extractShadeCode(candP.name, candPP.brand);
        if (baseShadeCodes.length > 0 && candShadeCodes.length > 0) {
          // Her iki üründe de ton kodu varsa, en az bir ortak kod olmalı
          var shadeMatch = baseShadeCodes.some(function(sc) { return candShadeCodes.indexOf(sc) !== -1; });
          if (!shadeMatch) return; // Farklı ton = farklı ürün (01 ≠ 02)
        }

        // ── SEYAHAT BOYU / MİNİ KONTROLÜ ──
        var baseTravel = /\b(seyahat|travel|mini|minyat[uü]r|sample|deneme)\b/i.test(baseP.name);
        var candTravel = /\b(seyahat|travel|mini|minyat[uü]r|sample|deneme)\b/i.test(candP.name);
        if (baseTravel !== candTravel) return; // Biri seyahat boyu diğeri değil = farklı ürün

        // ── WATERPROOF KONTROLÜ ──
        var baseWP = /\b(waterproof|su\s*ge[cç]irmez)\b/i.test(baseP.name);
        var candWP = /\b(waterproof|su\s*ge[cç]irmez)\b/i.test(candP.name);
        if (baseWP !== candWP) return; // Biri waterproof diğeri değil = farklı ürün

        // ── İSİM EŞLEŞTİRME (SIKI) ──
        // 1. Product line eşleşmesi kontrol et
        var baseLine = basePP.line;
        var candLine = candPP.line;
        var lineMatch = false;
        if (baseLine && candLine) {
          lineMatch = (baseLine === candLine);
          if (!lineMatch) return; // İkisi de bilinen seri ama farklı seri = farklı ürün
        }

        // 2. Core isim benzerliği — ÇOK SIKI eşleştirme
        var sim = similarity(basePP.core, candPP.core);
        var minThreshold = 0.85; // Yüksek eşik — bir kelime farkı bile reddeder

        // Product line eşleşmesi varsa biraz daha toleranslı ol
        if (lineMatch) minThreshold = 0.78;

        // Core isimler çok kısa ise (3 kelimeden az) daha sıkı ol
        var baseWords = basePP.core.split(' ').filter(function(w) { return w.length > 1; });
        var candWords = candPP.core.split(' ').filter(function(w) { return w.length > 1; });
        if (baseWords.length <= 2 || candWords.length <= 2) minThreshold = Math.max(minThreshold, 0.90);

        if (sim < minThreshold) return;

        // 2b. EK KONTROL: Eşleşmeyen ayırt edici kelimeler varsa reddet
        // "Glow", "Matte", "Velvet" gibi tek bir kelime farkı bile ürünü değiştirir
        var baseSigWords = basePP.core.split(' ').filter(function(w) {
          return w.length > 1 && !genericCosmeticWords.has(cosmeticSynonyms[w] || w);
        }).map(function(w) { return cosmeticSynonyms[w] || w; });
        var candSigWords = candPP.core.split(' ').filter(function(w) {
          return w.length > 1 && !genericCosmeticWords.has(cosmeticSynonyms[w] || w);
        }).map(function(w) { return cosmeticSynonyms[w] || w; });
        var baseSet = new Set(baseSigWords);
        var candSet = new Set(candSigWords);
        // A'da olup B'de olmayan kelimeler
        var unmatchedA = 0;
        baseSet.forEach(function(w) { if (!candSet.has(w)) unmatchedA++; });
        // B'de olup A'da olmayan kelimeler
        var unmatchedB = 0;
        candSet.forEach(function(w) { if (!baseSet.has(w)) unmatchedB++; });
        // Toplam eşleşmeyen ayırt edici kelime sayısı
        var totalUnmatched = unmatchedA + unmatchedB;
        if (totalUnmatched >= 2) return; // 2+ farklı kelime = kesinlikle farklı ürün
        if (totalUnmatched === 1 && !lineMatch) return; // 1 farklı kelime + aynı seri değilse = farklı ürün

        // 3. Fiyat aralığı makul olmalı (3x farktan fazla olmasın)
        var bp = baseP.price || baseP._minPrice || 0;
        var cp = candP.price || candP._minPrice || 0;
        if (bp > 0 && cp > 0) {
          var ratio = Math.max(bp, cp) / Math.min(bp, cp);
          if (ratio > 3) return; // Çok farklı fiyat = muhtemelen farklı ürün veya boyut
        }

        if (sim > bestScore) {
          bestScore = sim;
          bestMatch = { idx: candIdx, p: candP };
        }
      });

      if (bestMatch) {
        used.add(bestMatch.idx);
        matchedPrices.push({
          site: bestMatch.p._site,
          price: bestMatch.p.price > 0 ? bestMatch.p.price : (bestMatch.p._minPrice || 0),
          url: bestMatch.p.productUrl,
          variantCount: bestMatch.p._variantCount || 1,
          imageUrl: Array.isArray(bestMatch.p.imageUrl) ? (bestMatch.p.imageUrl[0] || '') : (bestMatch.p.imageUrl || ''),
        });
        nameMatchCount++;
      }
    }

    if (matchedPrices.length >= 2) {
      // Uçurum fiyat filtresi
      matchedPrices.sort(function(a, b) { return a.price - b.price; });
      var validPrices = [matchedPrices[0]];
      for (var k = 1; k < matchedPrices.length; k++) {
        if (matchedPrices[k].price / matchedPrices[0].price <= 3) validPrices.push(matchedPrices[k]);
      }
      matchedPrices = validPrices;
    }

    if (matchedPrices.filter(function(p){ return p.price > 0; }).length > 0) {
      used.add(baseIdx);
      merged.push(Object.assign({}, baseP, {
        prices: matchedPrices.filter(function(p){ return p.price > 0; }),
        _matchCount: matchedPrices.length,
        _matchMethod: matchedPrices.length > 1 ? 'name' : 'single',
      }));
    }
  });
});

console.log('Isim eslestirme: ' + nameMatchCount + ' ek satici eslestirmesi yapildi');

// ── 2c: Hâlâ eşleşmemiş ürünleri tek-fiyatlı olarak ekle ──
for (var i = 0; i < deduped.length; i++) {
  if (used.has(i)) continue;

  var base = deduped[i];
  var prices = [{
    site: base._site,
    price: base.price > 0 ? base.price : (base._minPrice || 0),
    url: base.productUrl,
    variantCount: base._variantCount || 1,
    imageUrl: Array.isArray(base.imageUrl) ? (base.imageUrl[0] || '') : (base.imageUrl || ''),
  }];

  prices = prices.filter(function(p) { return p.price > 0; });
  if (prices.length === 0) continue;

  merged.push(Object.assign({}, base, {
    prices: prices,
    _matchCount: 1,
    _matchMethod: 'single',
  }));
}

console.log('Eslestirme sonucu: ' + merged.length + ' benzersiz urun (' + allRaw.length + ' ham veriden)');

// ── Master Grouping (Varyant Birleştirme) ──
var masterGroups = {};
merged.forEach(function(m) {
  var vInfo = extractVariantInfo(m.name);
  var key = normalizeBrand(m.brand) + '|' + m.category + '|' + coreProductName(m.name, m.brand);
  if (!masterGroups[key]) masterGroups[key] = { base: m, variants: [] };
  masterGroups[key].variants.push({
    shade: vInfo.shade || 'Standart',
    size: vInfo.size || '',
    name: cleanName(m.name, m.brand),
    prices: m.prices,
    imageUrl: Array.isArray(m.imageUrl) ? (m.imageUrl[0] || '') : (m.imageUrl || '')
  });
});

var masterMerged = [];
Object.keys(masterGroups).forEach(function(key) {
  var mg = masterGroups[key];
  var mBase = mg.base;

  // ── 'Standart' Fiyat Dağıtımı ──
  // Sephora gibi siteler ton bilgisini başlığa yazmadığı için 'Standart' olarak gelir.
  // Eğer bu üründe özel tonlar (130, 140 vb.) varsa, Standart'taki satıcıları onlara da kopyalayalım.
  var standartVariant = mg.variants.find(function(v) { return v.shade === 'Standart' && !v.size; });
  if (standartVariant && mg.variants.length > 1) {
    mg.variants.forEach(function(v) {
      if (v !== standartVariant) {
        // Standart varianttaki her fiyatı bu spesifik varyanta ekle (eğer o site halihazırda yoksa)
        standartVariant.prices.forEach(function(sp) {
          var exists = v.prices.find(function(vp) { return vp.site === sp.site; });
          if (!exists) {
            v.prices.push(Object.assign({}, sp));
          }
        });
      }
    });
  }

  mg.variants.sort(function(a, b) { 
    if (!a.prices || a.prices.length === 0) return 1;
    if (!b.prices || b.prices.length === 0) return -1;
    return (a.prices[0].price || 0) - (b.prices[0].price || 0); 
  });
  if (mg.variants.length > 0 && mg.variants[0].prices && mg.variants[0].prices.length > 0) {
    mBase.prices = mg.variants[0].prices;
  }
  mBase._variants = mg.variants;
  masterMerged.push(mBase);
});
merged = masterMerged;

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
    brand: displayBrand(p.brand) || p.brand,
    name: name,
    category: p.category,
    categoryLabel: p.categoryLabel,
    skinType: skinDefaults[p.category] || ['normal'],
    variants: (p._variants || []).map(function(v) { return { shade: v.shade, size: v.size, name: v.name, imageUrl: v.imageUrl, prices: (v.prices || []).map(function(pr) { return { site: pr.site, price: pr.price, url: pr.url, variantCount: pr.variantCount }; }) }; }),
    prices: cleanPrices,
    rating: +parseFloat(rating).toFixed(1),
    reviews: Math.round(reviews),
    imageUrl: bestImage,
    productUrl: p.productUrl,
    desc: p.desc || '',
    trending: (rating >= 4.6 && reviews >= 100) || (rating >= 4.4 && reviews >= 500) || (rating >= 4.8 && reviews >= 30),
    vegan: p.vegan || false,
    crueltyFree: p.crueltyFree || false,
    spf: false,
    dupeFor: [],
    dupeOf: [],
    ingredients: [],
    ingredientWarnings: [],
    source: (p._site || p.source || 'unknown').toLowerCase(),
    priceCount: p.prices.length,
    lastUpdated: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.'),
  };
});

// ── Muadil Eşleştirme (Dupe Matching) ──
KNOWN_DUPES.forEach(function(d) {
  var highEnds = products.filter(p => p.brand.toUpperCase() === d.highEnd.brand && p.name.toLowerCase().includes(d.highEnd.keyword));
  var dupes = products.filter(p => p.brand.toUpperCase() === d.dupe.brand && p.name.toLowerCase().includes(d.dupe.keyword));
  
  highEnds.forEach(he => {
    dupes.forEach(dp => {
      // Sadece ID sakla, frontend de ID ile bulsun
      if (!he.dupeFor.includes(dp.id)) he.dupeFor.push(dp.id);
      if (!dp.dupeOf.includes(he.id)) dp.dupeOf.push(he.id);
    });
  });
});

// ── Dosyaya yaz ──
var siteCount = Object.keys(sourceCounts).filter(function(k) { return sourceCounts[k] > 0; }).length;
var multiPriceCount = products.filter(function(p) { return p.prices.length > 1; }).length;

var header = '// Kozmelove urun verisi — ' + products.length + ' urun, ' + siteCount + ' satici\n';
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
