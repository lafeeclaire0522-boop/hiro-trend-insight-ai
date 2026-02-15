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
        const { topic } = req.body;
        if (!topic) return res.status(400).json({ error: "トピックが必要です" });
        if (!apiKey) return res.status(500).json({ error: "APIキー未設定" });

        // モデル名を修正し、JSONレスポンスを強制
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-pro",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `あなたは食品業界戦略家です。テーマ: ${topic} について以下のJSONで回答。
        {"title":"分析題","summary":"要約","trends":["傾向"],"implications":["示唆"],"risks":["懸念"],"next_actions":["次手"],"sources":[{"title":"出典","publisher":"発行","date":"2026","url":"#"}],"credibility_score":5}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const data = JSON.parse(text);
        
        res.json({ ...data, id: crypto.randomUUID(), generated_at: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
