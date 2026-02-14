import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "2mb" }));

// RenderはPORTバインド必須
const PORT = process.env.PORT || 10000;

// OpenAI client
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -----------------------
// Utilities
// -----------------------
function safeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function periodToQuery(period) {
  if (!period) return { label: "直近7日", note: "" };

  if (period.type === "custom") {
    const start = safeStr(period.start);
    const end = safeStr(period.end);
    return {
      label: `カスタム: ${start}〜${end}`,
      note: `期間は ${start}〜${end}`,
    };
  }

  const days = Number(period.days || 7);
  if (days === 7) return { label: "直近7日", note: "過去7日を中心に" };
  if (days === 30) return { label: "直近1ヶ月", note: "過去30日を中心に" };
  if (days === 90) return { label: "直近3ヶ月", note: "過去90日を中心に" };

  return { label: `直近${days}日`, note: `過去${days}日を中心に` };
}

function factcheckPasses(level) {
  if (level === "quick") return 1;
  if (level === "strict") return 5;
  return 3;
}

function buildResearchSystem({ passes, threshold }) {
  // 重要：ここは「文字列だけ」で構成する（未クォート行があると即死）
  return [
    "あなたは食品・菓子業界の市場調査アナリスト。",
    "出力は必ず日本語。",
    "出力は必ずJSONのみ（前後に文章、コードフェンス、説明を付けない）。",
    "目的: 入力トピックについて、最新の公開情報を web_search で調査し、意思決定に使えるインサイトを作る。",
    "",
    "ルール:",
    "1) sources は必ずURL・媒体名・日付（可能なら公開日）を入れる。",
    "2) 断定は根拠がある場合のみ。推測は推測と明示。",
    "3) 最低でも主要ソースを5件は探す。難しい場合はその理由をrisksに書く。",
    `4) 信頼性スコア(1-5)を算出。3以上を基本採用。${threshold}未満が多い場合は注意喚起。`,
    `5) セルフファクトチェックを ${passes} 回行い、矛盾・日付・固有名詞・引用整合性を点検してから出力。`,
    "6) 過度な一般論で水増ししない。実務に落ちる提案に寄せる。",
    "",
    "出力JSONスキーマ:",
    "{",
    ' "id": "string",',
    ' "generated_at": "ISO8601",',
    ' "title": "string",',
    ' "summary": "string",',
    ' "trends": ["string"],',
    ' "implications": ["string"],',
    ' "risks": ["string"],',
    ' "next_actions": ["string"],',
    ' "credibility_score": 0,',
    ' "sources": [{"title":"string","publisher":"string","date":"string","url":"string","credibility":0,"notes":"string"}]',
    "}",
  ].join("\n");
}

function buildResearchUser({ topic, p, industries, channels, mode }) {
  const industriesStr = (industries || []).join(", ") || "-";
  const channelsStr = (channels || []).join(", ") || "-";

  return [
    `調査トピック: ${safeStr(topic)}`,
    `調査期間: ${safeStr(p.label)}`,
    `業界: ${industriesStr}`,
    `チャネル: ${channelsStr}`,
    `実行モード: ${safeStr(mode || "auto")}`,
    "",
    "指示:",
    `- ${safeStr(p.note)}公開情報を中心に調査し、国内外（特に日本・米国・アジア）も必要に応じて触れる。`,
    "- 日本の小売/菓子文脈（百貨店、駅ナカ、CVS、EC、インバウンド）への示唆を必ず含める。",
    "- “いつ/誰が/何を/どこで/なぜ”の最低1要素を各trendsに入れて、曖昧さを減らす。",
    "- 可能なら定量（%/価格/件数/市場規模など）を入れるが、数字は出典付きのみ。",
    "- 出典が弱い数字は“参考値”として扱い、risksに回す。",
  ].join("\n");
}

function buildFixerSystem() {
  return [
    "あなたはJSON修復専用。",
    "入力として渡されるテキストは「ほぼJSONだが壊れている可能性がある」。",
    "出力は必ずJSONのみ（前後に文章、コードフェンス、説明を付けない）。",
    "次のスキーマに完全準拠させて修復し、欠落しているキーがあれば空配列/空文字/0で補完する。",
    "",
    "スキーマ:",
    "{",
    ' "id": "string",',
    ' "generated_at": "ISO8601",',
    ' "title": "string",',
    ' "summary": "string",',
    ' "trends": ["string"],',
    ' "implications": ["string"],',
    ' "risks": ["string"],',
    ' "next_actions": ["string"],',
    ' "credibility_score": 0,',
    ' "sources": [{"title":"string","publisher":"string","date":"string","url":"string","credibility":0,"notes":"string"}]',
    "}",
  ].join("\n");
}

function emptyResult(title = "") {
  return {
    id: crypto.randomUUID(),
    generated_at: new Date().toISOString(),
    title: title || "",
    summary: "",
    trends: [],
    implications: [],
    risks: ["JSON解析に失敗したため、結果を空で返しました。"],
    next_actions: ["sourcesやsummaryが入るまで、プロンプト/出力を点検してください。"],
    credibility_score: 0,
    sources: [],
  };
}

// OpenAI SDKの返り値から「テキスト」を安全に取り出す
function extractOutputText(resp) {
  // いくつかの形を吸収（SDK差異に強くする）
  if (!resp) return "";
  if (typeof resp.output_text === "string") return resp.output_text;

  // output配列を走査してtextを拾う
  if (Array.isArray(resp.output)) {
    let buf = "";
    for (const item of resp.output) {
      if (!item) continue;
      if (typeof item === "string") buf += item;
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c && c.type === "output_text" && typeof c.text === "string") buf += c.text;
          if (c && typeof c.text === "string") buf += c.text;
        }
      }
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c && c.type === "output_text" && typeof c.text === "string") buf += c.text;
          if (c && typeof c.text === "string") buf += c.text;
        }
      }
    }
    return buf;
  }

  return "";
}

async function tryParseOrFix(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (_) {
    // 1回だけ修復を試みる（ここでもresponse_formatは使わない）
    const r = await client.responses.create({
      model: process.env.OPENAI_MODEL_FIX || "gpt-5.2",
      input: [
        { role: "system", content: buildFixerSystem() },
        { role: "user", content: "このテキストをスキーマ準拠のJSONに修復して。\n\n" + rawText },
      ],
      store: false,
      reasoning: { effort: "low" },
      // 注意：web_searchを使わないので tools は不要
    });

    const fixedText = extractOutputText(r).trim();
    try {
      return JSON.parse(fixedText);
    } catch (e2) {
      return emptyResult();
    }
  }
}

// -----------------------
// API
// -----------------------
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// 研究エンドポイント（フロントからPOST）
app.post("/api/research", async (req, res) => {
  try {
    const {
      topic,
      period,
      industries,
      channels,
      mode,
      factcheck_level,
      credibility_threshold,
    } = req.body || {};

    const t = safeStr(topic).trim();
    if (!t) {
      return res.status(400).json({ error: "topic is required" });
    }

    const p = periodToQuery(period);
    const passes = factcheckPasses(factcheck_level);
    const threshold = Number(credibility_threshold || 3);

    const sys = buildResearchSystem({ passes, threshold });
    const usr = buildResearchUser({ topic: t, p, industries, channels, mode });

    // 重要：web_searchを使うので response_format は指定しない（絶対）
    const r = await client.responses.create({
      model: process.env.OPENAI_MODEL_RESEARCH || "gpt-5.2",
      input: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      tools: [{ type: "web_search" }],
      store: false,
      reasoning: { effort: "medium" },
    });

    const rawText = extractOutputText(r).trim();
    const json = await tryParseOrFix(rawText);

    // 最低限の整形（id, generated_at が空なら補完）
    if (!json.id) json.id = crypto.randomUUID();
    if (!json.generated_at) json.generated_at = new Date().toISOString();
    if (!json.title) json.title = t;

    return res.json(json);
  } catch (err) {
    // OpenAIの400などもここで返す
    const message = err?.message || "unknown error";
    const status = err?.status || 500;
    return res.status(status).json({ error: message });
  }
});

// 静的配信（必要なら）
const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
