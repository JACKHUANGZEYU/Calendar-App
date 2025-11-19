import React, { useEffect, useMemo, useRef, useState } from "react";


type TaskBlock = {
  id: string;
  title: string;
  date: string;      // "YYYY-MM-DD"
  startHour: number; // 0–23
  endHour: number;   // 1–24
  color: string;     // Tailwind class like "bg-blue-400"
  urgent: boolean;
};


type DragMode = "move" | "resize-start" | "resize-end";

const HOURS_START = 0;
const HOURS_END = 24;
const MINUTES_PER_UNIT = 30;             // 0 or 30
const UNITS_PER_HOUR = 60 / MINUTES_PER_UNIT; // 2
const TOTAL_UNITS = (HOURS_END - HOURS_START) * UNITS_PER_HOUR;

type AiActionAdd = {
  type: "add";
  title: string;
  date: string;     // "YYYY-MM-DD"
  start: string;    // "HH:MM"
  end: string;      // "HH:MM"
  urgent?: boolean;
};

type AiActionDelete = {
  type: "delete";
  title: string;
  date: string;     // "YYYY-MM-DD"
};

type AiActionResize = {
  type: "resize";
  title: string;
  date: string;     // "YYYY-MM-DD"
  newStart?: string; // "HH:MM"
  newEnd?: string;   // "HH:MM"
};

// NEW
type AiActionRename = {
  type: "rename";
  date: string;
  fromTitle: string;
  toTitle: string;
};

type AiActionSetColor = {
  type: "setColor";
  date: string;
  title: string;
  color: string; // must be one of the Tailwind classes you use
};

type AiActionSetUrgent = {
  type: "setUrgent";
  date: string;
  title: string;
  urgent: boolean;
};

type AiActionShift = {
  type: "shift";
  date: string;
  title: string;
  deltaMinutes: number; // positive = later, negative = earlier
};

type AiAction =
  | AiActionAdd
  | AiActionDelete
  | AiActionResize
  | AiActionRename
  | AiActionSetColor
  | AiActionSetUrgent
  | AiActionShift;


// In App.tsx, check/update this function:
function timeStringToUnit(time: string): number {
  if (!time) return 0;
  // Handle "14:30" or "9:00"
  const [hhStr, mmStr] = time.split(":");
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  
  const minutesFromStart = (hh - HOURS_START) * 60 + (isNaN(mm) ? 0 : mm);
  let unit = Math.round(minutesFromStart / MINUTES_PER_UNIT);
  
  // Don't clamp here yet, let the split logic handle bounds
  return unit;
}

// --- NEW HELPER: Handle tasks wrapping across days ---
function splitTaskAcrossDays(
  baseTask: TaskBlock,
  rawStart: number,
  rawEnd: number
): TaskBlock[] {
  const results: TaskBlock[] = [];
  // (Line removed here)
  
  // Case 1: Task fits entirely in the current day
  if (rawStart >= 0 && rawEnd <= TOTAL_UNITS) {
    results.push({
      ...baseTask,
      startHour: rawStart,
      endHour: rawEnd,
    });
    return results;
  }
// ... (rest of function stays the same)

  // Case 2: Task overflows into NEXT day (e.g., 23:00 + 3 hours)
  if (rawEnd > TOTAL_UNITS) {
    // Part A: Remainder of current day
    if (rawStart < TOTAL_UNITS) {
      results.push({
        ...baseTask,
        startHour: rawStart,
        endHour: TOTAL_UNITS,
      });
    }
    // Part B: Overflow onto next day
    const nextDate = addDaysToKey(baseTask.date, 1);
    const overflow = rawEnd - TOTAL_UNITS;
    results.push({
      ...baseTask,
      id: `${baseTask.id}-split-next`, // unique ID
      date: nextDate,
      startHour: 0,
      endHour: overflow,
    });
    return results;
  }

  // Case 3: Task underflows into PREVIOUS day (e.g., 01:00 moved back 2 hours)
  if (rawStart < 0) {
    // Part A: Remainder of current day
    if (rawEnd > 0) {
      results.push({
        ...baseTask,
        startHour: 0,
        endHour: rawEnd,
      });
    }
    // Part B: Underflow onto previous day
    const prevDate = addDaysToKey(baseTask.date, -1);
    const underflowStart = TOTAL_UNITS + rawStart; // e.g. 48 + (-2) = 46
    results.push({
      ...baseTask,
      id: `${baseTask.id}-split-prev`,
      date: prevDate,
      startHour: underflowStart,
      endHour: TOTAL_UNITS,
    });
    return results;
  }

  return results;
}

// Apply a list of AI actions to the current task list
function applyAiPlan(actions: AiAction[], prevTasks: TaskBlock[]): TaskBlock[] {
  let tasks = [...prevTasks];

  for (const action of actions) {
    if (action.type === "add") {
      const startUnit = timeStringToUnit(action.start);
      const endUnit = Math.max(startUnit + 1, timeStringToUnit(action.end));

      const tasksForDay = tasks.filter((t) => t.date === action.date);
      const colorIndex = tasksForDay.length % COLORS.length;
      const color = COLORS[colorIndex];

      const newTask: TaskBlock = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title: action.title,
        date: action.date,
        startHour: startUnit,
        endHour: endUnit,
        color,
        urgent: Boolean(action.urgent),
      };

      tasks.push(newTask);
    } else if (action.type === "delete") {
      tasks = tasks.filter(
        (t) => !(t.date === action.date && t.title === action.title)
      );
    } else if (action.type === "resize") {
      // Create new array to avoid mutating while iterating
      let nextTasks: TaskBlock[] = [];

      for (const t of tasks) {
        // Only modify the target task
        if (t.date !== action.date || t.title !== action.title) {
          nextTasks.push(t);
          continue;
        }

        let startUnit = t.startHour;
        let endUnit = t.endHour;

        // If AI sent a new start time string, convert to unit
        if (action.newStart) startUnit = timeStringToUnit(action.newStart);
        
        // If AI sent a new end time string, convert to unit
        if (action.newEnd) endUnit = timeStringToUnit(action.newEnd);

        // Safety: End must be after Start
        if (endUnit <= startUnit) endUnit = startUnit + 1;

        // Use the split helper we added earlier to handle day-boundaries
        // (If you haven't added splitTaskAcrossDays yet, use the previous logic, 
        // but splitTaskAcrossDays is better)
        const resizedBlocks = splitTaskAcrossDays(t, startUnit, endUnit);
        nextTasks.push(...resizedBlocks);
      }
      tasks = nextTasks;
    }else if (action.type === "rename") {
      tasks = tasks.map((t) =>
        t.date === action.date && t.title === action.fromTitle
          ? { ...t, title: action.toTitle }
          : t
      );

    // NEW: set color (only accept colors you support)
    } else if (action.type === "setColor") {
      tasks = tasks.map((t) => {
        if (t.date !== action.date || t.title !== action.title) return t;

        // Strict check against your allowed colors list
        // If AI sends "red", it fails the check, so we need the AI to send "bg-rose-400"
        // (The new prompt ensures this, but this is a safety fallback)
        const allowedColors = COLORS as readonly string[];
        const nextColor = allowedColors.includes(action.color)
          ? action.color
          : t.color; // Fallback: keep original color if AI sends invalid string

        return { ...t, color: nextColor };
      });

    // NEW: toggle urgent flag
    } else if (action.type === "setUrgent") {
      tasks = tasks.map((t) => {
        if (t.date !== action.date || t.title !== action.title) return t;
        
        let newColor = t.color;
        // Optional: If making urgent, force a 'hot' color if not already
        if (action.urgent && !t.color.includes("rose") && !t.color.includes("orange")) {
           newColor = "bg-rose-400";
        }
        
        return { ...t, urgent: action.urgent, color: newColor };
      });

    // NEW: shift blocks earlier/later while keeping duration
    } else if (action.type === "shift") {
      const deltaUnits = Math.round(action.deltaMinutes / MINUTES_PER_UNIT);
      if (!deltaUnits) continue;

      // Create a new list to handle potential splits
      let nextTasks: TaskBlock[] = [];

      for (const t of tasks) {
        if (t.date !== action.date || t.title !== action.title) {
          nextTasks.push(t);
          continue;
        }

        // Calculate new raw positions
        const duration = t.endHour - t.startHour;
        const newStart = t.startHour + deltaUnits;
        const newEnd = newStart + duration;

        // Use the helper to handle splits/wraps
        const splitResult = splitTaskAcrossDays(t, newStart, newEnd);
        nextTasks.push(...splitResult);
      }
      tasks = nextTasks;

    }
  }

  return tasks;
}



// How many day columns we draw in the main grid.
const VISIBLE_DAYS = 21;
const CENTER_INDEX = Math.floor(VISIBLE_DAYS / 2);



const COLORS = [
  "bg-sky-400",
  "bg-blue-500",
  "bg-emerald-400",
  "bg-lime-400",
  "bg-amber-400",
  "bg-orange-500",
  "bg-rose-400",
  "bg-violet-400",
];


const STORAGE_KEY = "timeblocks_tasks_v1";

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateKey(key: string): Date {
  const [y, m, day] = key.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function addDaysToKey(key: string, offset: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + offset);
  return formatDateKey(d);
}

function getDayLabelFromKey(key: string): { date: string; label: string } {
  const d = parseDateKey(key);
  const label = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return { date: key, label };
}

// Build the weeks for the mini month calendar on the left.
function buildMonthGrid(monthStart: Date): (Date | null)[][] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay(); // 0–6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(new Date(year, month, day));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function unitToTime(unit: number): { hour: number; minute: number } {
  const totalMinutes = HOURS_START * 60 + unit * MINUTES_PER_UNIT;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return { hour, minute };
}

function formatTimeLabel(unit: number): string {
  const { hour, minute } = unitToTime(unit);
  const hh = hour.toString().padStart(2, "0");
  const mm = minute === 0 ? "00" : "30";
  return `${hh}:${mm}`;
}

const todayKey = formatDateKey(new Date());

async function callAiPlanner(
  prompt: string,
  tasks: TaskBlock[],
  todayKey: string
): Promise<AiAction[]> {
  const res = await fetch("https://calendar-smart.onrender.com/api/ai-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, tasks, todayKey }),
  });

  if (!res.ok) {
    throw new Error("AI server error");
  }

  const data = await res.json();
  return (data.actions || []) as AiAction[];
}



const App: React.FC = () => {

const [tasks, setTasks] = useState<TaskBlock[]>(() => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((t) => ({
      ...t,
      urgent: typeof t.urgent === "boolean" ? t.urgent : false,
    }));
  } catch {
    return [];
  }
});

const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
const [isUrgentPickerOpen, setIsUrgentPickerOpen] = useState(false);
const [splitHover, setSplitHover] = useState<{ taskId: string; splitAtUnit: number } | null>(null);
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


const [aiPrompt, setAiPrompt] = useState("");
const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
const [aiError, setAiError] = useState<string | null>(null);



  // Center date for the 21-day strip in the main view
  const [centerDateKey, setCenterDateKey] = useState<string>(todayKey);

  const [dragState, setDragState] = useState<{
    taskId: string;
    mode: DragMode;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [detailsWidth, setDetailsWidth] = useState(256); // px width of task-detail panel


  // Month shown in the mini calendar
  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() => {
    const d = parseDateKey(todayKey);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Keep left mini calendar in sync with the center date’s month
  useEffect(() => {
    const d = parseDateKey(centerDateKey);
    setCalendarMonthStart(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [centerDateKey]);

  // Persist tasks
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);



  useEffect(() => {
    if (!scrollRef.current) return;

    const rowHeightPx = 24; // h-6 ≈ 24px
    const targetHour = 6;   // show around 06:00
    const offsetUnits = (targetHour - HOURS_START) * UNITS_PER_HOUR;

    const scrollTop = Math.max(0, offsetUnits * rowHeightPx - 80);
    scrollRef.current.scrollTop = scrollTop;
  }, []);

    // Keep the "center date" roughly centered horizontally in the main grid
  useEffect(() => {
    if (!scrollRef.current) return;

    const container = scrollRef.current;
    const timeColWidth = 80;   // matches the "80px" in gridTemplateColumns
    const dayColWidth = 160;   // matches the "160px" in gridTemplateColumns

    const columnCenter =
      timeColWidth + dayColWidth * CENTER_INDEX + dayColWidth / 2;

    const desiredScrollLeft = Math.max(
      0,
      columnCenter - container.clientWidth / 2
    );

    container.scrollLeft = desiredScrollLeft;
  }, [centerDateKey]);


  // Map (date-hour) -> tasks
  const tasksByCell = useMemo(() => {
    const map = new Map<string, TaskBlock[]>();
    for (const t of tasks) {
      for (let h = t.startHour; h < t.endHour; h++) {
        const key = `${t.date}-${h}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
    }

    // Sort tasks in each cell by start time (then by title) so columns are stable
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.title.localeCompare(b.title);
      });
    }

    return map;
  }, [tasks]);

  // --- ADD THIS ENTIRE BLOCK ---
  const taskMaxOverlaps = useMemo(() => {
    const map = new Map<string, number>();
    if (!tasksByCell.size) return map;

    for (const task of tasks) {
      let maxOverlapInAnyCell = 1;
      for (let unit = task.startHour; unit < task.endHour; unit++) {
        const key = `${task.date}-${unit}`;
        const cellTasks = tasksByCell.get(key);
        if (cellTasks) {
          // Find this task's position in the sorted cell list
          const idx = cellTasks.findIndex(t => t.id === task.id);
          // Only count overlaps if this task is one of the visible ones (0, 1, or 2)
          if (idx !== -1 && idx < 3) {
            maxOverlapInAnyCell = Math.max(maxOverlapInAnyCell, cellTasks.length);
          }
        }
      }
      // Cap at 3
      map.set(task.id, Math.min(maxOverlapInAnyCell, 3));
    }
    return map;
  }, [tasks, tasksByCell]);
  // --- END OF NEW BLOCK ---

  const unitRange = Array.from(
    { length: TOTAL_UNITS },
    (_, i) => i
  );


  // 21 days centered on centerDateKey
  const dayOffsets = Array.from(
    { length: VISIBLE_DAYS },
    (_, i) => i - CENTER_INDEX
  );
  const dayCols = dayOffsets.map((offset) => {
    const key = addDaysToKey(centerDateKey, offset);
    return getDayLabelFromKey(key);
  });

const handleCellClick = (date: string, unit: number) => {
  if (dragState) return;

  const timeLabel = formatTimeLabel(unit); // "08:00" or "08:30"
  const title = window.prompt(`Task for ${date} at ${timeLabel}?`);
  if (!title) return;

  setTasks((prev) => {
    // If user clicked inside an existing block on that day, just change its title
    const existingIndex = prev.findIndex(
      (t) =>
        t.date === date &&
        t.startHour <= unit &&
        unit < t.endHour
    );

    if (existingIndex !== -1) {
      const updated = { ...prev[existingIndex], title };
      const copy = [...prev];
      copy[existingIndex] = updated;
      return copy;
    }

    // Auto color based on how many tasks the day already has
    const tasksForDay = prev.filter((t) => t.date === date);
    const colorIndex = tasksForDay.length % COLORS.length;
    const color = COLORS[colorIndex];

    const startUnit = unit;
    const endUnit = Math.min(TOTAL_UNITS, startUnit + UNITS_PER_HOUR); // 1 hour = 2 units

    const newTask: TaskBlock = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      date,
      startHour: startUnit,
      endHour: endUnit, // default: 1 hour
      color,
      urgent: false,
    };


    return [...prev, newTask];
  });
};



const handleDropOnCell = (date: string, unit: number) => {
    if (!dragState) return;

    setTasks((prev) => {
      // 1. Find the task being dragged
      const idx = prev.findIndex((t) => t.id === dragState.taskId);
      if (idx === -1) return prev;
      
      const originalTask = prev[idx];
      const duration = originalTask.endHour - originalTask.startHour;
      
      // 2. Calculate Proposed Start/End (without clamping yet)
      let newStart = originalTask.startHour;
      let newEnd = originalTask.endHour;
      let targetDate = date; // The date column we dropped on

      if (dragState.mode === "move") {
        newStart = unit; // The cell we dropped on
        newEnd = unit + duration;
      } else if (dragState.mode === "resize-start") {
        newStart = unit;
        // Prevent zero/negative duration
        if (originalTask.endHour - newStart < 1) newStart = originalTask.endHour - 1;
        newEnd = originalTask.endHour;
        targetDate = originalTask.date; // Resizing keeps original date unless handled specifically
      } else if (dragState.mode === "resize-end") {
        newEnd = unit + 1; // drop on a cell implies that cell is included
        if (newEnd - originalTask.startHour < 1) newEnd = originalTask.startHour + 1;
        newStart = originalTask.startHour;
        targetDate = originalTask.date;
      }

      // 3. Remove the old task
      const tasksWithoutOld = prev.filter(t => t.id !== originalTask.id);

      // 4. Generate new task(s) using the split logic
      // Note: We update the date to targetDate before splitting
      const baseTask = { ...originalTask, date: targetDate };
      const newBlocks = splitTaskAcrossDays(baseTask, newStart, newEnd);

      return [...tasksWithoutOld, ...newBlocks];
    });

    setDragState(null);
  };






  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSplitTask = (taskId: string, splitAtUnit: number) => {
  setTasks((prev) => {
    const taskIndex = prev.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) return prev;

    const taskToSplit = prev[taskIndex];

    // Ensure the split point is valid (not at the very start or end)
    if (splitAtUnit <= taskToSplit.startHour || splitAtUnit >= taskToSplit.endHour) {
      return prev;
    }

    // Create the first new task (before the split)
    const taskA: TaskBlock = {
      ...taskToSplit,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, // new ID
      endHour: splitAtUnit, // ends at the split
    };

    // Create the second new task (after the split)
    const taskB: TaskBlock = {
      ...taskToSplit,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, // new ID
      startHour: splitAtUnit, // starts at the split
    };

    // Replace the old task with the two new ones
    const copy = [...prev];
    copy.splice(taskIndex, 1, taskA, taskB);
    return copy;
  });
};

  const handleClearAll = () => {
    if (window.confirm("Clear all tasks?")) {
      setTasks([]);
    }
  };

  const handleRunAi = async () => {
    if (!aiPrompt.trim()) return;

    try {
      setAiStatus("loading");
      setAiError(null);
      const actions = await callAiPlanner(aiPrompt, tasks, todayKey);
      console.log("AI actions from backend:", actions);   // <— add this
      setTasks((prev) => applyAiPlan(actions, prev));
      setAiStatus("done");
    } catch (err) {
      console.error(err);
      setAiStatus("error");
      setAiError("AI request failed. Check console/backend.");
    }
  };


  const monthLabel = calendarMonthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const monthWeeks = buildMonthGrid(calendarMonthStart);

  const handleMonthChange = (deltaMonths: number) => {
    setCalendarMonthStart((prev) => {
      const y = prev.getFullYear();
      const m = prev.getMonth();
      return new Date(y, m + deltaMonths, 1);
    });
  };

  const handleSelectDateFromMini = (d: Date) => {
    const key = formatDateKey(d);
    setCenterDateKey(key);
  };

  const handleStartResizeDetails = (e: React.MouseEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startWidth = detailsWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(
        420,
        Math.max(180, startWidth - deltaX)
      );
      setDetailsWidth(newWidth);
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleCloseDetails = () => {
    setSelectedTaskId(null);
    setIsColorPickerOpen(false);
    setIsUrgentPickerOpen(false);
  };

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;



  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 border-b bg-white flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">TimeBlocks</h1>
          <p className="text-sm text-slate-500">
            Generic time-blocking calendar (scroll horizontally for more days).
          </p>
        </div>
        <button
          onClick={handleClearAll}
          className="text-sm px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-100"
        >
          Clear all
        </button>
      </header>

      <main className="flex-1 overflow-hidden p-4 select-none">
        <div className="max-w-7xl w-full mx-auto h-full flex gap-4">
          {/* Left: mini month calendar (unchanged in behavior) */}
          <aside className="w-64 bg-white rounded-xl shadow-sm border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <button
                className="px-2 text-sm rounded hover:bg-slate-100"
                onClick={() => handleMonthChange(-1)}
              >
                ‹
              </button>
              <div className="text-sm font-medium">{monthLabel}</div>
              <button
                className="px-2 text-sm rounded hover:bg-slate-100"
                onClick={() => handleMonthChange(1)}
              >
                ›
              </button>
            </div>

            <div className="grid grid-cols-7 text-[11px] text-slate-500 mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                <div key={d} className="h-6 flex items-center justify-center">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-[2px] text-xs">
              {monthWeeks.map((week, wi) =>
                week.map((day, di) => {
                  if (!day) {
                    return <div key={`${wi}-${di}`} className="h-7" />;
                  }
                  const key = formatDateKey(day);
                  const isToday = key === todayKey;
                  const isCenter = key === centerDateKey;

                  let className =
                    "h-7 flex items-center justify-center rounded cursor-pointer";
                  if (isCenter) {
                    className += " bg-blue-500 text-white";
                  } else if (isToday) {
                    className += " border border-blue-400 text-blue-700";
                  } else {
                    className += " hover:bg-slate-100";
                  }

                  return (
                    <button
                      key={`${wi}-${di}`}
                      className={className}
                      onClick={() => handleSelectDateFromMini(day)}
                    >
                      {day.getDate()}
                    </button>
                  );
                })
              )}
            </div>

                        {/* AI assistant panel (bottom-left) */}
            <div className="mt-4 pt-3 border-t border-slate-200 text-xs">
              <div className="font-semibold text-slate-600 mb-1">
                AI assistant
              </div>
              <textarea
                className="w-full h-20 text-xs border border-slate-300 rounded-md px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder='Example: "Tomorrow 9–11am block CSAPP study and delete today&apos;s test block."'
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <button
                className="mt-2 w-full px-2 py-1 rounded-md text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
                onClick={handleRunAi}
                disabled={aiStatus === "loading"}
              >
                {aiStatus === "loading" ? "Thinking..." : "Ask AI to arrange"}
              </button>

              {aiStatus === "done" && (
                <p className="mt-1 text-[11px] text-emerald-600">
                  Applied latest AI plan.
                </p>
              )}
              {aiStatus === "error" && aiError && (
                <p className="mt-1 text-[11px] text-red-600">
                  {aiError}
                </p>
              )}
            </div>

          </aside>

          {/* Right: main time-blocking view with horizontal scroll */}
          <section className="flex-1 bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col">
            

            {/* This wrapper gives us vertical + horizontal scrollbars */}
            <div ref={scrollRef} className="flex-1 overflow-auto">
              {/* Inner wrapper is wider than the viewport, so we get a horizontal scrollbar */}
              <div className="inline-block min-w-max">
                {/* Header row */}
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `80px repeat(${dayCols.length}, 160px)`,
                  }}
                >
                  <div className="border-b border-r bg-slate-50" />
                    {dayCols.map((day) => {
                      const isToday = day.date === todayKey;

                      const base =
                        "border-b border-r px-3 py-2 text-sm font-medium text-center";
                      const headerClass = isToday
                        ? `${base} bg-blue-100 text-blue-700`
                        : `${base} bg-slate-50 text-slate-700`;

                      return (
                        <div key={day.date} className={headerClass}>
                          {day.label}
                        </div>
                      );
                    })}

                </div>

                {/* Hour rows */}
                <div>
                  {/* Hour rows */}
                  {unitRange.map((unit) => {
                    const { hour, minute } = unitToTime(unit);
                    const isFullHourRow = minute === 0;
                    const showLabel = isFullHourRow;

                    return (
                      <div
                        key={unit}
                        className="grid"
                        style={{
                          gridTemplateColumns: `80px repeat(${dayCols.length}, 160px)`,
                        }}
                      >
                        {/* Left time label column */}
                        <div
                          className={
                            "bg-slate-50 text-xs text-slate-500 px-2 py-1 flex items-start justify-end border-r" +
                            (isFullHourRow ? " border-t" : "")
                          }
                        >
                          {showLabel ? `${hour.toString().padStart(2, "0")}:00` : ""}
                        </div>

                        {/* Day cells */}
                                                {/* Day cells */}
                        {dayCols.map((day) => {
                          const cellKey = `${day.date}-${unit}`;
                          const cellTasks = tasksByCell.get(cellKey) || [];

                          // show at most 3 overlapping tasks in this 30-min slot
                          const visibleTasks = cellTasks.slice(0, 3);

                          // Find tasks that *start* in this cell
                          const startingTasks = cellTasks.filter(t => t.startHour === unit);

                          // A task "continues" if it exists in this cell but did *not* start here
                          const hasContinuingTask = cellTasks.length > 0 && startingTasks.length === 0;

                          const { minute } = unitToTime(unit);
                          const isFullHourRow = minute === 0;

                          // NEW BORDER LOGIC:
                          // Draw a top border if it's a full hour,
                          // UNLESS a task is continuing from the cell above.
                          const showTopBorder = isFullHourRow && !hasContinuingTask;

                          const cellClass =
                            "relative border-r h-6 cursor-pointer hover:bg-slate-50" +
                            (showTopBorder ? " border-t" : "");

                          return (
                            <div
                              key={day.date}
                              className={cellClass}
                              onClick={() => handleCellClick(day.date, unit)}
                              onMouseUp={() => handleDropOnCell(day.date, unit)}
                            >
                              {visibleTasks.length > 0 && (
                                // Split the cell horizontally into 1–3 columns
                                <div className="absolute inset-0 flex gap-[1px]">
                                  {visibleTasks.map((task) => {
                                    const isStart = task.startHour === unit;
                                    const isEnd = task.endHour - 1 === unit;
                                    {/* --- ADD THESE 6 LINES --- */}
                                    // Get max overlap for this task *anywhere*
                                    const maxOverlap = taskMaxOverlaps.get(task.id) || 1;
                                    // Get overlap for this task *in this specific cell*
                                    const currentOverlap = Math.min(visibleTasks.length, 3);

                                    // Calculate relative hotspot size
                                    const hotspotWidth = (currentOverlap / maxOverlap) * 20;
                                    const hotspotLeft = (currentOverlap / maxOverlap) * 40;

                                    

                                    let segmentClass =
                                      `${task.color} flex-1 text-[10px] text-white px-1 flex flex-col relative`;

                                    if (isStart && isEnd) {
                                      segmentClass += " rounded";
                                    } else if (isStart) {
                                      segmentClass += " rounded-t-md";
                                    } else if (isEnd) {
                                      segmentClass += " rounded-b-md";
                                    }

                                    // NEW FIX: If this is NOT the starting segment,
                                    // pull it up by 1 pixel to overlap any grid line from the cell.
                                    if (!isStart) {
                                      segmentClass += " -mt-px";
                                    }
                                    

                                    return (
                                      <div
                                        key={task.id}
                                        className={segmentClass}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTaskId(task.id);
                                          setIsColorPickerOpen(false);
                                          setIsUrgentPickerOpen(false);
                                        }}
                                        // --- ADD THESE LINES ---
                                        onMouseLeave={() => {
                                          setSplitHover(null);
                                        }}
                                        // --- END OF ADDITION ---
                                      >

                                        {/* top resize handle */}
                                        {isStart && (
                                          <div
                                            className="h-1 w-full cursor-n-resize"
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              setDragState({
                                                taskId: task.id,
                                                mode: "resize-start",
                                              });
                                            }}
                                          />
                                        )}

                                        {/* middle move area */}
                                        <div
                                          className="flex-1 flex items-center justify-between"
                                          onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setDragState({
                                              taskId: task.id,
                                              mode: "move",
                                            });
                                          }}
                                        >
                                          <span className="truncate flex items-center gap-1">
                                            {task.urgent && (
                                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                                            )}
                                            <span className="truncate">
                                              {task.title}
                                            </span>
                                          </span>

                                          <button
                                            className="ml-1 text-[9px] opacity-80 hover:opacity-100"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteTask(task.id);
                                            }}
                                          >
                                            ✕
                                          </button>
                                        </div>

                                        {/* --- ADD ALL THE CODE BELOW --- */}

                                        {/* --- REPLACEMENT BLOCK STARTS HERE --- */}

                                        {/* This is the invisible hover target. */}
                                        {/* It sits at the bottom of every segment *except* the last one. */}
                                        {!isEnd && (
                                          <div
                                            // REQ 1: Hotspot is calculated relative to narrowest width
                                            className="absolute -bottom-1 h-2 z-10"
                                            style={{
                                              cursor: "row-resize",
                                              left: `${hotspotLeft}%`,
                                              width: `${hotspotWidth}%`,
                                            }}
                                            onMouseEnter={() => {
                                              // REQ 2: Don't show crop UI if resizing
                                              if (dragState) return;
                                              setSplitHover({ taskId: task.id, splitAtUnit: unit + 1 });
                                            }}
                                            // REQ 3: Handle long press vs. click
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              // REQ 2: Don't do anything if resizing
                                              if (dragState) return;
                                              
                                              // Clear any previous timer
                                              if (longPressTimer.current) clearTimeout(longPressTimer.current);
                                              
                                              // Start a 1-second timer
                                              longPressTimer.current = setTimeout(() => {
                                                // 1 second passed: This is a "move"
                                                setDragState({ taskId: task.id, mode: "move" });
                                                setSplitHover(null); // Hide crop UI
                                                longPressTimer.current = null;
                                              }, 1000);
                                            }}
                                            onMouseUp={(e) => {
                                              e.stopPropagation();
                                              // If timer is still running, it was a "short click"
                                              if (longPressTimer.current) {
                                                clearTimeout(longPressTimer.current);
                                                longPressTimer.current = null;
                                                
                                                // Perform the "split"
                                                handleSplitTask(task.id, unit + 1);
                                                setSplitHover(null);
                                              }
                                              // If timer is null, long press already fired and started a "move"
                                            }}
                                            onMouseLeave={() => {
                                              // Cancel timer if mouse leaves hotspot
                                              if (longPressTimer.current) {
                                                clearTimeout(longPressTimer.current);
                                                longPressTimer.current = null;
                                              }
                                            }}
                                          />
                                        )}

                                        {/* This is the VISIBLE UI (dashed line + icon) */}
                                        {/* REQ 1 & 2: Show only in the middle 20% and only if not resizing */}
                                        {splitHover?.taskId === task.id && splitHover?.splitAtUnit === unit + 1 && !dragState && (
                                          <div
                                            // REQ 1: Match the hotspot width
                                            className="absolute -bottom-1 h-2 flex items-center z-20 pointer-events-none"
                                            style={{
                                              left: `${hotspotLeft}%`,
                                              width: `${hotspotWidth}%`,
                                            }}
                                          >
                                            {/* Dashed line */}
                                            <div className="flex-1 border-t border-dashed border-white opacity-75" />
                                            {/* Scissor Icon (using emoji) */}
                                            <div className="absolute left-1/2 -translate-x-1/2 bg-white rounded-full p-0.5 text-xs shadow-lg">
                                              ✂️
                                            </div>
                                          </div>
                                        )}

                                        {/* --- REPLACEMENT BLOCK ENDS HERE --- */}

                                        {/* --- END OF NEW CODE --- */}


                                        {/* bottom resize handle */}
                                        {isEnd && (
                                          <div
                                            className="h-1 w-full cursor-s-resize"
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              setDragState({
                                                taskId: task.id,
                                                mode: "resize-end",
                                              });
                                            }}
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}

                      </div>
                    );
                  })}


                </div>
              </div>
            </div>
          </section>

          
          {/* Task properties panel */}
          {selectedTask && (
            <aside
              className="bg-white rounded-xl shadow-sm border p-4 flex flex-col relative"
              style={{ width: detailsWidth }}
            >
              {/* Drag handle on the left edge of the panel */}
              <div
                className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize"
                onMouseDown={handleStartResizeDetails}
              />

              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Task details</h2>
                <button
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"
                  onClick={handleCloseDetails}
                >
                  ×
                </button>
              </div>


              <div className="space-y-3 text-sm">
                {/* Name row */}
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">
                    Name
                  </div>
                  <button
                    className="w-full text-left px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      const next = window.prompt(
                        "Edit task name:",
                        selectedTask.title
                      );
                      if (!next) return;
                      setTasks((prev) =>
                        prev.map((t) =>
                          t.id === selectedTask.id ? { ...t, title: next } : t
                        )
                      );
                    }}
                  >
                    {selectedTask.title || "(untitled)"}
                  </button>
                </div>

                {/* Color row */}
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">
                    Color
                  </div>

                  <button
                    className="inline-flex items-center gap-2 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      setIsColorPickerOpen((open) => !open);
                      setIsUrgentPickerOpen(false);
                    }}
                  >
                    <span
                      className={`inline-block w-3 h-3 rounded-full ${selectedTask.color}`}
                    />
                    <span>Change color</span>
                  </button>

                  {isColorPickerOpen && (
                    <div className="mt-1 grid grid-cols-6 gap-1">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          className={`w-6 h-6 rounded-full border ${
                            c === selectedTask.color
                              ? "ring-2 ring-offset-1 ring-slate-400"
                              : ""
                          } ${c}`}
                          onClick={() => {
                            setTasks((prev) =>
                              prev.map((t) =>
                                t.id === selectedTask.id ? { ...t, color: c } : t
                              )
                            );
                            setIsColorPickerOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Urgent row */}
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">
                    Urgent
                  </div>
                  <button
                    className="inline-flex items-center gap-2 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      setIsUrgentPickerOpen((open) => !open);
                      setIsColorPickerOpen(false);
                    }}
                  >
                    <span>
                      Urgent [{selectedTask.urgent ? "yes" : "no"}]
                    </span>
                  </button>

                  {isUrgentPickerOpen && !selectedTask.urgent && (
                    <div className="mt-1 border border-slate-200 rounded overflow-hidden">
                      <button
                        className="w-full px-2 py-1 text-left hover:bg-slate-100 text-sm"
                        onClick={() => {
                          // Turn urgent on
                          setTasks((prev) =>
                            prev.map((t) => {
                              if (t.id !== selectedTask.id) return t;
                              let nextColor = t.color;
                              // If the color is already red-ish, switch to a non-red color
                              if (
                                nextColor.includes("rose") ||
                                nextColor.includes("red")
                              ) {
                                const nonRed = COLORS.filter(
                                  (c) =>
                                    !c.includes("rose") && !c.includes("red")
                                );
                                if (nonRed.length > 0) {
                                  nextColor =
                                    nonRed[
                                      Math.floor(
                                        Math.random() * nonRed.length
                                      )
                                    ];
                                }
                              }
                              return {
                                ...t,
                                urgent: true,
                                color: nextColor,
                              };
                            })
                          );
                          setIsUrgentPickerOpen(false);
                        }}
                      >
                        yes
                      </button>
                    </div>
                  )}

                  {isUrgentPickerOpen && selectedTask.urgent && (
                    <div className="mt-1 border border-slate-200 rounded overflow-hidden">
                      <button
                        className="w-full px-2 py-1 text-left hover:bg-slate-100 text-sm"
                        onClick={() => {
                          // Turn urgent off
                          setTasks((prev) =>
                            prev.map((t) =>
                              t.id === selectedTask.id ? { ...t, urgent: false } : t
                            )
                          );
                          setIsUrgentPickerOpen(false);
                        }}
                      >
                        no
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}




        </div>
      </main>
    </div>
  );
};

export default App;
