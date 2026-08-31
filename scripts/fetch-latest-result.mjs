import { writeFile } from "node:fs/promises";

const query = `fragment lotteryDrawsFragment on LotteryDraw { id year no drawDate status lotteryPool { lotteryPrizes { type winningUnit dividend } } drawResult { drawnNo xDrawnNo } } query marksixResult($lastNDraw: Int) { lotteryDraws(lastNDraw: $lastNDraw) { ...lotteryDrawsFragment } }`;

try {
  const response = await fetch("https://info.cld.hkjc.com/graphql/base/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationName: "marksixResult", variables: { lastNDraw: 5 }, query }),
  });
  if (!response.ok) throw new Error(`HKJC ${response.status}`);
  const json = await response.json();
  const latest = (json.data?.lotteryDraws ?? [])
    .filter((item) => item?.drawResult?.drawnNo?.length === 6 && item?.drawResult?.xDrawnNo)
    .sort((a, b) => String(b.drawDate).localeCompare(String(a.drawDate)))[0];
  if (!latest) throw new Error("No completed draw");
  const result = {
    drawNo: latest.id || `${String(latest.year).slice(-2)}/${String(latest.no).padStart(3, "0")}`,
    drawDate: String(latest.drawDate).slice(0, 10),
    numbers: latest.drawResult.drawnNo.map(Number).sort((a, b) => a - b),
    extra: Number(latest.drawResult.xDrawnNo),
    prizes: (latest.lotteryPool?.lotteryPrizes ?? []).map((prize) => ({ tier: Number(prize.type), winningUnit: Number(prize.winningUnit ?? 0), dividend: Number(prize.dividend ?? 0) })),
    updatedFromOfficial: true,
  };
  await writeFile(new URL("../public/latest-result.json", import.meta.url), `${JSON.stringify(result)}\n`);
  console.log(`Updated draw ${result.drawNo}`);
} catch (error) {
  console.warn(`Keeping committed fallback: ${error instanceof Error ? error.message : error}`);
}
