// Minimal ADB listener. Run in Termux (pkg install nodejs android-tools) or on any machine with adb.
// RUNNER_SECRET=change-me node runner.js
const http = require("http");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 8787;
const SECRET = process.env.RUNNER_SECRET || "";
const ADB = process.env.ADB_PATH || "adb";
const SERIAL = process.env.ADB_SERIAL;

const adb = (args, encoding = "utf8") =>
  new Promise((resolve, reject) =>
    execFile(ADB, [...(SERIAL ? ["-s", SERIAL] : []), ...args],
      { encoding, maxBuffer: 32 * 1024 * 1024 },
      (err, out, stderr) => (err ? reject(new Error(String(stderr) || err.message)) : resolve(out))));

async function run(i) {
  if (i.action === "click") return adb(["shell", "input", "tap", String(i.x), String(i.y)]);
  if (i.action === "swipe") {
    const x2 = i.x2 ?? i.x, y2 = i.y2 ?? Math.max(0, i.y - 600);
    return adb(["shell", "input", "swipe", String(i.x), String(i.y), String(x2), String(y2), "300"]);
  }
  if (i.action === "type") {
    const t = String(i.text).replace(/ /g, "%s").replace(/'/g, "'\\''");
    return adb(["shell", "input", "text", `'${t}'`]);
  }
  return "noop";
}

const send = (res, code, body, type = "application/json") => {
  res.writeHead(code, { "content-type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};

http.createServer(async (req, res) => {
  if (SECRET && req.headers.authorization !== `Bearer ${SECRET}`) return send(res, 401, { error: "unauthorized" });
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
    if (req.method === "GET" && req.url === "/screenshot") {
      return send(res, 200, await adb(["exec-out", "screencap", "-p"], "buffer"), "image/png");
    }
    if (req.method === "POST" && req.url === "/command") {
      let raw = "";
      for await (const c of req) raw += c;
      const i = JSON.parse(raw);
      console.log(new Date().toISOString(), i);
      await run(i);
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: "not found" });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`Runner listening on :${PORT}`));
