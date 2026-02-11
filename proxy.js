const http = require("http");
const https = require("https");
const fs = require("fs");

const CONFIG = {
  sources: [
    "https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all",
    "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt",
    "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
    "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
    "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
    "https://www.proxy-list.download/api/v1/get?type=http",
    "https://www.proxy-list.download/api/v1/get?type=https",
    "https://proxyspace.pro/http.txt",
    "https://proxyspace.pro/https.txt",
    "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
    "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
    "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
    "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt",
    "https://raw.githubusercontent.com/prxchk/proxy-list/main/http.txt",
    "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt",
    "https://raw.githubusercontent.com/HyperBeats/proxy-list/main/http.txt",
    "https://raw.githubusercontent.com/proxy4parsing/proxy-list/main/http.txt",
    "https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt",
  ],
  timeout: 5000, // Giảm timeout để quét nhanh hơn
  concurrency: 200, // Mức độ ổn định cho server
  outputFile: "proxy.txt",
};

let isSilent = process.argv.includes("--silent");
const log = (...args) => { if (!isSilent) console.log(...args); };

async function fetchUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.on("error", () => resolve(""));
    req.on("timeout", () => { req.destroy(); resolve(""); });
  });
}

async function downloadProxies() {
  log("📥 Downloading proxies...\n");
  const allProxies = new Set();
  const promises = CONFIG.sources.map(async (source) => {
    try {
      const data = await fetchUrl(source);
      const proxies = data
        .split(/[\r\n]+/)
        .map((l) => l.trim())
        .filter((l) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(l));
      proxies.forEach((p) => allProxies.add(p));
      log(`  ✅ Found ${proxies.length} from ${new URL(source).hostname}`);
    } catch {}
  });
  await Promise.all(promises);
  log(`\n📊 Total unique proxies: ${allProxies.size}\n`);
  return [...allProxies];
}

function checkProxy(proxy) {
  return new Promise((resolve) => {
    const [host, port] = proxy.split(":");
    const req = http.request({
      host: host,
      port: parseInt(port),
      method: "GET",
      path: "http://www.google.com/",
      timeout: CONFIG.timeout,
    }, (res) => {
      // FIX: Bỏ kiểm tra body.includes("google") vì dễ bị lỗi nếu gặp Captcha
      // Chỉ cần proxy phản hồi status thành công (200-399) là chấp nhận
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });

    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function runScraper() {
  log(`🚀 Starting Proxy Scraper...`);

  const proxies = await downloadProxies();
  const total = proxies.length;
  if (total === 0) {
    log("❌ No proxies found!");
    return 0;
  }

  const workingProxies = [];
  let checked = 0;

  // Chia nhỏ danh sách để kiểm tra song song (Batching)
  const chunks = [];
  for (let i = 0; i < proxies.length; i += CONFIG.concurrency) {
    chunks.push(proxies.slice(i, i + CONFIG.concurrency));
  }

  for (const chunk of chunks) {
    await Promise.all(chunk.map(async (proxy) => {
      const isLive = await checkProxy(proxy);
      checked++;
      if (isLive) workingProxies.push(proxy);
      
      if (!isSilent) {
        process.stdout.write(`\r🔍 Progress: ${checked}/${total} | ✅ Live: ${workingProxies.length}      `);
      }
    }));
  }

  // FIX: Ghi file một lần duy nhất để tránh lỗi "file chưa tồn tại" hoặc lỗi Permission
  if (workingProxies.length > 0) {
    fs.writeFileSync(CONFIG.outputFile, workingProxies.join("\n") + "\n");
    log(`\n\n✅ Done! Saved ${workingProxies.length} live proxies to ${CONFIG.outputFile}`);
  } else {
    log(`\n\n❌ No live proxies found after checking.`);
  }

  return workingProxies.length;
}

if (require.main === module) {
  runScraper().catch(console.error);
}

module.exports = { runScraper };
