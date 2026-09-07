import { NextResponse } from "next/server";
import { fetchDrawHistory } from "@/lib/draw-history.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const history = await fetchDrawHistory();
    return NextResponse.json(history.draws[0], { headers: { "Cache-Control": "no-store" } });
  } catch {
    // An error must not silently replace the browser's newer saved draw.
    return NextResponse.json({ error: "Latest result unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
