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
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(JSON.stringify(data.error)));
    else resolve(data.result ?? {});
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
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
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
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

  const sizes = [
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
    const check = await evaluate(`(() => {
      const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const text = document.body.innerText;
      return {
        title: document.querySelector('.detail-title h1')?.textContent || '',
        accountCards: document.querySelectorAll('.account-card').length,
        hasGrid: Boolean(document.querySelector('.vault-grid')),
        hasSelected: Boolean(document.querySelector('.site-row.selected')),
        scrollWidth,
        innerWidth: window.innerWidth,
        hasGoogle: text.includes('Google'),
        hasPrimary: text.includes('user.primary@gmail.com')
      };
    })()`);
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    });
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
