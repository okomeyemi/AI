"use client";
import { useEffect, useRef, useState } from "react";

const time = () => new Date().toLocaleTimeString([], { hour12: false });

function describe(i) {
  if (i.action === "click") return `Click (${i.x}, ${i.y})`;
  if (i.action === "type") return `Type "${i.text}"`;
  if (i.action === "swipe") return `Swipe from (${i.x}, ${i.y})${i.x2 != null ? ` to (${i.x2}, ${i.y2})` : ""}`;
  return `Done${i.reason ? `: ${i.reason}` : ""}`;
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [pending, setPending] = useState(null);
  const [listening, setListening] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [runnerUp, setRunnerUp] = useState(null);
  const logRef = useRef(null);
  const fileRef = useRef(null);

  const headers = () => (accessKey ? { "x-access-key": accessKey } : {});
  const log = (msg, level = "run") => setLogs((l) => [...l.slice(-199), { t: time(), msg, level }]);

  // Load saved settings + register service worker
  useEffect(() => {
    try {
      setAccessKey(localStorage.getItem("acc.key") || "");
      setHistory(JSON.parse(localStorage.getItem("acc.history") || "[]"));
    } catch {}
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem("acc.history", JSON.stringify(history.slice(0, 50))); } catch {}
  }, [history]);

  useEffect(() => {
    try { localStorage.setItem("acc.key", accessKey); } catch {}
    fetch("/api/dispatch", { headers: headers() })
      .then((r) => r.json())
      .then((d) => setRunnerUp(!!d.ok))
      .catch(() => setRunnerUp(false));
  }, [accessKey]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs]);

  const patchHistory = (id, status) =>
    setHistory((h) => h.map((e) => (e.id === id ? { ...e, status } : e)));

  async function execute(entry) {
    const { instruction } = entry;
    setPending(null);
    if (instruction.action === "done") {
      patchHistory(entry.id, "skipped");
      return log(describe(instruction), "ok");
    }
    try {
      log(`Executing ${instruction.action}`);
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers() },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      patchHistory(entry.id, "sent");
      log("Runner confirmed the action", "ok");
    } catch (e) {
      patchHistory(entry.id, "failed");
      log(e.message, "err");
    }
  }

  async function run() {
    const goal = prompt.trim();
    if (!goal || busy) return;
    setBusy(true);
    setPending(null);
    try {
      const fd = new FormData();
      fd.append("prompt", goal);
      if (file) {
        log("Reading uploaded screenshot");
        const bmp = await createImageBitmap(file);
        fd.append("screenshot", file);
        fd.append("width", bmp.width);
        fd.append("height", bmp.height);
      } else {
        log("Capturing screen from runner");
      }
      log("Analyzing UI with Claude Vision");
      const res = await fetch("/api/agent", { method: "POST", headers: headers(), body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);

      const entry = { id: Date.now(), time: time(), prompt: goal, instruction: data.instruction, status: "planned" };
      setHistory((h) => [entry, ...h]);
      log(`Planned: ${describe(data.instruction)}`, "ok");
      if (auto || data.instruction.action === "done") await execute(entry);
      else {
        setPending(entry);
        log("Waiting for your confirmation");
      }
    } catch (e) {
      log(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return log("Voice input isn't supported in this browser. Type the command instead.", "err");
    const r = new SR();
    r.lang = "en-US";
    r.onresult = (e) => setPrompt(e.results[0][0].transcript);
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
  }

  return (
    <main>
      <header>
        <h1>Control Center</h1>
        <div className="status">
          <span className={`dot ${runnerUp === null ? "" : runnerUp ? "on" : "off"}`} />
          {runnerUp === null ? "Checking runner" : runnerUp ? "Runner online" : "Runner offline"}
        </div>
      </header>

      <section className="panel">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell your device what to do, e.g. “Open Settings and turn on dark mode”"
        />
        <div className="row">
          <button className={listening ? "rec" : ""} onClick={listen} aria-label="Dictate command">
            {listening ? "Listening…" : "Voice"}
          </button>
          <button onClick={() => fileRef.current?.click()}>Screenshot</button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <span className="file grow">{file ? file.name : "Using runner capture"}</span>
        </div>
        <div className="row">
          <label className="toggle grow">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Run actions without asking
          </label>
          <button className="primary" disabled={busy || !prompt.trim()} onClick={run}>
            {busy ? "Working…" : "Run command"}
          </button>
        </div>
      </section>

      {pending && (
        <section className="panel confirm">
          <p>{describe(pending.instruction)}</p>
          <div className="row">
            <button className="primary grow" onClick={() => execute(pending)}>Send to device</button>
            <button onClick={() => { patchHistory(pending.id, "skipped"); setPending(null); log("Action discarded"); }}>
              Discard
            </button>
          </div>
        </section>
      )}

      <section>
        <h2>Live log</h2>
        <div className="panel log" ref={logRef}>
          {logs.length === 0 && <p className="empty">Agent activity will appear here.</p>}
          {logs.map((l, i) => (
            <div key={i} className={l.level}>
              <time>{l.t}</time>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>History</h2>
        {history.length === 0 ? (
          <p className="empty">No commands yet. Run one above.</p>
        ) : (
          <ul className="hist">
            {history.map((h) => (
              <li key={h.id}>
                <div className="top">
                  <span>{h.time}</span>
                  <span className={`tag ${h.status}`}>{h.status}</span>
                </div>
                <div className="cmd">{h.prompt}</div>
                <div className="act">{describe(h.instruction)}</div>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <div className="row"><button onClick={() => setHistory([])}>Clear history</button></div>
        )}
      </section>

      <details>
        <summary>Settings</summary>
        <input
          type="password"
          placeholder="Access key (only if ACCESS_KEY is set on the server)"
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
        />
      </details>
    </main>
  );
}
