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
        if (!topic) return res.status(400).json({ error: "topic is required" });
        if (!apiKey) return res.status(500).json({ error: "API KEY MISSING" });

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const prompt = `テーマ: ${topic} についてトレンド分析を日本語のJSON形式で作成してください。`;
        const result = await model.generateContent(prompt);
        res.json({ data: result.response.text(), id: crypto.randomUUID() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port", PORT);
});
