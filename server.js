// Import BOTH builders
import { buildThinkerPrompt, buildImplementerPrompt } from "./prompts/index.js";

// ... imports and setup ...

app.post("/api/ai-plan", async (req, res) => {
  try {
    const { prompt, tasks, todayKey } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";

    // --- STEP 1: THE THINKER ---
    console.log("🤔 Step 1: Thinking...");
    const thinkerText = buildThinkerPrompt(prompt, tasks, todayKey);
    
    const thinkRes = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: thinkerText }] }],
        generationConfig: { temperature: 0.3 } // Slightly creative for planning
      }),
    });
    
    const thinkData = await thinkRes.json();
    const plan = thinkData.candidates?.[0]?.content?.parts?.[0]?.text || "No plan generated.";
    console.log("📝 Plan Created:\n", plan);

    // --- STEP 2: THE IMPLEMENTER ---
    console.log("🛠️ Step 2: Implementing...");
    const implementerText = buildImplementerPrompt(plan, tasks);

    const codeRes = await fetch(`${baseUrl}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: implementerText }] }],
        generationConfig: { response_mime_type: "application/json", temperature: 0.1 } // Strict for code
      }),
    });

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