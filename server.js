import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/research", async (req, res) => {
    try {
        const topic = String(req.body?.topic || "").trim();
        if (!topic) return res.status(400).json({ error: "トピックを入力してください" });
        if (!apiKey) return res.status(500).json({ error: "APIキーが設定されていません" });

        // モデル名を最新かつ最も安定している 'gemini-1.5-flash' に変更
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash"
        });

        const prompt = `あなたは食品業界戦略家です。テーマ: 「${topic}」について、以下のJSON形式のみで回答してください。
        {
            "title": "タイトル",
            "summary": "要約",
            "trends": ["トレンド1", "トレンド2"],
            "implications": ["示唆1"],
            "risks": ["リスク1"],
            "next_actions": ["次の一手1"],
            "sources": [{"title":"出典","publisher":"発行元","date":"2026","url":"#"}],
            "credibility_score": 5
        }`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const data = JSON.parse(text);
        
        res.json({ ...data, id: crypto.randomUUID(), generated_at: new Date().toISOString() });
    } catch (err) {
        console.error("API Error:", err);
        res.status(500).json({ error: "分析失敗: " + err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started on port ${PORT}`);
});
