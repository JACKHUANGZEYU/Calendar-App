import { SYSTEM_ROLE } from "./systemRole.js";
import { AVAILABLE_TOOLS } from "./tools.js";
import { FEW_SHOT_EXAMPLES } from "./fewShot.js";

// Helper to make units readable (0-48 -> "09:30")
function formatUnitToTime(unit) {
  const minutesPerUnit = 30;
  const totalMinutes = unit * minutesPerUnit;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function buildPrompt(userPrompt, tasks, todayKey) {
  // 1. Prepare Context (Dynamic Data)
  const today = todayKey || new Date().toISOString().slice(0, 10);
  
  const readableTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    date: t.date,
    start: formatUnitToTime(t.startHour),
    end: formatUnitToTime(t.endHour),
    urgent: t.urgent
  }));

  // 2. Assemble the Mega-Prompt
  // NOTE: No backslashes before the backticks below!
  return `
${SYSTEM_ROLE}

${AVAILABLE_TOOLS}

${FEW_SHOT_EXAMPLES}

### LIVE CONTEXT
- Today: ${today}
- Existing Tasks: ${JSON.stringify(readableTasks, null, 2)}

### USER REQUEST
"${userPrompt}"

### YOUR JSON RESPONSE:
`;
}