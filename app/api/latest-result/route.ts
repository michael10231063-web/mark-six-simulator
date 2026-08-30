import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const query = `fragment lotteryDrawsFragment on LotteryDraw { id year no drawDate status lotteryPool { lotteryPrizes { type winningUnit dividend } } drawResult { drawnNo xDrawnNo } } query marksixResult($lastNDraw: Int) { lotteryDraws(lastNDraw: $lastNDraw) { ...lotteryDrawsFragment } }`;
type ApiPrize = { type?: string | number; winningUnit?: string | number; dividend?: string | number };
type ApiDraw = {
  id?: string; year?: string | number; no?: string | number; drawDate?: string;
  drawResult?: { drawnNo?: Array<string | number>; xDrawnNo?: string | number };
  lotteryPool?: { lotteryPrizes?: ApiPrize[] };
};

export async function GET() {
  try {
    const response = await fetch("https://info.cld.hkjc.com/graphql/base/", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationName: "marksixResult", variables: { lastNDraw: 5 }, query }), cache: "no-store",
    });
    if (!response.ok) throw new Error(`HKJC ${response.status}`);
    const json = (await response.json()) as { data?: { lotteryDraws?: ApiDraw[] } };
    const latest = (json.data?.lotteryDraws ?? []).filter((item) => item?.drawResult?.drawnNo?.length === 6 && item?.drawResult?.xDrawnNo).sort((a, b) => String(b.drawDate).localeCompare(String(a.drawDate)))[0];
    if (!latest) throw new Error("No completed draw");
    return NextResponse.json({
      drawNo: latest.id || `${String(latest.year).slice(-2)}/${String(latest.no).padStart(3, "0")}`,
      drawDate: String(latest.drawDate).slice(0, 10), numbers: latest.drawResult.drawnNo.map(Number).sort((a: number, b: number) => a - b), extra: Number(latest.drawResult.xDrawnNo),
      prizes: (latest.lotteryPool?.lotteryPrizes ?? []).map((p) => ({ tier: Number(p.type), winningUnit: Number(p.winningUnit ?? 0), dividend: Number(p.dividend ?? 0) })), updatedFromOfficial: true,
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=900" } });
  } catch {
    return NextResponse.json({ drawNo: "26/095", drawDate: "2026-08-29", numbers: [4, 7, 8, 11, 26, 30], extra: 42, updatedFromOfficial: false,
      prizes: [{ tier: 1, dividend: 4149710, winningUnit: 7 }, { tier: 2, dividend: 301160, winningUnit: 3 }, { tier: 3, dividend: 19200, winningUnit: 432.5 }, { tier: 4, dividend: 9600, winningUnit: 379.5 }, { tier: 5, dividend: 640, winningUnit: 14764.5 }, { tier: 6, dividend: 320, winningUnit: 8645 }, { tier: 7, dividend: 40, winningUnit: 188816.6 }]
    }, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}
