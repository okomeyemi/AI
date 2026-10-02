export function checkAccess(req) {
  const key = process.env.ACCESS_KEY;
  if (!key) return true;
  return req.headers.get("x-access-key") === key;
}

export async function runnerFetch(path, init = {}) {
  const base = process.env.RUNNER_URL;
  if (!base) throw new Error("RUNNER_URL is not set on the server");
  return fetch(base.replace(/\/$/, "") + path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${process.env.RUNNER_SECRET || ""}`,
    },
    signal: AbortSignal.timeout(15000),
  });
}

export function pngSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  return null;
}

const ACTIONS = ["click", "type", "swipe", "done"];

export function validateInstruction(i) {
  if (!i || typeof i !== "object" || !ACTIONS.includes(i.action)) {
    throw new Error("Invalid instruction: unknown action");
  }
  const num = (v) => Number.isFinite(Number(v));
  if ((i.action === "click" || i.action === "swipe") && !(num(i.x) && num(i.y))) {
    throw new Error(`Invalid instruction: ${i.action} needs numeric x and y`);
  }
  if (i.action === "type" && typeof i.text !== "string") {
    throw new Error("Invalid instruction: type needs text");
  }
  return {
    action: i.action,
    x: Math.round(Number(i.x) || 0),
    y: Math.round(Number(i.y) || 0),
    ...(i.action === "swipe" && num(i.x2) && num(i.y2)
      ? { x2: Math.round(Number(i.x2)), y2: Math.round(Number(i.y2)) }
      : {}),
    text: typeof i.text === "string" ? i.text : "",
    ...(i.reason ? { reason: String(i.reason) } : {}),
  };
}
