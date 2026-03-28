const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'tr-TR'
  });
  const page = await context.newPage();

  // Collect API calls
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('variation') || url.includes('selector') || url.includes('shade') ||
        url.includes('attributes') || url.includes('Product-Variation')) {
      try {
        const body = await response.text();
        apiCalls.push({ url, status: response.status(), body });
      } catch(e) {
        apiCalls.push({ url, status: response.status() });
      }
    }
  });

  console.log('Loading page...');
  await page.goto('https://www.sephora.com.tr/p/double-wear-stay-in-place-makeup-%E2%80%93-fondoten-P1000212230.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  // Accept cookies if present
  try {
    await page.click('#onetrust-accept-btn-handler', { timeout: 2000 });
  } catch(e) {}

  // Click the shade selector to open the modal
  console.log('Clicking shade selector...');
  try {
    await page.click('[data-js-open-selector-dialog]', { timeout: 3000 });
    await page.waitForTimeout(3000);
    console.log('Shade selector clicked! Waiting for modal...');
  } catch(e) {
    console.log('Could not click shade selector:', e.message.substring(0, 80));
  }

  // Now extract shade data from the opened modal
  const shades = await page.evaluate(() => {
    const results = [];

    // Check modal/dialog content
    const dialogs = document.querySelectorAll('.dialog, .modal, [role="dialog"], .shade-selector, .selector-dialog, .variation-selector');
    const dialogInfo = Array.from(dialogs).map(d => ({
      class: d.className,
      visible: d.offsetParent !== null,
      html: d.innerHTML.substring(0, 500)
    }));

    // Look for shade items in any list
    const shadeItems = document.querySelectorAll(
      '.shade-item, .swatch-item, .variation-item, ' +
      'li[data-shade], li[data-value], li[data-attr-value], ' +
      '.selector-item, .color-item'
    );
    shadeItems.forEach(el => {
      results.push({
        method: 'shadeItem',
        text: el.textContent.trim().substring(0, 60),
        dataValue: el.getAttribute('data-value') || el.getAttribute('data-shade') || el.getAttribute('data-attr-value') || '',
        title: el.getAttribute('title') || ''
      });
    });

    // Look for shade links/buttons anywhere on page
    const shadeLinks = document.querySelectorAll('a[data-shade-name], button[data-shade-name], [data-shade-name]');
    shadeLinks.forEach(el => {
      results.push({
        method: 'shadeLink',
        text: el.getAttribute('data-shade-name') || el.textContent.trim().substring(0, 60)
      });
    });

    // Look for swatch images with alt text
    const swatchImgs = document.querySelectorAll('img[class*="swatch"], img[src*="swatch"]');
    swatchImgs.forEach(img => {
      if (img.alt && img.alt.length > 1) {
        results.push({ method: 'swatchImg', text: img.alt });
      }
    });

    // Check ALL li elements in variation/shade containers
    const varContainers = document.querySelectorAll('.product-variations, .variation-attribute, .shade-list, .selector-body, .selector-list');
    varContainers.forEach(container => {
      container.querySelectorAll('li, a, button').forEach(el => {
        const name = el.getAttribute('title') || el.getAttribute('data-attr-value') ||
                     el.getAttribute('aria-label') || el.textContent.trim();
        if (name && name.length > 1 && name.length < 80) {
          results.push({ method: 'containerChild', text: name.substring(0, 60), tag: el.tagName, class: el.className.substring(0, 40) });
        }
      });
    });

    return { results, dialogInfo, bodyLen: document.body.innerHTML.length };
  });

  console.log('\n=== Shade results ===');
  console.log('Dialog info:', JSON.stringify(shades.dialogInfo, null, 2));
  console.log('Results count:', shades.results.length);
  shades.results.forEach(r => console.log(` [${r.method}] ${r.text}${r.dataValue ? ' (val=' + r.dataValue + ')' : ''}${r.tag ? ' <' + r.tag + '>' : ''}`));

  console.log('\n=== API Calls after click ===');
  apiCalls.forEach(c => {
    console.log(c.url.substring(0, 150), '|', c.status);
    if (c.body) console.log('  body:', c.body.substring(0, 400));
  });

  // Also try fetching the variation URL directly
  console.log('\n=== Trying Demandware variation endpoint ===');
  const varUrl = 'https://www.sephora.com.tr/on/demandware.store/Sites-Sephora_TR-Site/tr_TR/Product-Variation?pid=P1000212230&format=ajax';
  try {
    const res = await page.goto(varUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const text = await page.content();
    console.log('DW response length:', text.length);
    console.log('Snippet:', text.substring(0, 500));
  } catch(e) {
    console.log('DW error:', e.message.substring(0, 80));
  }

  await browser.close();
})().catch(e => console.error(e.message));
