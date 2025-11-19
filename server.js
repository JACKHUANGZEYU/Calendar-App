import express from "express";
import cors from "cors";
import dotenv from "dotenv";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;

// 2. FIX CORS: Allow all origins and specifically the OPTIONS method (Preflight)
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// --- 1. The "Brain": Restored Logic for Rename, Color, Urgent ---
function buildPrompt(userPrompt, tasks, todayKey) {
  const today =
    typeof todayKey === "string" && todayKey.length === 10
      ? todayKey
      : new Date().toISOString().slice(0, 10);

  const base = new Date(today + "T00:00:00");
  const tomorrowDate = new Date(base);
  tomorrowDate.setDate(base.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);

  return `
You are a precision calendar API. You manipulate a JSON task list.

CONTEXT:
- Today: ${today}
- Tomorrow: ${tomorrow}
- Current Tasks: ${JSON.stringify(tasks)}

USER REQUEST: "${userPrompt}"

AVAILABLE ACTIONS (JSON):
- "add": Create new task.
- "delete": Remove task.
- "resize": Change start/end time.
- "shift": Move time relative to current (earlier/later).
- "rename": Change title WITHOUT changing time.
- "setColor": Change color.
- "setUrgent": Toggle urgent flag.

STRICT RULES:

1. **RENAME vs REPLACE:** - If the user wants to change what they are doing (e.g. "Change Basketball to Reading") but keep the *same time*, use "rename".
   - Do NOT use delete+add for simple renaming.

2. **COLORS:**
   - Map user colors to these exact Tailwind classes:
   - Red/Pink -> "bg-rose-400"
   - Blue -> "bg-blue-500"
   - Light Blue -> "bg-sky-400"
   - Green -> "bg-emerald-400"
   - Yellow -> "bg-amber-400"
   - Orange -> "bg-orange-500"
   - Purple -> "bg-violet-400"
   - Lime -> "bg-lime-400"

3. **URGENCY:**
   - If user says "urgent", "important", "priority", or "ASAP", use "setUrgent" with { "urgent": true }.
   - To remove urgency, set { "urgent": false }.

4. **MOVING & RESIZING:**
   - "Extend/Shrink": Calculate new End Time = Start + Duration. Output "resize".
   - "Move to tomorrow": Output "delete" (today) AND "add" (tomorrow). KEEP the same "start" and "end" strings (HH:MM).

OUTPUT FORMAT (JSON ONLY):
{
  "actions": [
    { "type": "rename", "date": "YYYY-MM-DD", "fromTitle": "Old Name", "toTitle": "New Name" },
    { "type": "setColor", "date": "YYYY-MM-DD", "title": "Title", "color": "bg-rose-400" },
    { "type": "setUrgent", "date": "YYYY-MM-DD", "title": "Title", "urgent": true },
    { "type": "resize", "date": "YYYY-MM-DD", "title": "Title", "newEnd": "HH:MM" },
    { "type": "delete", "date": "YYYY-MM-DD", "title": "Title" },
    { "type": "add", "date": "YYYY-MM-DD", "title": "Title", "start": "HH:MM", "end": "HH:MM", "color": "bg-blue-500" },
    { "type": "shift", "date": "YYYY-MM-DD", "title": "Title", "deltaMinutes": 60 }
  ]
}
`;
}

// --- 2. The Route: Gemini 2.0 Flash ---
app.post("/api/ai-plan", async (req, res) => {
  try {
    const { prompt, tasks, todayKey } = req.body;

    if (!prompt || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "prompt and tasks are required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY in .env" });
    }

    // Use Gemini 2.0 Flash Experimental (fastest available)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(prompt, tasks, todayKey) }],
          },
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.1, // Low temperature = more precise JSON
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Gemini API Error:", response.status, text);
      return res.status(500).json({ error: "Gemini API request failed" });
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // Clean up potential markdown wrappers
    const cleanContent = content.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanContent);
    } catch (e) {
      console.error("JSON Parse Error:", cleanContent);
      return res.status(500).json({ error: "Invalid JSON from AI" });
    }

    // Ensure structure is correct
    if (!parsed.actions && Array.isArray(parsed)) {
      parsed = { actions: parsed };
    }

    console.log("Gemini Actions:", parsed.actions);
    res.json({ actions: parsed.actions || [] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Gemini AI Server listening on http://localhost:${PORT}`);
});