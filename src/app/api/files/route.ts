import { NextResponse } from "next/server";
import { runJigga, runJiggaJson } from "@/lib/jigga-cli";

const BASE: Record<string, string[]> = { agent: ["agents"], team: ["team"] };

/** GET ?kind=&id=            → file listing (required/optional/missing)
 *  GET ?kind=&id=&name=      → one file's content
 *  PUT {kind, id, name, content} → write (workspace-confined + audited in core) */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = BASE[url.searchParams.get("kind") ?? ""];
  const id = (url.searchParams.get("id") ?? "").trim();
  const name = (url.searchParams.get("name") ?? "").trim();
  if (!base || !id || id.startsWith("-") || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "kind and id required" }, { status: 400 });
  }
  try {
    if (!name) {
      const files = await runJiggaJson<unknown[]>([...base, "files", id, "--json"]);
      return NextResponse.json({ ok: true, files });
    }
    const res = await runJigga([...base, "file", "get", id, name, "--json"]);
    if (!res.ok) return NextResponse.json({ ok: true, content: "", missing: true });
    const parsed = JSON.parse(res.stdout) as { content?: string };
    return NextResponse.json({ ok: true, content: parsed.content ?? "" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: string; id?: string; name?: string; content?: string;
  };
  const base = BASE[String(body.kind ?? "")];
  const id = String(body.id ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!base || !id || !name || id.startsWith("-") || name.startsWith("-")) {
    return NextResponse.json({ ok: false, error: "kind, id and name required" }, { status: 400 });
  }
  const res = await runJigga([...base, "file", "set", id, name, "--content", String(body.content ?? "")]);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.stderr.trim() || res.stdout.trim() || "write failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
