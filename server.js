import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey || "");

// ヘルスチェック
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});

// メインの調査ロジック
app.post("/api/research", async (req, res) => {
    try {
        const topic = String(req.body?.topic || "").trim();
        if (!topic) return res.status(400).json({ error: "調査トピックを入力してください" });
        if (!apiKey) return res.status(500).json({ error: "サーバー側のAPIキー設定（GEMINI_API_KEY）が不足しています" });

        // モデル指定（404回避のため models/ を付与）
        const model = genAI.getGenerativeModel({ 
            model: "models/gemini-1.5-pro",
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
            あなたは食品・菓子業界の専門戦略家です。
            以下のトピックについて、ビジネス現場で即使用可能なレベルの市場調査レポートを作成してください。
            
            調査トピック: ${topic}

            必ず以下のJSON形式のみで回答してください。
            {
                "title": "分析タイトル（トピックを戦略的に解釈したもの）",
                "summary": "市場の全体観と核心的な要約",
                "trends": ["最新トレンド1", "最新トレンド2", "最新トレンド3"],
                "implications": ["戦略的示唆1", "戦略的示唆2"],
                "risks": ["潜在的リスク1", "潜在的リスク2"],
                "next_actions": ["HIRO氏が取るべき具体的な次の一手1", "次の一手2"],
                "sources": [
                    {"title": "想定出典資料1", "publisher": "業界紙/調査会社", "date": "2025/2026", "url": "#"}
                ],
                "credibility_score": 5
            }
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // JSONのパース処理（不要な装飾の除去）
        text = text.replace(/```json|```/g, "").trim();
        const reportData = JSON.parse(text);

        // UIが期待するIDとタイムスタンプを付与
        const finalResponse = {
            ...reportData,
            id: crypto.randomUUID(),
            generated_at: new Date().toISOString()
        };

        res.json(finalResponse);
    } catch (err) {
        console.error("Critical Error:", err);
        res.status(500).json({ 
            error: "分析エンジンの稼働に失敗しました。",
            details: err.message 
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 HIRO's Trend Insight AI: ACTIVE`);
    console.log(`📡 Port: ${PORT} | Mode: Gemini 1.5 Pro`);
    console.log(`-----------------------------------------`);
});
