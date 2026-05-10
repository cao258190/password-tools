import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const cdpOrigin = process.env.CDP_ORIGIN ?? "http://localhost:9224";
const appUrl = process.env.APP_URL ?? "http://localhost:5173";
const email = process.env.DEMO_EMAIL ?? "demo@example.com";
const password = process.env.DEMO_PASSWORD ?? "demo123456";

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
}

async function getPageTarget() {
  const targets = await getJson(`${cdpOrigin}/json/list`);
  const existing = targets.find((item) => item.type === "page");
  if (existing) return existing;
  return getJson(`${cdpOrigin}/json/new?${encodeURIComponent(`${appUrl}/login`)}`, {
    method: "PUT"
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  function rejectPending(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve, reject, timer } = pending.get(data.id);
    clearTimeout(timer);
    pending.delete(data.id);
    if (data.error) reject(new Error(JSON.stringify(data.error)));
    else resolve(data.result ?? {});
  });
  ws.addEventListener("close", () => {
    rejectPending(new Error("CDP WebSocket closed before all commands completed"));
  });
  ws.addEventListener("error", () => {
    rejectPending(new Error("CDP WebSocket error"));
  });

  return {
    send(method, params = {}, timeoutMs = 15000) {
      const id = nextId;
      nextId += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP command timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
      });
    },
    close() {
      ws.close();
    }
  };
}

async function main() {
  const target = await getPageTarget();
  const cdp = await connect(target.webSocketDebuggerUrl);

  const send = cdp.send.bind(cdp);
  const evaluate = async (expression) => {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await send(
          "Runtime.evaluate",
          {
            expression,
            awaitPromise: true,
            returnByValue: true
          },
          30000
        );
        if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
        return result.result?.value;
      } catch (error) {
        lastError = error;
        if (attempt === 0 && error instanceof Error && error.message.includes("timed out")) {
          await delay(500);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: `${appUrl}/login` });
  await delay(1800);
  await evaluate(`
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} })
    }).then(async (response) => {
      if (!response.ok) throw new Error(await response.text());
      return response.text();
    })
  `);
  await send("Page.navigate", { url: `${appUrl}/` });
  await delay(2500);
  await evaluate(`(() => {
    const form = document.querySelector('.vault-unlock-form');
    if (!form) return false;
    const inputs = Array.from(form.querySelectorAll('input[type="password"]'));
    for (const input of inputs) {
      input.value = ${JSON.stringify(password)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    form.requestSubmit();
    return true;
  })()`);
  await delay(1800);

  const sizes = [
    { width: 390, height: 844, name: "ui-check-mobile-home.png", mobile: true, view: "home" },
    { width: 390, height: 844, name: "ui-check-mobile-categories.png", mobile: true, view: "categories" },
    { width: 390, height: 844, name: "ui-check-mobile-sites.png", mobile: true, view: "sites" },
    { width: 390, height: 844, name: "ui-check-mobile-detail.png", mobile: true, view: "detail" },
    { width: 390, height: 844, name: "ui-check-mobile-accounts.png", mobile: true, view: "accounts" },
    { width: 768, height: 1024, name: "ui-check-tablet.png", mobile: true, view: "sites" },
    { width: 1024, height: 682, name: "ui-check-1024.png" },
    { width: 1440, height: 900, name: "ui-check-1440.png" },
    { width: 1920, height: 1080, name: "ui-check-1920.png" }
  ];

  const summary = [];
  for (const size of sizes) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: size.width,
      height: size.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(800);
    if (size.view) {
      await evaluate(`(() => {
        const views = { home: 1, categories: 2, sites: 3, detail: 4, accounts: 5 };
        const index = views[${JSON.stringify(size.view)}];
        const button = document.querySelector(\`.mobile-bottom-nav button:nth-child(\${index})\`);
        if (button && !button.disabled) button.click();
      })()`);
      await delay(400);
    }
    const check = await evaluate(`(() => {
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const text = document.body.innerText;
      const bottomNav = document.querySelector('.mobile-bottom-nav');
      const grid = document.querySelector('.vault-grid');
      const mobileShell = document.querySelector('.mobile-shell');
      const visiblePane = ['home', 'categories', 'sites', 'detail', 'accounts'].find((view) => {
        const selector = {
          home: '.mobile-home-pane',
          categories: '.mobile-pane:not(.mobile-home-pane):not(.mobile-sites-pane):not(.mobile-detail-pane):not(.mobile-accounts-pane)',
          sites: '.mobile-sites-pane',
          detail: '.mobile-detail-pane',
          accounts: '.mobile-accounts-pane'
        }[view];
        const pane = document.querySelector(selector);
        return pane && pane.getClientRects().length > 0;
      }) || '';
      return {
        title: document.querySelector('.detail-title h1')?.textContent || '',
        accountCards: document.querySelectorAll('.account-card, .mobile-account-card').length,
        hasGrid: Boolean(grid),
        gridVisible: grid ? grid.getClientRects().length > 0 : false,
        hasMobileShell: Boolean(mobileShell),
        mobileShellVisible: mobileShell ? mobileShell.getClientRects().length > 0 : false,
        hasSelected: Boolean(document.querySelector('.site-row.selected, .mobile-site-row.selected')),
        scrollWidth,
        innerWidth: window.innerWidth,
        hasHorizontalOverflow: scrollWidth > window.innerWidth + 2,
        bottomNavVisible: bottomNav ? getComputedStyle(bottomNav).display !== 'none' : false,
        visiblePane,
        hasGoogle: text.includes('Google'),
        hasPrimary: text.includes('user.primary@gmail.com')
      };
    })()`);
    const screenshot = await send(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: false
      },
      45000
    );
    const outPath = join(process.cwd(), size.name);
    await writeFile(outPath, Buffer.from(screenshot.data, "base64"));
    const file = await stat(outPath);
    summary.push({ ...size, path: outPath, bytes: file.size, check });
  }

  cdp.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
