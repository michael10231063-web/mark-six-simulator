import { NextResponse } from "next/server";
import { fetchOfficialResult } from "@/lib/official-result.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await fetchOfficialResult(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    // An error must not silently replace the browser's newer saved draw.
    return NextResponse.json({ error: "Latest result unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
