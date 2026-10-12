import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const srv = Bun.serve({ port: 0, fetch: () => new Response("<title>local</title><h1 id=a>live</h1><script>setInterval(()=>document.getElementById('a').textContent=Date.now(),50)</script>", { headers: { "content-type": "text/html" } }) });
const dir = mkdtempSync(join(tmpdir(), "pw2-"));
const ctx = await chromium.launchPersistentContext(join(dir, "p"), { headless: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:${srv.port}/`);
const t = Date.now(); let bytes = 0;
for (let i = 0; i < 10; i++) { bytes += (await page.screenshot({ type: "jpeg", quality: 60 })).length; }
const ms = (Date.now() - t) / 10;
const title = await page.title();
await ctx.close(); srv.stop(true);
console.log(JSON.stringify({ title, avgShotMs: ms, avgBytes: bytes / 10 }));
