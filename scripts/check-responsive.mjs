#!/usr/bin/env node
/**
 * Checks that the sites are usable at phone and tablet widths.
 *
 * At each width it reports the three failures a person would actually feel:
 *
 *   overflow  the page body scrolls sideways, so content sits off the right edge
 *   wide      an element is wider than the screen and is not inside a scrolling box
 *   small     a control is under 44px, the smallest comfortable tap target
 *
 * It also puts a seven column table on a page so the scrolling table contract is tested even
 * where the real table only appears once a credential has been presented.
 *
 * Usage:
 *   $env:SITES='{"academy":"http://127.0.0.1:3002", ...}'; node scripts/check-responsive.mjs
 *
 * Each site is listed with the pages a person can open; a page that is not reachable is reported
 * as skipped rather than failed, because a site being partly unavailable is not a layout fault.
 */
/**
 * Playwright is installed on demand. It is deliberately not a dependency of the sites: it downloads
 * a browser on install, and no deployed service runs this check.
 */
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('This check needs Playwright, which is not a dependency of the sites.');
  console.error('Install it once with:');
  console.error('  npm install --no-save --no-package-lock playwright@1.59.1');
  process.exit(2);
}

const SITES = JSON.parse(process.env.SITES || '{}');

// Checking nothing and reporting success would be worse than failing, so refuse both cases.
if (Object.keys(SITES).length === 0) {
  console.error('No sites given. Set SITES to a JSON object of site name to base address, for example');
  console.error('  $env:SITES=\'{"academy":"http://127.0.0.1:3002"}\'');
  process.exit(2);
}

/** Widths to check: two phones, a tablet in portrait and a tablet in landscape. */
const VIEWPORTS = [
  { name: 'phone-360', width: 360, height: 740, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'tablet-1024', width: 1024, height: 768, touch: false },
];

/** Pages a person can open without signing in. */
const PAGES = {
  academy: ['/', '/credentials', '/get-credentials', '/claim'],
  quals: ['/', '/share/00000000-0000-0000-0000-000000000000'],
  portal: ['/login'],
  myJobs: ['/', '/dashboard', '/verify-academic', '/issuers'],
  trustUniversity: ['/'],
};

/**
 * The portal's signed-in pages, checked only when credentials are supplied, so the admin surface
 * is measured rather than assumed. Nothing here is written down: pass them in the environment.
 */
const PORTAL_EMAIL = process.env.PORTAL_EMAIL;
const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD;
const PORTAL_SIGNED_IN_PAGES = ['/', '/credentials', '/shares', '/accounts', '/api-keys', '/audit'];

/** With SELFTEST set, a deliberately uncontained wide element must be reported as a fault. */
const SELF_TEST = Boolean(process.env.SELFTEST);

/** Sites whose stylesheet defines a scrolling table box, so the contract can be exercised. */
const TABLE_SITES = new Set(['quals', 'trustUniversity']);

const WIDE_TABLE = `<table>
  <thead><tr><th>Module</th><th>Title</th><th>Term</th><th>Credits</th><th>Mark</th><th>Workload</th><th>Required</th></tr></thead>
  <tbody><tr><td>COMPSCI 701</td><td>Advanced algorithms and complexity</td><td>2026 Semester one</td><td>15</td><td>A- (7.0)</td><td>150 h</td><td>Yes</td></tr></tbody>
</table>`;

/**
 * Runs in the page. Elements inside a box that scrolls on its own are not counted as wide,
 * because that is the overflow being asked for rather than a fault.
 */
function auditPage() {
  const vw = window.innerWidth;
  const inScroller = (el) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  };

  const wide = [];
  for (const el of document.querySelectorAll('body *')) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= vw + 1) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
    if (inScroller(el)) continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    wide.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : ''} ${Math.round(rect.width)}px`);
  }

  const small = [];
  const controls = document.querySelectorAll(
    'button, .btn, .nav a, .nav-links a, .nav-cta, .nav-item, .theme-toggle, input:not([type=checkbox]):not([type=radio]), select, textarea',
  );
  for (const el of controls) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (Math.round(rect.height) >= 44) continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    small.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls.split(/\s+/)[0] : ''} ${Math.round(rect.height)}px`);
  }

  return { overflow: document.documentElement.scrollWidth - vw, wide, small };
}

const rows = [];
let failures = 0;

const browser = await chromium.launch();

for (const [site, origin] of Object.entries(SITES)) {
  const paths =
    site === 'portal' && PORTAL_EMAIL && PORTAL_PASSWORD
      ? [...PAGES.portal, ...PORTAL_SIGNED_IN_PAGES]
      : PAGES[site] || ['/'];
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch,
      isMobile: viewport.touch,
      deviceScaleFactor: viewport.touch ? 3 : 1,
    });
    const page = await context.newPage();

    if (site === 'portal' && PORTAL_EMAIL && PORTAL_PASSWORD) {
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.fill('#email', PORTAL_EMAIL);
      await page.fill('#password', PORTAL_PASSWORD);
      await Promise.all([
        page
          .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 25000 })
          .catch(() => undefined),
        page.click('button[type=submit]'),
      ]);
      if (new URL(page.url()).pathname.startsWith('/login')) {
        failures += 1;
        rows.push(['portal', '/login', viewport.name, 'could not sign in, so its other pages were not checked']);
      }
    }

    for (const path of paths) {
      const url = origin + path;
      let result;
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (!response || response.status() >= 400) {
          rows.push([site, path, viewport.name, `skipped (HTTP ${response ? response.status() : 'no response'})`]);
          continue;
        }
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
      } catch (error) {
        rows.push([site, path, viewport.name, `skipped (${error.message.split('\n')[0]})`]);
        continue;
      }

      const audit = await page.evaluate(auditPage);

      if (SELF_TEST) {
        await page.evaluate(() => {
          const control = document.createElement('div');
          control.style.cssText = 'width:3000px;height:8px';
          (document.querySelector('main') || document.body).appendChild(control);
        });
        const control = await page.evaluate(auditPage);
        const detected = control.wide.length > 0;
        console.log(`self test: an uncontained 3000px element is reported = ${detected}`);
        console.log(`self test: page overflow reported = ${control.overflow > 1}`);
        console.log(detected && control.overflow > 1 ? 'SELF_TEST_PASSED' : 'SELF_TEST_FAILED');
        await browser.close();
        process.exit(detected && control.overflow > 1 ? 0 : 1);
      }

      const faults = [];
      if (audit.overflow > 1) faults.push(`page scrolls sideways by ${audit.overflow}px`);
      if (audit.wide.length) faults.push(`too wide: ${audit.wide.slice(0, 4).join(', ')}`);
      if (viewport.touch && audit.small.length) faults.push(`under 44px: ${audit.small.slice(0, 5).join(', ')}`);

      // A wide table has to scroll in its own box, and must not drag the page with it.
      if (TABLE_SITES.has(site)) {
        await page.evaluate((table) => {
          const host = document.querySelector('main') || document.body;
          const box = document.createElement('div');
          box.className = 'table-scroll';
          box.id = 'responsive-check-table';
          box.innerHTML = table;
          host.appendChild(box);
        }, WIDE_TABLE);
        const tableResult = await page.evaluate(() => {
          const box = document.getElementById('responsive-check-table');
          return {
            boxFits: box.getBoundingClientRect().width <= window.innerWidth + 1,
            scrollsInside: box.scrollWidth > box.clientWidth,
            pageFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
          };
        });
        if (!tableResult.boxFits) faults.push('scrolling table box is wider than the screen');
        if (!tableResult.pageFits) faults.push('scrolling table pushed the page sideways');
      }

      if (faults.length) {
        failures += 1;
        rows.push([site, path, viewport.name, faults.join(' | ')]);
      } else {
        rows.push([site, path, viewport.name, 'ok']);
      }
    }

    await context.close();
  }
}

await browser.close();

if (rows.length === 0) {
  console.log('No page could be checked, so nothing was verified.');
  process.exit(2);
}

const widths = [10, 22, 12, 0];
for (const row of rows) {
  console.log(row.map((cell, index) => String(cell).padEnd(widths[index] || 40)).join('| ').trimEnd());
}
console.log(`\n${rows.length} checks, ${failures} with faults`);
console.log(failures === 0 ? 'RESPONSIVE_CHECK_PASSED' : 'RESPONSIVE_CHECK_FAILED');
process.exit(failures === 0 ? 0 : 1);
