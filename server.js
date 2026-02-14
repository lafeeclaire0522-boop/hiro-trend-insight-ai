import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function periodToQuery(period){
  if(!period) return { label:"直近7日", note:"" };
  if(period.type === "custom"){
    return { label:`カスタム: ${period.start}〜${period.end}`, note:`期間は ${period.start}〜${period.end}` };
  }
  const days = Number(period.days || 7);
  if(days === 7) return { label:"直近7日", note:"過去7日を中心に" };
  if(days === 30) return { label:"直近1ヶ月", note:"過去30日を中心に" };
  if(days === 90) return { label:"直近3ヶ月", note:"過去90日を中心に" };
  return { label:`直近${days}日`, note:`過去${days}日を中心に` };
}

function factcheckPasses(level){
  if(level === "quick") return 1;
  if(level === "strict") return 5;
  return 3;
}

/*
  AI設計:
  - Web検索ツールを使い、トピックに関する一次情報を拾う（可能な範囲で）。
  - その上で構造化JSONでレポートを返す。
  - 3回(または設定回数)のセルフチェックを「同一レスポンス内で」実行させる。
*/
app.post("/api/research", async (req, res) => {
  try{
    const { topic, period, industries, channels, mode, settings } = req.body || {};
    if(!topic) return res.status(400).send("topic is required");

    const p = periodToQuery(period);
    const passes = factcheckPasses(settings?.factcheckLevel || "standard");
    const threshold = Number(settings?.credibilityThreshold ?? 3);

    const system = [
      "あなたは食品・菓子業界の市場調査アナリスト。",
      "出力は必ず日本語。",
      "出力はJSONのみ（前後に文章を付けない）。",
      "目的: 入力トピックについて、最新の公開情報を web_search で調査し、意思決定に使えるインサイトを作る。",
      "ルール:",
      "1) 参照ソースは必ずURL・媒体名・日付（可能なら公開日）を入れる。",
      "2) 断定は根拠がある場合のみ。推測は推測と明示。",
      "3) 最低でも主要ソースを5件は探す。難しい場合はその理由をrisksに書く。",
      `4) 信頼性スコア(1-5)を算出。3以上を基本採用。${threshold}未満が多い場合は注意喚起。`,
      `5) セルフファクトチェックを ${passes} 回行い、矛盾・日付・固有名詞・引用整合性を点検してから出力。`,
      "6) 過度な一般論で水増ししない。実務に落ちる提案に寄せる。",
      "",
      "出力JSONスキーマ:",
      "{",
      '  "id": "string",',
      '  "generated_at": "ISO8601",',
      '  "title": "string",',
      '  "summary": "string",',
      '  "trends": ["string"...],',
      '  "implications": ["string"...],',
      '  "risks": ["string"...],',
      '  "next_actions": ["string"...],',
      '  "credibility_score": number,',
      '  "sources": [{"title":"string","publisher":"string","date":"string","url":"string","credibility":number,"notes":"string"}...]',
      "}"
    ].join("\n");

    const user = [
      `調査トピック: ${topic}`,
      `調査期間: ${p.label}`,
      `業界: ${(industries||[]).join(", ") || "-"}`,
      `チャネル: ${(channels||[]).join(", ") || "-"}`,
      `実行モード: ${mode || "auto"}`,
      "",
      "指示:",
      `- ${p.note}公開情報を中心に調査し、国内外（特に日本・米国・アジア）も必要に応じて触れる。`,
      "- 日本の小売/菓子文脈（百貨店、駅ナカ、CVS、EC、インバウンド）への示唆を必ず含める。",
      "- “いつ/誰が/何を/どこで/なぜ”の最低1要素を各トレンドに入れて、曖昧さを減らす。",
      "- 可能なら定量（%/価格/件数/市場規模など）を入れるが、数字は出典付きのみ。",
      "- 出典が弱い数字は“参考値”として扱い、risksに回す。"
    ].join("\n");

    const response = await client.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      // web_search tool: documented in OpenAI Responses API guides
      tools: [{ type: "web_search" }],
      text: { format: { type: "json_object" } },
      reasoning: { effort: "medium" },
      store: false
    });

    const jsonText = response.output_text || "{}";
    let out;
    try{ out = JSON.parse(jsonText); }catch(e){
      return res.status(500).send("Model did not return valid JSON.\n\n" + jsonText.slice(0, 1500));
    }

    out.id = out.id || crypto.randomUUID();
    out.generated_at = out.generated_at || new Date().toISOString();
    res.json(out);
  }catch(err){
    console.error(err);
    res.status(500).send(String(err?.message || err));
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`HIRO's Trend Insight running on http://localhost:${port}`);
});
