import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 10000;
// Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// 確認用
app.get("/health", (_req, res) => {
res.json({ ok: true });
});
// 調査ボタンが押されたとき
app.post("/api/research", async (req, res) => {
try {
const topic = String(req.body?.topic || "").trim();
if (!topic) {
return res.status(400).json({ error: "topic is required" });
}
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  generationConfig: {
    responseMimeType: "application/json"
  }
});

const prompt = `
次のテーマについてトレンド分析を作ってください。
テーマ: ${topic}
必ずJSONだけで回答してください。
{
"title": "string",
"summary": "string",
"trends": ["string"],
"next_actions": ["string"]
}
`;
const result = await model.generateContent(prompt);
const text = result.response.text();

let json;
try {
  json = JSON.parse(text);
} catch {
  json = {
    title: topic,
    summary: "生成に失敗しました",
    trends: [],
    next_actions: []
  };
}

res.json(json);
} catch (err) {
res.status(500).json({ error: err.message });
}
});
app.listen(PORT, () => {
console.log("Server running");
});
