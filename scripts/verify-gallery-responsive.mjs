import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = process.env.SIGIL_GALLERY_URL ?? 'http://127.0.0.1:5173/dev/gallery';
const screenshotDir = join(import.meta.dirname, '..', 'docs', 'screenshots');
const axeSource = await readFile(
  join(import.meta.dirname, '..', 'frontend', 'node_modules', 'axe-core', 'axe.min.js'),
  'utf8',
);
const chromePath = process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = await mkdtemp(join(tmpdir(), 'sigil-responsive-chrome-'));
const browser = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-default-apps',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  '--window-size=1280,1000',
  'about:blank',
], { stdio: 'ignore' });
const browserClosed = new Promise((resolve) => {
  if (browser.exitCode !== null) {
    resolve();
  } else {
    browser.once('exit', resolve);
  }
});

let socket;
let nextId = 0;
const pending = new Map();
const checks = [];
const consoleErrors = [];
const axeFindings = [];
const stateHeights = {};
const pageStateHeights = {};
let axeStateCount = 0;
let screenshotCount = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForEndpoint() {
  const activePortPath = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(activePortPath, 'utf8')).trim().split(/\r?\n/);
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return { port, version: await response.json() };
    } catch {
      await delay(100);
    }
  }
  throw new Error('Headless Chrome did not expose a DevTools endpoint.');
}

async function command(method, params = {}) {
  const id = ++nextId;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome DevTools command timed out: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
  });
  socket.send(JSON.stringify({ id, method, params }));
  const response = await result;
  if (response.error) throw new Error(`${method}: ${response.error.message}`);
  return response.result;
}

function connectPage(webSocketUrl) {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(webSocketUrl);
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', reject);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args.map((argument) =>
          argument.value ?? argument.description ?? '[unserializable console error]',
        ).join(' '));
      }
      if (message.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text ?? 'Uncaught browser exception');
      }
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        consoleErrors.push(message.params.entry.text);
      }
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      item.resolve(message);
    });
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForGallery() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("Boolean(document.querySelector('[data-testid=\"create-exam-gallery\"]'))")) return;
    await delay(100);
  }
  throw new Error('The gallery did not render.');
}

async function click(expression) {
  const clicked = await evaluate(expression);
  assert(clicked, `Could not find gallery control: ${expression}`);
  await delay(100);
}

async function auditAxe(name, selector) {
  const root = selector ? `document.querySelector(${JSON.stringify(selector)})` : 'document';
  const violations = await evaluate(`axe.run(${root}).then(({ violations }) =>
    violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    })),
  )`);
  axeStateCount += 1;
  for (const violation of violations) {
    const key = JSON.stringify({
      id: violation.id,
      nodes: violation.nodes.map((node) => [node.target, node.summary]),
    });
    if (!axeFindings.some((finding) => finding.key === key)) {
      axeFindings.push({ key, screenshot: name, ...violation });
    }
  }
}

async function capture(name, selector) {
  const rect = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Screenshot element not found: ' + ${JSON.stringify(selector)});
    if (${JSON.stringify(selector)} === 'body') {
      window.scrollTo(0, 0);
    } else {
      element.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
    };
  })()`);
  assert(rect.width > 0 && rect.height > 0, `Screenshot element is empty: ${selector}`);
  const layoutState = name.match(/^(desktop|mobile)-(.+)-(loading|ready|populated)$/);
  if (layoutState) {
    const pageName = layoutState[2];
    const layoutRoot = pageName.includes('participants')
      ? '#fa-05-pages > div:nth-of-type(1)'
      : pageName.includes('docket')
        ? '#fa-05-pages > div:nth-of-type(2)'
        : pageName.includes('create-exam')
          ? '[data-testid="create-exam-gallery"]'
          : pageName.includes('key-ceremony')
            ? '[data-testid="key-ceremony-gallery"]'
            : pageName.includes('command-centre')
              ? '[data-testid="command-centre-gallery"]'
              : pageName.includes('fa09-setter-assignments')
                ? '[data-testid="setter-assignments-preview"]'
                : pageName.includes('fa09-question-composer')
                  ? '[data-testid="question-composer-preview"]'
                  : pageName.includes('fa10-holder-assignments')
                    ? '[data-testid="holder-assignments-preview"]'
                    : pageName.includes('fa10-holder-console')
                      ? '[data-testid="holder-console-preview"]'
                      : null;
    const measuredHeight = layoutRoot
      ? await evaluate(`document.querySelector(${JSON.stringify(layoutRoot)})?.getBoundingClientRect().height ?? null`)
      : rect.height;
    const pageStateSelector = pageName.includes('participants')
      ? '#fa-05-pages > div:nth-of-type(1) .sigil-page-container'
      : pageName.includes('docket')
        ? '#fa-05-pages > div:nth-of-type(2) .sigil-page-container'
        : pageName.includes('create-exam')
          ? '#fa-06-pages .create-exam__state, #fa-06-pages .create-exam'
          : pageName.includes('key-ceremony')
            ? '#fa-06-pages .key-ceremony__state, #fa-06-pages .key-ceremony'
            : pageName.includes('command-centre')
              ? '#fa-07-command-centre .command-centre__state, #fa-07-command-centre .command-centre'
              : pageName.includes('fa09-setter-assignments')
                ? '#fa-09-pages [data-testid="setter-assignments-preview"] .setter-state, #fa-09-pages [data-testid="setter-assignments-preview"] .setter-page'
                : pageName.includes('fa09-question-composer')
                  ? '#fa-09-pages [data-testid="question-composer-preview"] .setter-state, #fa-09-pages [data-testid="question-composer-preview"] .question-composer'
                  : pageName.includes('fa10-holder-assignments')
                    ? '#fa-10-pages [data-testid="holder-assignments-preview"] .holder-state, #fa-10-pages [data-testid="holder-assignments-preview"] .holder-page'
                    : pageName.includes('fa10-holder-console')
                      ? '#fa-10-pages [data-testid="holder-console-preview"] .holder-state, #fa-10-pages [data-testid="holder-console-preview"] .holder-console'
                      : null;
    const pageStateHeight = pageStateSelector
      ? await evaluate(`document.querySelector(${JSON.stringify(pageStateSelector)})?.getBoundingClientRect().height ?? null`)
      : null;
    const key = `${layoutState[1]}-${pageName.replace(/-(loading|ready|populated)$/, '')}`;
    stateHeights[key] ??= {};
    stateHeights[key][layoutState[3] === 'populated' ? 'ready' : layoutState[3]] = measuredHeight;
    pageStateHeights[key] ??= {};
    pageStateHeights[key][layoutState[3] === 'populated' ? 'ready' : layoutState[3]] = pageStateHeight;
  }
  await evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const image = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  await writeFile(join(screenshotDir, `${name}.png`), Buffer.from(image.data, 'base64'));
  screenshotCount += 1;
  await auditAxe(name);
  if (name.startsWith('mobile-') || name.startsWith('desktop-')) {
    const expectedWidth = name.startsWith('mobile-') ? 390 : 1280;
    const pageMetrics = await evaluate(`(() => ({
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowingElements: [...document.querySelectorAll('body *')]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            testId: element.getAttribute('data-testid'),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        })
        .filter((element) => element.right > document.documentElement.clientWidth + 1)
        .slice(0, 12),
    }))()`);
    assert(
      pageMetrics.innerWidth === expectedWidth && pageMetrics.scrollWidth <= pageMetrics.clientWidth,
      `Horizontal page scrolling or wrong viewport at ${name}: ${JSON.stringify(pageMetrics)}`,
    );
  }
  if (name.endsWith('participants-populated') || name.endsWith('docket-populated')) {
    const tableMetrics = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      const wrapper = root?.querySelector('.sigil-ledger-table-wrap');
      return wrapper ? {
        overflowX: getComputedStyle(wrapper).overflowX,
        clientWidth: wrapper.clientWidth,
        scrollWidth: wrapper.scrollWidth,
      } : null;
    })()`);
    assert(tableMetrics?.overflowX === 'auto', `Wide ${name} table lacks its own horizontal scroll container.`);
    if (name.startsWith('mobile-')) {
      assert(
        tableMetrics.scrollWidth > tableMetrics.clientWidth,
        `Expected ${name} table to scroll within its container: ${JSON.stringify(tableMetrics)}`,
      );
      const touchTargets = await evaluate(`(() => {
        const root = document.querySelector('#fa-05-pages');
        const buttons = name => [...root.querySelectorAll(name)].map((item) => item.getBoundingClientRect().height);
        return {
          register: root.querySelector('.participants-page-header button')?.getBoundingClientRect().height ?? 0,
          roleFilters: buttons('.participants-role-filter button'),
          revokeButtons: buttons('.participants-actions button'),
          docketCreate: root.querySelector('.docket-page-header button')?.getBoundingClientRect().height ?? 0,
          docketFilters: buttons('.docket-state-filter button'),
          docketSearch: root.querySelector('.docket-search input')?.getBoundingClientRect().height ?? 0,
        };
      })()`);
      const touchTargetsReady = name.includes('participants')
        ? touchTargets.register >= 44 &&
          touchTargets.roleFilters.every((height) => height >= 44) &&
          touchTargets.revokeButtons.every((height) => height >= 44)
        : touchTargets.docketCreate >= 44 &&
          touchTargets.docketFilters.every((height) => height >= 44) &&
          touchTargets.docketSearch >= 44;
      assert(touchTargetsReady, `Mobile page controls are smaller than 44px: ${JSON.stringify(touchTargets)}`);
    }
  }
  if (name === 'mobile-fa09-setter-assignments-ready') {
    const heights = await evaluate(`(() => [...document.querySelectorAll('.setter-page .setter-table .sigil-button')]
      .map((element) => element.getBoundingClientRect().height))()`);
    assert(heights.length > 0 && heights.every((height) => height >= 44), `Setter assignment touch targets are under 44px: ${JSON.stringify(heights)}`);
  }
  if (name === 'mobile-fa09-question-composer-ready') {
    const heights = await evaluate(`(() => [
      ...document.querySelectorAll('.question-composer .sigil-input, .question-composer .setter-section-select select, .question-composer .question-composer__file input, .question-composer .question-composer__option > label, .question-composer .question-composer__form .sigil-button'),
    ].map((element) => element.getBoundingClientRect().height))()`);
    assert(heights.length > 0 && heights.every((height) => height >= 44), `Question composer touch targets are under 44px: ${JSON.stringify(heights)}`);
  }
  if (name === 'mobile-fa10-holder-assignments-ready') {
    const heights = await evaluate(`(() => [...document.querySelectorAll('.holder-table .sigil-button')]
      .map((element) => element.getBoundingClientRect().height))()`);
    assert(heights.length > 0 && heights.every((height) => height >= 44), `Holder assignment touch targets are under 44px: ${JSON.stringify(heights)}`);
  }
  if (name === 'mobile-fa10-holder-console-flow-ready-to-release') {
    const heights = await evaluate(`(() => [
      ...document.querySelectorAll('.holder-release__action input[type="password"], .holder-release__action .sigil-button'),
    ].map((element) => element.getBoundingClientRect().height))()`);
    assert(heights.length > 0 && heights.every((height) => height >= 44), `Holder release touch targets are under 44px: ${JSON.stringify(heights)}`);
  }
}

async function viewportMetrics(width) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(200);
  const metrics = await evaluate(`(() => {
    const root = document.documentElement;
    const stamp = document.querySelector('#fa-07-command-centre .sigil-state-stamp');
    const grid = document.querySelector('#fa-07-command-centre .command-centre__grid');
    const wizardLayout = document.querySelector('#fa-06-pages .create-exam__layout');
    const rosette = document.querySelector('#fa-07-command-centre .command-centre__rosette');
    const tableScroll = document.querySelector('#fa-05-pages .participants-view__table-scroll, #fa-05-pages .docket-view__table-scroll, #fa-07-command-centre .command-centre__table-scroll');
    const topBar = document.querySelector('.sigil-top-bar, .sigil-topbar, header');
    return {
      innerWidth,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      topBarWidth: topBar?.getBoundingClientRect().width ?? null,
      rosetteWidth: rosette?.getBoundingClientRect().width ?? null,
      wizardColumns: wizardLayout ? getComputedStyle(wizardLayout).gridTemplateColumns : null,
      commandColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      stateStampTransform: stamp ? getComputedStyle(stamp).transform : null,
      tableScrollWidth: tableScroll?.scrollWidth ?? null,
      tableClientWidth: tableScroll?.clientWidth ?? null,
      pageTables: [...document.querySelectorAll('#fa-05-pages .sigil-ledger-table-wrap')].map((table) => ({
        scrollWidth: table.scrollWidth,
        clientWidth: table.clientWidth,
        overflowX: getComputedStyle(table).overflowX,
      })),
      topBarHeight: topBar?.getBoundingClientRect().height ?? null,
      roleFilterButtonHeight: document.querySelector('#fa-05-pages .participants-role-filter button')?.getBoundingClientRect().height ?? null,
      docketSearchHeight: document.querySelector('#fa-05-pages .docket-search input')?.getBoundingClientRect().height ?? null,
      viewportHeight: innerHeight,
    };
  })()`);
  assert(metrics.innerWidth === width, `Expected innerWidth ${width}, got ${metrics.innerWidth}`);
  assert(
    metrics.scrollWidth <= metrics.clientWidth,
    `Horizontal page scrolling at ${width}px: ${JSON.stringify(metrics)}`,
  );
  if (width === 1280) {
    assert(metrics.rosetteWidth === 52, `Expected a 52px laptop command-centre Rosette: ${JSON.stringify(metrics)}`);
  } else {
    assert(metrics.rosetteWidth >= 40, `Mobile command-centre Rosette is too small: ${JSON.stringify(metrics)}`);
  }
  checks.push({ width, metrics });
  return metrics;
}

async function captureGalleryStates(prefix) {
  await capture(`${prefix}gallery-shell`, 'body');
  await capture(`${prefix}top-bar`, '.sigil-topbar');

  const participants = "(() => { const section = document.querySelector('#fa-05-pages'); const box = section?.querySelector(':scope > div'); const button = [...(box?.querySelectorAll('button') ?? [])].find((item) => item.textContent.trim() === 'STATE'); if (!button) return false; button.click(); return true; })()";
  for (const state of ['populated', 'loading', 'empty', 'error', 'permission']) {
    await click(participants.replace('STATE', state));
    await capture(`${prefix}participants-${state}`, '#fa-05-pages > div:nth-of-type(1)');
  }

  const docket = "(() => { const section = document.querySelector('#fa-05-pages'); const box = section?.querySelectorAll(':scope > div')[1]; const button = [...(box?.querySelectorAll('button') ?? [])].find((item) => item.textContent.trim() === 'STATE'); if (!button) return false; button.click(); return true; })()";
  for (const state of ['populated', 'loading', 'empty', 'error', 'permission']) {
    await click(docket.replace('STATE', state));
    await capture(`${prefix}docket-${state}`, '#fa-05-pages > div:nth-of-type(2)');
  }

  for (const [state, testId] of [
    ['connect-wallet', 'guard-connect-wallet'],
    ['sign-in', 'guard-sign-in'],
    ['wrong-network', 'guard-wrong-network'],
    ['no-role', 'guard-no-role'],
  ]) {
    await capture(`${prefix}guard-${state}`, `[data-testid="${testId}"]`);
  }

  const wizard = (state) => `(() => {
    const group = document.querySelector('[data-testid="create-exam-gallery"]');
    const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
  for (const state of ['populated', 'loading', 'empty', 'error', 'permission', 'metadata-error', 'created']) {
    await click(wizard(state));
    if (state === 'metadata-error') {
      await click(`(() => { const group = document.querySelector('[data-testid="create-exam-gallery"]'); const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Review and sign'); if (!button) return false; button.click(); return true; })()`);
    }
    const selector = ['loading', 'empty', 'error', 'permission', 'created'].includes(state)
      ? '#fa-06-pages .create-exam__state'
      : '#fa-06-pages .create-exam';
    await capture(`${prefix}create-exam-${state}`, selector);
  }

  await click(wizard('populated'));
  for (const [index, label] of [
    'Details',
    'Sections and quotas',
    'Schedule',
    'Panel and threshold',
    'Setters and centres',
    'Review and sign',
  ].entries()) {
    await click(`(() => { const buttons = [...document.querySelectorAll('#fa-06-pages .create-exam__steps button')]; const button = buttons[${index}]; if (!button) return false; button.click(); return true; })()`);
    await capture(`${prefix}create-exam-step-${index + 1}-${label.toLowerCase().replaceAll(' ', '-')}`, '#fa-06-pages .create-exam');
  }

  const ceremony = (state) => `(() => {
    const group = document.querySelector('[data-testid="key-ceremony-gallery"]');
    const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
  for (const state of ['ready', 'loading', 'empty', 'error', 'permission', 'blocked', 'failed', 'complete']) {
    await click(ceremony(state));
    const selector = ['loading', 'empty', 'error', 'permission'].includes(state)
      ? '#fa-06-pages .key-ceremony__state'
      : '#fa-06-pages .key-ceremony';
    await capture(`${prefix}key-ceremony-${state}`, selector);
  }

  const commandCentre = (groupId, state) => `(() => {
    const group = document.querySelector('[data-testid="${groupId}"]');
    const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
  for (const state of ['ready', 'loading', 'empty', 'error', 'permission']) {
    await click(commandCentre('command-centre-page-state-controls', state));
    await capture(
      `${prefix}command-centre-page-${state}`,
      state === 'empty'
        ? '#fa-07-command-centre .sigil-empty-state'
        : state === 'ready'
          ? '#fa-07-command-centre .command-centre'
          : '#fa-07-command-centre .command-centre__state',
    );
  }
  for (const state of ['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled']) {
    await click(commandCentre('command-centre-page-state-controls', 'ready'));
    await click(commandCentre('command-centre-chain-state-controls', state));
    if (state === 'Collecting') await click(commandCentre('command-centre-seal-controls', 'quota'));
    await capture(`${prefix}command-centre-${state.toLowerCase()}${state === 'Collecting' ? '-quota-blocked' : ''}`, '#fa-07-command-centre .command-centre');
  }
  for (const state of ['randomness', 'ready']) {
    await click(commandCentre('command-centre-page-state-controls', 'ready'));
    await click(commandCentre('command-centre-chain-state-controls', 'Collecting'));
    await click(commandCentre('command-centre-seal-controls', state));
    await capture(`${prefix}command-centre-collecting-${state}`, '#fa-07-command-centre .command-centre');
  }
  await click(commandCentre('command-centre-page-state-controls', 'ready'));
  await click(commandCentre('command-centre-chain-state-controls', 'Collecting'));
  const cancelInputReady = await evaluate("(() => { const input = document.querySelector('#fa-07-command-centre #command-centre-cancel-confirmation'); if (!input) return false; input.focus(); input.value = ''; return true; })()");
  assert(cancelInputReady, 'Could not focus the command-centre cancellation confirmation field.');
  await command('Input.insertText', { text: 'No. 0007' });
  const cancelEnabled = await evaluate("(() => { const button = [...document.querySelectorAll('#fa-07-command-centre button')].find((item) => item.textContent.trim() === 'Cancel exam'); return Boolean(button && !button.disabled); })()");
  assert(cancelEnabled, 'The typed cancellation confirmation did not enable the cancel button.');
  await capture(`${prefix}command-centre-cancel-confirmed`, '#fa-07-command-centre .command-centre');

  const finalMetrics = await evaluate(`(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    overflowingElements: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          testId: element.getAttribute('data-testid'),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          text: element.innerText?.slice(0, 60) ?? '',
        };
      })
      .filter((element) => element.right > document.documentElement.clientWidth + 1)
      .slice(0, 30),
    tableAncestors: (() => {
      const ancestors = [];
      for (let element = document.querySelector('.sigil-ledger-table'); element && ancestors.length < 10; element = element.parentElement) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        ancestors.push({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          width: Math.round(rect.width),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          minWidth: style.minWidth,
          overflowX: style.overflowX,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        });
      }
      return ancestors;
    })(),
    firstOverflowingDescendants: [...document.querySelectorAll('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const parentRect = element.parentElement?.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 &&
          (!parentRect || parentRect.right <= document.documentElement.clientWidth + 1);
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        testId: element.getAttribute('data-testid'),
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
        parent: element.parentElement?.tagName + '.' + (element.parentElement?.className ?? ''),
        text: element.innerText?.slice(0, 80) ?? '',
      })),
    mainChildren: [...document.querySelector('.sigil-main-content')?.children ?? []].map((element) => ({
      tag: element.tagName,
      className: typeof element.className === 'string' ? element.className : '',
      width: Math.round(element.getBoundingClientRect().width),
      right: Math.round(element.getBoundingClientRect().right),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    })),
  }))()`);
  assert(finalMetrics.innerWidth === Number(prefix === 'desktop-' ? 1280 : 390), 'Viewport changed during gallery capture.');
  if (prefix === 'mobile-') {
    assert(!finalMetrics.pageOverflow, `Mobile gallery has horizontal page overflow: ${JSON.stringify(finalMetrics)}`);
  }
  checks.push({ width: finalMetrics.innerWidth, finalMetrics });
}

async function clickControl(testId, state) {
  await click(`(() => {
    const controls = document.querySelector('[data-testid="${testId}"]');
    const button = [...(controls?.querySelectorAll('button') ?? [])]
      .find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`);
}

async function capturePageStateSet(prefix, pageName, controlsId, previewSelector, states) {
  for (const state of states) {
    await clickControl(controlsId, state);
    await capture(`${prefix}${pageName}-${state}`, `[data-testid="${previewSelector}"]`);
  }
}

async function dispatchKey(key, code, keyCode) {
  await command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
  });
  await command('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
  });
}

async function auditKeyboardOrder(selector, label) {
  const count = await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(selector)});
    if (!root) return 0;
    return [...root.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]):not([role="tablist"])',
    )].filter((element) =>
      !element.matches(':disabled') &&
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden',
    ).length;
  })()`);
  if (!count) return;

  await evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(selector)});
    const first = [...root.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]):not([role="tablist"])',
    )].find((element) =>
      !element.matches(':disabled') &&
      element.tabIndex >= 0 &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden',
    );
    first?.focus();
  })()`);
  for (let index = 0; index < count; index += 1) {
    if (index > 0) {
      const focus = await evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(selector)});
        const items = [...root.querySelectorAll(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]):not([role="tablist"])',
        )].filter((element) =>
          !element.matches(':disabled') &&
          element.tabIndex >= 0 &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== 'hidden',
        );
        const active = document.activeElement;
        const expected = items[${index}];
        const style = getComputedStyle(active);
        const probe = document.createElement('span');
        probe.style.color = 'var(--sigil-color-marigold)';
        document.body.append(probe);
        const marigold = getComputedStyle(probe).color;
        probe.remove();
        return {
          matches: active === expected,
          visible: active.getClientRects().length > 0,
          ring: style.outlineStyle !== 'none' &&
            style.outlineWidth !== '0px' &&
            style.outlineColor === marigold,
          active: active.tagName + ' ' +
            (active.getAttribute('aria-label') ?? active.textContent.trim().slice(0, 40)),
          expected: expected
            ? expected.tagName + ' ' +
              (expected.getAttribute('aria-label') ?? expected.textContent.trim().slice(0, 40))
            : null,
        };
      })()`);
      assert(
        focus.matches && focus.visible && focus.ring,
        `Keyboard order or marigold focus ring failed for ${label} at control ${index}: ${JSON.stringify(focus)}`,
      );
    }
    await dispatchKey('Tab', 'Tab', 9);
  }
}

async function auditOverlayKeyboard() {
  const dialogTrigger = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Open modal dialog');
    trigger?.focus();
    trigger?.click();
    return Boolean(trigger);
  })()`);
  assert(dialogTrigger, 'Gallery dialog trigger was not found.');
  await delay(100);
  const dialogOpened = await evaluate(
    "Boolean(document.querySelector('[role=\"dialog\"]'))",
  );
  assert(dialogOpened, 'Gallery dialog did not open.');
  await auditAxe(`dialog-open-${await evaluate('innerWidth')}`);
  await dispatchKey('Escape', 'Escape', 27);
  await delay(100);
  const dialogClosedAndRestored = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Open modal dialog');
    return !document.querySelector('[role="dialog"]') &&
      document.activeElement === trigger;
  })()`);
  assert(dialogClosedAndRestored, 'Escape did not close the dialog and restore focus.');

  const popoverTrigger = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Open popover');
    trigger?.focus();
    trigger?.click();
    return Boolean(trigger);
  })()`);
  assert(popoverTrigger, 'Gallery popover trigger was not found.');
  await delay(100);
  const popoverOpened = await evaluate(
    "Boolean(document.querySelector('[data-radix-popper-content-wrapper]'))",
  );
  assert(popoverOpened, 'Gallery popover did not open.');
  await auditAxe(`popover-open-${await evaluate('innerWidth')}`);
  await dispatchKey('Escape', 'Escape', 27);
  await delay(100);
  const popoverClosedAndRestored = await evaluate(`(() => {
    const trigger = [...document.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Open popover');
    return !document.querySelector('[data-radix-popper-content-wrapper]') &&
      document.activeElement === trigger;
  })()`);
  assert(popoverClosedAndRestored, 'Escape did not close the popover and restore focus.');
}

async function auditReducedMotion() {
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await clickControl('command-centre-page-state-controls', 'ready');
  await clickControl('command-centre-chain-state-controls', 'Released');
  const motion = await evaluate(`(() => {
    const elements = [...document.querySelectorAll('body *')];
    const rosette = document.querySelector('#fa-07-command-centre .command-centre__rosette svg');
    const activeAnimations = document.getAnimations().filter((animation) =>
      animation.playState === 'running',
    );
    return {
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      rosetteAnimation: rosette ? getComputedStyle(rosette).animationName : null,
      transitions: elements
        .map((element) => getComputedStyle(element).transitionDuration)
        .flatMap((value) => value.split(','))
        .filter((value) => parseFloat(value) > 0),
      animations: elements
        .map((element) => getComputedStyle(element).animationDuration)
        .flatMap((value) => value.split(','))
        .filter((value) => parseFloat(value) > 0),
      activeAnimations: activeAnimations.length,
    };
  })()`);
  assert(
    motion.reducedMotion &&
      motion.rosetteAnimation === 'none' &&
      motion.transitions.length === 0 &&
      motion.animations.length === 0 &&
      motion.activeAnimations === 0,
    `Reduced motion did not disable all motion: ${JSON.stringify(motion)}`,
  );
  await command('Emulation.setEmulatedMedia', { features: [] });
  return motion;
}

async function auditSelectAndTabsKeyboard() {
  const opened = await evaluate(`(() => {
    const trigger = document.querySelector('#fa-02-primitives [role="combobox"]');
    trigger?.focus();
    return Boolean(trigger);
  })()`);
  assert(opened, 'Gallery select trigger was not found.');
  await dispatchKey('Enter', 'Enter', 13);
  await delay(100);
  await auditAxe(`select-open-${await evaluate('innerWidth')}`, '[role="listbox"]');
  assert(
    await evaluate("Boolean(document.querySelector('[role=\"listbox\"]'))"),
    'Keyboard activation did not open the gallery select.',
  );
  const selectedBeforeArrow = await evaluate(
    "document.querySelector('#fa-02-primitives [role=\"combobox\"]')?.innerText",
  );
  await dispatchKey('ArrowDown', 'ArrowDown', 40);
  await dispatchKey('Enter', 'Enter', 13);
  await delay(100);
  const selectedAfterArrow = await evaluate(
    "document.querySelector('#fa-02-primitives [role=\"combobox\"]')?.innerText",
  );
  assert(
    selectedAfterArrow &&
      selectedAfterArrow !== selectedBeforeArrow &&
      /Section [2-4]: (Chemistry|Botany|Zoology)/.test(selectedAfterArrow),
    `ArrowDown and Enter did not select a different option: before=${selectedBeforeArrow}, after=${selectedAfterArrow}`,
  );
  assert(
    await evaluate("document.activeElement?.matches('#fa-02-primitives [role=\"combobox\"]')"),
    'Select focus did not return to its trigger after choosing an option.',
  );
  await dispatchKey('Enter', 'Enter', 13);
  await delay(100);
  assert(
    await evaluate("Boolean(document.querySelector('[role=\"listbox\"]'))"),
    'Keyboard activation did not reopen the gallery select.',
  );
  await dispatchKey('Escape', 'Escape', 27);
  await delay(100);
  assert(
    !(await evaluate("Boolean(document.querySelector('[role=\"listbox\"]'))")) &&
      await evaluate("document.activeElement?.matches('#fa-02-primitives [role=\"combobox\"]')"),
    'Escape did not close the select and restore focus to its trigger.',
  );

  const tabsFound = await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('#fa-02-primitives [role="tab"]')];
    tabs[0]?.focus();
    return tabs.length > 1;
  })()`);
  assert(tabsFound, 'Gallery tab list was not found.');
  await dispatchKey('ArrowRight', 'ArrowRight', 39);
  await delay(100);
  assert(
    await evaluate(`document.querySelectorAll('#fa-02-primitives [role="tab"]')[1]?.getAttribute('aria-selected') === 'true'`),
    'ArrowRight did not move selection in the gallery tab list.',
  );
}

try {
  await mkdir(screenshotDir, { recursive: true });
  const { port, version } = await waitForEndpoint();
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
  assert(targetResponse.ok, 'Could not create headless Chrome page.');
  const target = await targetResponse.json();
  await connectPage(target.webSocketDebuggerUrl);
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Log.enable');
  await command('Page.navigate', { url: baseUrl });
  await waitForGallery();
  await evaluate(axeSource);

  for (const width of [1280, 390]) {
    const prefix = width === 1280 ? 'desktop-' : 'mobile-';
    const metrics = await viewportMetrics(width);
    await captureGalleryStates(prefix);
    await auditOverlayKeyboard();
    await auditKeyboardOrder('.sigil-topbar', 'top bar');
    await auditKeyboardOrder('#fa-05-pages > div:nth-of-type(1)', 'participants');
    await auditKeyboardOrder('#fa-05-pages > div:nth-of-type(2)', 'docket');
    await auditKeyboardOrder('[data-testid="create-exam-gallery"]', 'create exam gallery');
    await auditKeyboardOrder('[data-testid="key-ceremony-gallery"]', 'key ceremony gallery');
    await auditKeyboardOrder('#fa-07-command-centre .command-centre', 'command centre');
    await clickControl('question-composer-flow-controls', 'idle');
    await clickControl('holder-console-flow-controls', 'setup');
    await capturePageStateSet(prefix, 'fa09-setter-assignments', 'setter-assignments-state-controls', 'setter-assignments-preview', ['ready', 'loading', 'empty', 'error', 'permission']);
    await capturePageStateSet(prefix, 'fa09-question-composer', 'question-composer-state-controls', 'question-composer-preview', ['ready', 'loading', 'empty', 'error', 'permission']);
    await capturePageStateSet(prefix, 'fa10-holder-assignments', 'holder-assignments-state-controls', 'holder-assignments-preview', ['ready', 'loading', 'empty', 'error', 'permission']);
    await capturePageStateSet(prefix, 'fa10-holder-console', 'holder-console-state-controls', 'holder-console-preview', ['ready', 'loading', 'empty', 'error', 'permission']);
    await auditKeyboardOrder('[data-testid="setter-assignments-preview"]', 'setter assignments');
    await auditKeyboardOrder('[data-testid="question-composer-preview"]', 'question composer');
    await auditKeyboardOrder('[data-testid="holder-assignments-preview"]', 'holder assignments');
    await auditKeyboardOrder('[data-testid="holder-console-preview"]', 'holder console');
    await auditKeyboardOrder('#fa-02-primitives', 'gallery primitives');
    await auditSelectAndTabsKeyboard();
    await clickControl('question-composer-state-controls', 'ready');
    for (const state of ['idle', 'encrypt', 'upload', 'sign', 'confirm', 'complete', 'error']) {
      await clickControl('question-composer-flow-controls', state);
      await capture(`${prefix}fa09-question-composer-flow-${state}`, '[data-testid="question-composer-preview"]');
    }
    await clickControl('holder-console-state-controls', 'ready');
    for (const state of ['setup', 'commitment-pending', 'ready-to-release', 'window-closed', 'already-submitted', 'submit-error']) {
      await clickControl('holder-console-flow-controls', state);
      await capture(`${prefix}fa10-holder-console-flow-${state}`, '[data-testid="holder-console-preview"]');
    }
    const reducedMotion = await auditReducedMotion();
    console.log(JSON.stringify({ width, metrics, reducedMotion, screenshots: screenshotCount }));
  }

  const storageState = await evaluate(`(() => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
  }))()`);
  assert(storageState.localStorage.length === 0, `localStorage is not empty: ${JSON.stringify(storageState.localStorage)}`);
  assert(storageState.sessionStorage.length === 0, `sessionStorage is not empty: ${JSON.stringify(storageState.sessionStorage)}`);
  assert(consoleErrors.length === 0, `Browser console errors: ${JSON.stringify(consoleErrors)}`);
  assert(
    axeFindings.length === 0,
    `axe-core reported violations: ${JSON.stringify(axeFindings, null, 2)}`,
  );
  const unbalancedLayouts = Object.entries(stateHeights)
    .filter(([, heights]) =>
      Number.isFinite(heights.loading) &&
      Number.isFinite(heights.ready) &&
      Math.abs(heights.loading - heights.ready) / Math.max(heights.loading, heights.ready) > 0.02,
    )
    .map(([page, heights]) => ({ page, ...heights }));
  assert(
    unbalancedLayouts.length === 0,
    `Loading and ready layouts differ by over 2%: ${JSON.stringify(unbalancedLayouts)}`,
  );
  console.log(JSON.stringify({
    browser: version.Browser,
    screenshotCount,
    storageState,
    consoleErrors,
    axeFindingCount: axeFindings.length,
    stateHeights,
    pageStateHeights,
    axeStateCount,
    checks,
  }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await Promise.race([browserClosed, delay(5_000)]);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
