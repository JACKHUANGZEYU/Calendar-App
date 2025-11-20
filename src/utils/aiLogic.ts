import type { TaskBlock, AiAction } from "../types";
import { timeStringToUnit, splitTaskAcrossDays, COLORS } from "./timeLogic";

export async function callAiPlanner(
  prompt: string,
  tasks: TaskBlock[],
  todayKey: string
): Promise<AiAction[]> {
  // Make sure this URL matches your running server
  const res = await fetch("http://localhost:8787/api/ai-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, tasks, todayKey }),
  });

  if (!res.ok) throw new Error("AI server error");
  const data = await res.json();
  return (data.actions || []) as AiAction[];
}

export function applyAiPlan(actions: AiAction[], prevTasks: TaskBlock[]): TaskBlock[] {
  let tasks = [...prevTasks];

  for (const action of actions) {
    if (action.type === "add") {
      const startUnit = timeStringToUnit(action.start);
      const endUnit = Math.max(startUnit + 1, timeStringToUnit(action.end));
      const tasksForDay = tasks.filter((t) => t.date === action.date);
      const colorIndex = tasksForDay.length % COLORS.length;
      const newTask: TaskBlock = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: action.title,
        date: action.date,
        startHour: startUnit,
        endHour: endUnit,
        color: COLORS[colorIndex],
        urgent: Boolean(action.urgent),
      };
      tasks.push(newTask);

    } else if (action.type === "delete") {
      tasks = tasks.filter(t => !(t.date === action.date && t.title === action.title));

    } else if (action.type === "resize") {
      let nextTasks: TaskBlock[] = [];
      for (const t of tasks) {
        if (t.date !== action.date || t.title !== action.title) {
          nextTasks.push(t);
          continue;
        }
        let startUnit = t.startHour;
        let endUnit = t.endHour;
        if (action.newStart) startUnit = timeStringToUnit(action.newStart);
        if (action.newEnd) endUnit = timeStringToUnit(action.newEnd);
        if (endUnit <= startUnit) endUnit = startUnit + 1;
        const totalDuration = endUnit - startUnit;
        const resizedBlocks = splitTaskAcrossDays(t, startUnit, totalDuration);
        nextTasks.push(...resizedBlocks);
      }
      tasks = nextTasks;

    } else if (action.type === "rename") {
      tasks = tasks.map(t => t.date === action.date && t.title === action.fromTitle ? { ...t, title: action.toTitle } : t);

    } else if (action.type === "setColor") {
      tasks = tasks.map(t => {
        if (t.date !== action.date || t.title !== action.title) return t;
        const allowedColors = COLORS as readonly string[];
        const nextColor = allowedColors.includes(action.color) ? action.color : t.color;
        return { ...t, color: nextColor };
      });

    } else if (action.type === "setUrgent") {
      tasks = tasks.map(t => {
        if (t.date !== action.date || t.title !== action.title) return t;
        let newColor = t.color;
        if (action.urgent && !t.color.includes("rose") && !t.color.includes("orange")) {
           newColor = "bg-rose-400";
        }
        return { ...t, urgent: action.urgent, color: newColor };
      });

    } else if (action.type === "shift") {
      const deltaUnits = Math.round(action.deltaMinutes / 30); // Approx 30m per unit
      if (!deltaUnits) continue;
      let nextTasks: TaskBlock[] = [];
      for (const t of tasks) {
        if (t.date !== action.date || t.title !== action.title) {
          nextTasks.push(t);
          continue;
        }
        const duration = t.endHour - t.startHour;
        const newStart = t.startHour + deltaUnits;
        const splitResult = splitTaskAcrossDays(t, newStart, duration);
        nextTasks.push(...splitResult);
      }
      tasks = nextTasks;

    } else if (action.type === "split") {
      const splitUnit = timeStringToUnit(action.atTime);
      let nextTasks: TaskBlock[] = [];
      for (const t of tasks) {
        if (t.date !== action.date || t.title !== action.title) {
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
  return tasks;
}
