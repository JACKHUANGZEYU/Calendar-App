import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { buildPrompt } from "./prompts/index.js"; // <--- IMPORT THE NEW BRAIN

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors({ origin: "*" }));
app.use(express.json());

app.post("/api/ai-plan", async (req, res) => {
  try {
    const { prompt, tasks, todayKey } = req.body;

    if (!prompt || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    
    // 1. Generate the advanced prompt using our new library
    const fullPrompt = buildPrompt(prompt, tasks, todayKey);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.1 },
      }),
    });

    if (!response.ok) throw new Error("Gemini API failed");

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let parsed = JSON.parse(cleanContent);
    if (!parsed.actions && Array.isArray(parsed)) parsed = { actions: parsed };

    console.log("AI Plan Executed:", parsed.actions);
    res.json({ actions: parsed.actions || [] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => console.log(`AI Server running on port ${PORT}`));