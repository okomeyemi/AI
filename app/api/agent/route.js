import { NextResponse } from "next/server";
import { checkAccess, runnerFetch, pngSize, validateInstruction } from "../../../lib/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You control an Android phone by looking at a screenshot and choosing ONE next action toward the user's goal.
Reply with ONLY a JSON object, no prose, no markdown fences:
{"action":"click"|"type"|"swipe"|"done","x":number,"y":number,"x2":number,"y2":number,"text":string,"reason":string}
Rules:
- Coordinates are pixels in the screenshot's own coordinate space (origin top-left). Click the center of the target.
- "type": put the text to enter in "text" (the field should already be focused; otherwise click it first).
- "swipe": from (x,y) to (x2,y2), e.g. scroll down = swipe from lower to upper.
- "done": the goal is already achieved or cannot be done; explain in "reason".
- Output exactly one action. Omit fields that don't apply.`;

export async function POST(req) {
  if (!checkAccess(req)) return NextResponse.json({ error: "Invalid access key" }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 500 });
  }

  try {
    const form = await req.formData();
    const prompt = String(form.get("prompt") || "").trim();
    if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    let buf, mediaType = "image/png";
    const file = form.get("screenshot");
    if (file && typeof file !== "string" && file.size > 0) {
      buf = Buffer.from(await file.arrayBuffer());
      mediaType = file.type || "image/png";
    } else {
      const r = await runnerFetch("/screenshot");
      if (!r.ok) throw new Error(`Runner screenshot failed (${r.status})`);
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (buf.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Screenshot is over 5 MB. Use a smaller image." }, { status: 413 });
    }

    const size = pngSize(buf) || { w: Number(form.get("width")) || 0, h: Number(form.get("height")) || 0 };
    const dims = size.w ? `The screenshot is ${size.w}x${size.h} pixels.` : "";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
        max_tokens: 400,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
              { type: "text", text: `${dims}\nGoal: ${prompt}` },
            ],
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Claude API error (${res.status})`);

    const raw = (data.content || []).map((c) => c.text || "").join("");
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Claude did not return JSON");
    const instruction = validateInstruction(JSON.parse(match[0]));

    return NextResponse.json({ instruction, screen: size });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Agent failed" }, { status: 500 });
  }
}
