import { THINKER_ROLE } from "./thinker.js";
import { IMPLEMENTER_ROLE } from "./implementer.js";
import { AVAILABLE_TOOLS } from "./tools.js";

// Helper to make units readable (0-48 -> "09:30")
function formatUnitToTime(unit) {
  const minutesPerUnit = 30;
  const totalMinutes = unit * minutesPerUnit;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getReadableTasks(tasks) {
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    date: t.date,
    start: formatUnitToTime(t.startHour),
    end: formatUnitToTime(t.endHour),
    urgent: t.urgent
  }));
}

// --- Pass 1: The Thinker ---
export function buildThinkerPrompt(userPrompt, tasks, todayKey) {
  const today = todayKey || new Date().toISOString().slice(0, 10);
  return `
${THINKER_ROLE}

### LIVE CONTEXT
- Today: ${today}
- Existing Tasks: ${JSON.stringify(getReadableTasks(tasks), null, 2)}

### USER REQUEST
"${userPrompt}"

### YOUR LOGICAL PLAN:
`;
}

// --- Pass 2: The Implementer ---
export function buildImplementerPrompt(plan, tasks, todayKey) {
  const today = todayKey || new Date().toISOString().slice(0, 10);
  return `
${IMPLEMENTER_ROLE}

${AVAILABLE_TOOLS}

### CONTEXT (Reference Only)
- Today: ${today}
- Existing Tasks: ${JSON.stringify(getReadableTasks(tasks), null, 2)}

### LOGICAL PLAN (Execute This)
${plan}

### YOUR JSON ACTIONS:
`;
}
