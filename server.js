import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { buildThinkerPrompt, buildImplementerPrompt } from "./prompts/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

// Setup Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// The Two-Pass AI Route
app.post("/api/ai-plan", async (req, res) => {
  try {
    const { prompt, tasks, todayKey } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    // --- STEP 1: THE THINKER ---
    console.log("🤔 Step 1: Thinking...");
    const thinkerText = buildThinkerPrompt(prompt, tasks, todayKey);
    
    const thinkRes = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: thinkerText }] }],
        generationConfig: { temperature: 0.3 }
      }),
    });
    
    if (!thinkRes.ok) throw new Error(`Gemini Thinker API Error: ${thinkRes.status}`);

    const thinkData = await thinkRes.json();
    const plan = thinkData.candidates?.[0]?.content?.parts?.[0]?.text || "No plan generated.";
    console.log("📝 Plan Created:\n", plan);

    // --- STEP 2: THE IMPLEMENTER ---
    console.log("🛠️ Step 2: Implementing...");
    const implementerText = buildImplementerPrompt(plan, tasks, todayKey);

    const codeRes = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: implementerText }] }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
      }),
    });

    if (!codeRes.ok) throw new Error(`Gemini Implementer API Error: ${codeRes.status}`);

    const codeData = await codeRes.json();
    const content = codeData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed = JSON.parse(cleanContent);
    if (!parsed.actions && Array.isArray(parsed)) parsed = { actions: parsed };

    console.log("🚀 Final Actions:", parsed.actions);
    res.json({ actions: parsed.actions || [] });

  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Failed to generate plan" });
  }
});

app.listen(PORT, () => {
  console.log(`AI Server running on http://localhost:${PORT}`);
});
