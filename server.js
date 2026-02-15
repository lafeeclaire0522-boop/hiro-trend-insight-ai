import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// 静的ファイルの配信設定
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
        if (!topic) return res.status(400).json({ error: "topic is required" });
        if (!apiKey) {
            return res.status(500).json({ error: "GEMINI_API_KEY is missing on server" });
        }

        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-pro",
            generationConfig: {
                responseMimeType: "application/json"
            }
        });

        const prompt = `次のテーマについてトレンド分析を作ってください。テーマ: ${topic}\n必ずJSONだけで回答してください。{\n"title": "string",\n"summary": "string",\n"trends": ["string"],\n"implications": ["string"],\n"risks": ["string"],\n"next_actions": ["string"],\n"sources": [{"title":"string","publisher":"string","date":"string","url":"string"}],\n"credibility_score": 1\n}`;
        
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = {
                title: topic,
                summary: "生成結果がJSONとして解釈できませんでした",
                trends: [], implications: [], risks: [], next_actions: [], sources: [],
                credibility_score: 3
            };
        }

        json.id = crypto.randomUUID();
        json.generated_at = new Date().toISOString();
        res.json(json);
    } catch (err) {
        res.status(500).json({ error: err?.message || String(err) });
    }
});

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
