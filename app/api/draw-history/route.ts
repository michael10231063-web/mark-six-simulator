import { NextResponse } from "next/server";
import { fetchDrawHistory } from "@/lib/draw-history.mjs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await fetchDrawHistory(), {headers:{"Cache-Control":"no-store"}}); }
  catch { return NextResponse.json({error:"Draw history unavailable"},{status:503,headers:{"Cache-Control":"no-store"}}); }
}
