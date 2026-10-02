import { NextResponse } from "next/server";
import { checkAccess, runnerFetch, validateInstruction } from "../../../lib/server";

export const runtime = "nodejs";

// Webhook trigger: POST { "instruction": { action, x, y, text } } (or the bare instruction)
export async function POST(req) {
  if (!checkAccess(req)) return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  try {
    const body = await req.json();
    const instruction = validateInstruction(body.instruction || body);
    const r = await runnerFetch("/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(instruction),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(out.error || `Runner error (${r.status})`);
    return NextResponse.json({ ok: true, runner: out });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Runner health check (drives the status dot in the UI)
export async function GET(req) {
  if (!checkAccess(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const r = await runnerFetch("/health");
    return NextResponse.json({ ok: r.ok });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
