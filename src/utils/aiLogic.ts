import type { TaskBlock, AiAction } from "../types";
import { timeStringToUnit, splitTaskAcrossDays, COLORS } from "./timeLogic";

// 1. Helper: Clean up sloppy time formats (e.g. "10am" -> "10:00")
function safeTimeToUnit(timeStr: string): number {
  if (!timeStr) return -1;
  // Remove spaces, am/pm, and lowercase it
  let clean = String(timeStr).toLowerCase().replace(/\s/g, "").replace("am", "").replace("pm", "");
  
  // If AI returns just "18" (no minutes), treat as "18:00"
  if (!clean.includes(":")) {
     const num = parseInt(clean);
     if (!isNaN(num)) return timeStringToUnit(`${num}:00`);
  }
  return timeStringToUnit(clean);
}

// 2. Helper: Ensure date format is strictly YYYY-MM-DD
function normalizeDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toISOString().slice(0, 10);
  } catch (e) {
    return dateStr;
  }
}

export async function callAiPlanner(
  prompt: string,
  tasks: TaskBlock[],
  contextDate: string 
): Promise<AiAction[]> {
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

  const res = await fetch(`${API_URL}/api/ai-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, tasks, todayKey: contextDate }), 
  });

  if (!res.ok) throw new Error("AI server error");
  const data = await res.json();
  return (data.actions || []) as AiAction[];
}

export function applyAiPlan(
  actions: AiAction[], 
  prevTasks: TaskBlock[], 
  defaultDateStr?: string 
): TaskBlock[] {
  let tasks = [...prevTasks];
  const fallbackDate = defaultDateStr || new Date().toISOString().slice(0, 10);

  console.log(`🔄 Applying AI Plan. Context: ${fallbackDate}`, actions);

  for (const rawAction of actions) {
    // --- THE UNIVERSAL ADAPTER (Fixes the AI JSON Mismatch) ---
    // The AI might send "action" instead of "type", or "newStart" instead of "start".
    // We map them all to standard variables here.
    const anyAction = rawAction as any;

    // 1. Normalize Type (handle 'action', 'type', 'tool')
    const rawType = anyAction.type || anyAction.action || anyAction.tool || "";
    const type = rawType.toLowerCase();

    // 2. Normalize Date
    const rawDate = anyAction.date || fallbackDate;
    let actionDate = normalizeDate(rawDate);

    // 3. Year Correction (Fixes 2024 vs 2025 bug)
    const contextYear = fallbackDate.slice(0, 4);
    const actionYear = actionDate.slice(0, 4);
    if (actionYear !== contextYear && actionDate.slice(5) === fallbackDate.slice(5)) {
      console.warn(`🕒 Year Drift Detected. Forcing ${actionDate} -> ${fallbackDate}`);
      actionDate = fallbackDate;
    }

    console.log(`🔧 Processing: [${type}] on ${actionDate}`);

    // --- EXECUTION LOGIC ---

    if (type === "add" || type === "create" || type === "insert") {
      // ADAPTER: Check 'start', 'startTime', 'newStart', 'at'
      const rawStart = anyAction.start || anyAction.startTime || anyAction.newStart || anyAction.at;
      // ADAPTER: Check 'end', 'endTime', 'newEnd'
      const rawEnd = anyAction.end || anyAction.endTime || anyAction.newEnd;
      
      const startUnit = safeTimeToUnit(rawStart);
      // Default to 1 hour (2 units) if end is missing
      const endUnit = rawEnd ? safeTimeToUnit(rawEnd) : startUnit + 2; 

      if (startUnit < 0) {
        console.warn("❌ Invalid time for Add:", rawStart);
        continue;
      }

      const tasksForDay = tasks.filter((t) => t.date === actionDate);
      const colorIndex = tasksForDay.length % COLORS.length;
      
      const newTask: TaskBlock = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: anyAction.title || "New Task",
        date: actionDate,
        startHour: startUnit,
        endHour: endUnit,
        color: COLORS[colorIndex],
        urgent: Boolean(anyAction.urgent),
      };
      tasks.push(newTask);
      console.log("✅ Added:", newTask);

    } else if (type === "delete" || type === "remove") {
      tasks = tasks.filter(t => !(t.date === actionDate && t.title === anyAction.title));

    } else if (type === "shift" || type === "move") {
      const deltaUnits = Math.round((anyAction.deltaMinutes || 0) / 30);
      if (!deltaUnits) continue;

      let nextTasks: TaskBlock[] = [];
      for (const t of tasks) {
        if (t.date !== actionDate || t.title !== anyAction.title) {
          nextTasks.push(t);
          continue;
        }
        const duration = t.endHour - t.startHour;
        const newStart = t.startHour + deltaUnits;
        const splitResult = splitTaskAcrossDays(t, newStart, duration);
        nextTasks.push(...splitResult);
      }
      tasks = nextTasks;

    } else if (type === "resize" || type === "extend" || type === "shorten") {
      let nextTasks: TaskBlock[] = [];
      for (const t of tasks) {
        if (t.date !== actionDate || t.title !== anyAction.title) {
          nextTasks.push(t);
          continue;
        }
        // ADAPTER: Resize sometimes uses 'newStart'/'newEnd'
        const rawNewStart = anyAction.newStart || anyAction.start;
        const rawNewEnd = anyAction.newEnd || anyAction.end;

        let startUnit = t.startHour;
        let endUnit = t.endHour;
        
        if (rawNewStart) startUnit = safeTimeToUnit(rawNewStart);
        if (rawNewEnd) endUnit = safeTimeToUnit(rawNewEnd);
        
        if (endUnit <= startUnit) endUnit = startUnit + 1;
        
        const resizedBlocks = splitTaskAcrossDays(t, startUnit, endUnit - startUnit);
        nextTasks.push(...resizedBlocks);
      }
      tasks = nextTasks;

    } else if (type === "rename") {
       const fromTitle = anyAction.fromTitle || anyAction.title;
       const toTitle = anyAction.toTitle || anyAction.newTitle;
       tasks = tasks.map(t => (t.date === actionDate && t.title === fromTitle) ? { ...t, title: toTitle } : t);

    } else if (type === "setcolor") {
      tasks = tasks.map(t => {
        if (t.date !== actionDate || t.title !== anyAction.title) return t;
        return { ...t, color: anyAction.color };
      });

    } else if (type === "seturgent") {
      tasks = tasks.map(t => {
        if (t.date !== actionDate || t.title !== anyAction.title) return t;
        let newColor = t.color;
        if (anyAction.urgent && !t.color.includes("rose") && !t.color.includes("orange")) {
           newColor = "bg-rose-400";
        }
        return { ...t, urgent: anyAction.urgent, color: newColor };
      });

    } else if (type === "split") {
      const rawAt = anyAction.atTime || anyAction.at || anyAction.time;
      const splitUnit = safeTimeToUnit(rawAt);
      
      if (splitUnit >= 0) {
        let nextTasks: TaskBlock[] = [];
        for (const t of tasks) {
          if (t.date !== actionDate || t.title !== anyAction.title) {
            nextTasks.push(t);
            continue;
          }
          if (splitUnit <= t.startHour || splitUnit >= t.endHour) {
            nextTasks.push(t);
            continue;
          }
          const idA = `${Date.now()}-ai-a-${Math.random().toString(16).slice(2)}`;
          const idB = `${Date.now()}-ai-b-${Math.random().toString(16).slice(2)}`;
          const taskA: TaskBlock = { ...t, id: idA, endHour: splitUnit };
          const taskB: TaskBlock = { ...t, id: idB, startHour: splitUnit };
          nextTasks.push(taskA, taskB);
        }
        tasks = nextTasks;
      }
    }
  }
  return tasks;
}