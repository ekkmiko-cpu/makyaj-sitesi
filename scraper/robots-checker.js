/**
 * robots.txt Kontrolcüsü
 *
 * Scraper'lar çalışmadan önce hedef sitenin robots.txt dosyasını okur
 * ve ilgili URL'nin izin verilip verilmediğini kontrol eder.
 *
 * Kullanım:
 *   const { checkRobots, isPathAllowed } = require('./robots-checker');
 *   const rules = await checkRobots('https://www.example.com');
 *   if (!isPathAllowed(rules, '/urunler/')) { console.log('Engellendi'); }
 */

const https = require('https');
const http = require('http');

const USER_AGENT = 'BeauteBot/1.0';

/**
 * Bir sitenin robots.txt dosyasını indirir ve kuralları parse eder.
 * @param {string} baseUrl - Sitenin ana URL'si (örn: https://www.trendyol.com)
 * @returns {Promise<{allowed: string[], disallowed: string[], crawlDelay: number|null}>}
 */
async function checkRobots(baseUrl) {
  const robotsUrl = baseUrl.replace(/\/$/, '') + '/robots.txt';
  const rules = { allowed: [], disallowed: [], crawlDelay: null, raw: '' };

  try {
    const text = await fetchText(robotsUrl);
    rules.raw = text;
    return parseRobotsTxt(text);
  } catch (err) {
    // robots.txt yoksa veya erişilemezse → her şey izinli kabul edilir
    console.log(`  ℹ️  robots.txt alınamadı (${baseUrl}): ${err.message} — tüm yollar izinli kabul ediliyor`);
    return rules;
  }
}

/**
 * Parse edilmiş kurallara göre bir path'in izinli olup olmadığını kontrol eder.
 * @param {object} rules - checkRobots'tan dönen kurallar
 * @param {string} urlPath - Kontrol edilecek yol (örn: /makyaj/fondoten/)
 * @returns {boolean}
 */
function isPathAllowed(rules, urlPath) {
  // Normalize path
  const p = urlPath.startsWith('/') ? urlPath : '/' + urlPath;

  // En spesifik eşleşmeyi bul (uzun path öncelikli)
  let bestMatch = null;
  let bestLen = -1;
  let bestIsAllow = true;

  for (const pattern of rules.disallowed) {
    if (pathMatches(p, pattern) && pattern.length > bestLen) {
      bestMatch = pattern;
      bestLen = pattern.length;
      bestIsAllow = false;
    }
  }

  for (const pattern of rules.allowed) {
    if (pathMatches(p, pattern) && pattern.length > bestLen) {
      bestMatch = pattern;
      bestLen = pattern.length;
      bestIsAllow = true;
    }
  }

  return bestIsAllow;
}

/**
 * robots.txt metnini parse eder. Önce BeauteBot, sonra * kurallarını arar.
 */
function parseRobotsTxt(text) {
  const lines = text.split('\n').map(l => l.trim());
  const result = { allowed: [], disallowed: [], crawlDelay: null };

  let currentAgents = [];
  let sections = []; // { agents: [], rules: [] }
  let currentRules = [];

  for (const line of lines) {
    // Yorum satırlarını atla
    const clean = line.split('#')[0].trim();
    if (!clean) continue;

    const [directive, ...rest] = clean.split(':');
    const key = directive.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (currentAgents.length > 0 && currentRules.length > 0) {
        sections.push({ agents: currentAgents, rules: currentRules });
      }
      if (currentRules.length > 0) {
        currentAgents = [];
        currentRules = [];
      }
      currentAgents.push(value.toLowerCase());
    } else if (key === 'disallow' && value) {
      currentRules.push({ type: 'disallow', path: value });
    } else if (key === 'allow' && value) {
      currentRules.push({ type: 'allow', path: value });
    } else if (key === 'crawl-delay' && value) {
      currentRules.push({ type: 'crawl-delay', value: parseFloat(value) });
    }
  }

  // Son bölümü kaydet
  if (currentAgents.length > 0 && currentRules.length > 0) {
    sections.push({ agents: currentAgents, rules: currentRules });
  }

  // Önce BeauteBot'a özel kuralları ara, yoksa * kurallarını kullan
  let targetSection = sections.find(s => s.agents.includes('beautebot') || s.agents.includes('beautebot/1.0'));
  if (!targetSection) {
    targetSection = sections.find(s => s.agents.includes('*'));
  }

  if (targetSection) {
    for (const rule of targetSection.rules) {
      if (rule.type === 'allow') result.allowed.push(rule.path);
      else if (rule.type === 'disallow') result.disallowed.push(rule.path);
      else if (rule.type === 'crawl-delay') result.crawlDelay = rule.value;
    }
  }

  return result;
}

/**
 * Basit path eşleştirme (* wildcard destekli)
 */
function pathMatches(path, pattern) {
  if (pattern === '/') return true;
  if (pattern.includes('*')) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\$/g, '$'));
    return regex.test(path);
  }
  return path.startsWith(pattern);
}

/**
 * URL'den metin içeriği çeker (basit HTTP/HTTPS istemci)
 */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 }, (res) => {
      if (res.statusCode === 404 || res.statusCode === 403) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

/**
 * Scraper başlangıcında robots.txt kontrolü yapar ve rapor basar.
 * @param {string} baseUrl
 * @param {string[]} paths - Kontrol edilecek yollar
 * @returns {Promise<{rules: object, blockedPaths: string[]}>}
 */
async function preflightCheck(baseUrl, paths) {
  console.log(`\n🤖 robots.txt kontrolü: ${baseUrl}`);
  const rules = await checkRobots(baseUrl);

  const blocked = [];
  const allowed = [];

  for (const p of paths) {
    if (isPathAllowed(rules, p)) {
      allowed.push(p);
    } else {
      blocked.push(p);
    }
  }

  if (rules.crawlDelay) {
    console.log(`  ⏱️  Crawl-Delay: ${rules.crawlDelay}s`);
  }

  if (blocked.length === 0) {
    console.log(`  ✅ Tüm yollar izinli (${allowed.length} yol kontrol edildi)`);
  } else {
    console.log(`  ⚠️  Engellenen yollar (${blocked.length}):`);
    blocked.forEach(p => console.log(`     ❌ ${p}`));
    if (allowed.length > 0) {
      console.log(`  ✅ İzinli yollar (${allowed.length}):`);
      allowed.forEach(p => console.log(`     ✓ ${p}`));
    }
  }

  return { rules, blockedPaths: blocked, crawlDelay: rules.crawlDelay };
}

module.exports = { checkRobots, isPathAllowed, preflightCheck, USER_AGENT };
