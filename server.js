import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/api/research", async (req, res) => {
    try {
        const topic = String(req.body?.topic || "").trim();
        if (!topic) return res.status(400).json({ error: "トピックを入力してください" });
        if (!apiKey) return res.status(500).json({ error: "APIキーが設定されていません" });

        // 最新のモデル指定方式に修正
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        // HIROさんの「本来の出力形式」を再現するプロンプト
        const prompt = `
            あなたは食品・菓子業界の戦略家です。
            テーマ: 「${topic}」について、以下の構造で厳密なJSON形式で回答してください。
            
            {
                "title": "分析タイトル",
                "summary": "全体要約",
                "trends": ["トレンド1", "トレンド2", "トレンド3"],
                "implications": ["戦略的示唆1", "戦略的示唆2"],
                "risks": ["リスク1", "リスク2"],
                "next_actions": ["次の一手1", "次の一手2"],
                "sources": [{"title":"出典名","publisher":"発行元","date":"日付","url":"URL"}],
                "credibility_score": 5
            }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json|```/g, "").trim();
        
        const jsonResponse = JSON.parse(text);
        jsonResponse.id = crypto.randomUUID();
        jsonResponse.generated_at = new Date().toISOString();

        res.json(jsonResponse);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "分析中にエラーが発生しました。再度お試しください。" });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
