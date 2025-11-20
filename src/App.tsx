import React, { useEffect, useMemo, useRef, useState } from "react";
// We use 'type' to tell Vite these are just definitions, not real code
import { getLogicalId, type TaskBlock, type DragMode } from "./types";
import { TaskBlockComponent } from "./components/TaskBlock";
import {
  HOURS_START,
  TOTAL_UNITS,
  UNITS_PER_HOUR,
  COLORS,
  unitToTime,
  formatTimeLabel,
  formatDateKey,
  parseDateKey,
  addDaysToKey,
  getDayLabelFromKey,
  buildMonthGrid,
  splitTaskAcrossDays,
} from "./utils/timeLogic";
import { callAiPlanner, applyAiPlan } from "./utils/aiLogic";

const STORAGE_KEY = "timeblocks_tasks_v1";
const VISIBLE_DAYS = 21;
const CENTER_INDEX = Math.floor(VISIBLE_DAYS / 2);
const todayKey = formatDateKey(new Date());

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

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStatus, setAiStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [aiError, setAiError] = useState<string | null>(null);

  const [centerDateKey, setCenterDateKey] = useState<string>(todayKey);
  const [dragState, setDragState] = useState<{ taskId: string; mode: DragMode } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [detailsWidth, setDetailsWidth] = useState(256);

  const [calendarMonthStart, setCalendarMonthStart] = useState<Date>(() => {
    const d = parseDateKey(todayKey);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const d = parseDateKey(centerDateKey);
    setCalendarMonthStart(new Date(d.getFullYear(), d.getMonth(), 1));
  }, [centerDateKey]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const rowHeightPx = 24; 
    const targetHour = 6;   
    const offsetUnits = (targetHour - HOURS_START) * UNITS_PER_HOUR;
    const scrollTop = Math.max(0, offsetUnits * rowHeightPx - 80);
    scrollRef.current.scrollTop = scrollTop;
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const timeColWidth = 80;   
    const dayColWidth = 160;   
    const columnCenter = timeColWidth + dayColWidth * CENTER_INDEX + dayColWidth / 2;
    const desiredScrollLeft = Math.max(0, columnCenter - container.clientWidth / 2);
    container.scrollLeft = desiredScrollLeft;
  }, [centerDateKey]);

  const tasksByCell = useMemo(() => {
    const map = new Map<string, TaskBlock[]>();
    for (const t of tasks) {
      for (let h = t.startHour; h < t.endHour; h++) {
        const key = `${t.date}-${h}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(t);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.startHour !== b.startHour) return a.startHour - b.startHour;
        return a.title.localeCompare(b.title);
      });
    }
    return map;
  }, [tasks]);

  const taskMaxOverlaps = useMemo(() => {
    const map = new Map<string, number>();
    if (!tasksByCell.size) return map;
    for (const task of tasks) {
      let maxOverlapInAnyCell = 1;
      for (let unit = task.startHour; unit < task.endHour; unit++) {
        const key = `${task.date}-${unit}`;
        const cellTasks = tasksByCell.get(key);
        if (cellTasks) {
          const idx = cellTasks.findIndex(t => t.id === task.id);
          if (idx !== -1 && idx < 3) {
            maxOverlapInAnyCell = Math.max(maxOverlapInAnyCell, cellTasks.length);
          }
        }
      }
      map.set(task.id, Math.min(maxOverlapInAnyCell, 3));
    }
    return map;
  }, [tasks, tasksByCell]);

  const unitRange = Array.from({ length: TOTAL_UNITS }, (_, i) => i);
  const dayOffsets = Array.from({ length: VISIBLE_DAYS }, (_, i) => i - CENTER_INDEX);
  const dayCols = dayOffsets.map((offset) => {
    const key = addDaysToKey(centerDateKey, offset);
    return getDayLabelFromKey(key);
  });

  const handleCellClick = (date: string, unit: number) => {
    if (dragState) return;
    const timeLabel = formatTimeLabel(unit);
    const title = window.prompt(`Task for ${date} at ${timeLabel}?`);
    if (!title) return;

    setTasks((prev) => {
      const existingIndex = prev.findIndex(
        (t) => t.date === date && t.startHour <= unit && unit < t.endHour
      );
      if (existingIndex !== -1) {
        const updated = { ...prev[existingIndex], title };
        const copy = [...prev];
        copy[existingIndex] = updated;
        return copy;
      }
      const tasksForDay = prev.filter((t) => t.date === date);
      const colorIndex = tasksForDay.length % COLORS.length;
      const startUnit = unit;
      const endUnit = Math.min(TOTAL_UNITS, startUnit + UNITS_PER_HOUR);
      const newTask: TaskBlock = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        date,
        startHour: startUnit,
        endHour: endUnit,
        color: COLORS[colorIndex],
        urgent: false,
      };
      return [...prev, newTask];
    });
  };

  const handleDropOnCell = (date: string, unit: number) => {
    if (!dragState) return;
    setTasks((prev) => {
      const draggedTask = prev.find((t) => t.id === dragState.taskId);
      if (!draggedTask) return prev;

      const logicalId = getLogicalId(draggedTask.id);
      const family = prev.filter((t) => getLogicalId(t.id) === logicalId);
      family.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startHour - b.startHour;
      });
      const head = family[0];
      const tail = family[family.length - 1];

      const getAbs = (d: string, u: number) => {
        const dayDiff = (parseDateKey(d).getTime() - parseDateKey(head.date).getTime()) / (1000 * 60 * 60 * 24);
        return dayDiff * TOTAL_UNITS + u;
      };

      const oldGlobalStart = getAbs(head.date, head.startHour);
      const oldGlobalEnd = getAbs(tail.date, tail.endHour);
      const totalDuration = oldGlobalEnd - oldGlobalStart;
      let newGlobalStart = oldGlobalStart;
      let newTotalDuration = totalDuration;
      const dropLocationAbs = getAbs(date, unit);

      if (dragState.mode === "move") {
        const oldSegmentStartAbs = getAbs(draggedTask.date, draggedTask.startHour);
        const delta = dropLocationAbs - oldSegmentStartAbs;
        newGlobalStart = oldGlobalStart + delta;
      } else if (dragState.mode === "resize-start") {
        if (dropLocationAbs < oldGlobalEnd) {
           newGlobalStart = dropLocationAbs;
           newTotalDuration = oldGlobalEnd - newGlobalStart;
        }
      } else if (dragState.mode === "resize-end") {
        if (dropLocationAbs > oldGlobalStart) {
           const newEndAbs = dropLocationAbs + 1;
           newTotalDuration = newEndAbs - oldGlobalStart;
        }
      }

      const others = prev.filter((t) => getLogicalId(t.id) !== logicalId);
      const newBlocks = splitTaskAcrossDays(head, newGlobalStart, newTotalDuration);
      return [...others, ...newBlocks];
    });
    setDragState(null);
  };

  const handleDeleteTask = (id: string) => {
    const logicalId = getLogicalId(id);
    setTasks((prev) => prev.filter((t) => getLogicalId(t.id) !== logicalId));
  };

  const handleSplitTask = (taskId: string, splitAtUnit: number) => {
    setTasks((prev) => {
      const taskIndex = prev.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) return prev;
      const taskToSplit = prev[taskIndex];
      if (splitAtUnit <= taskToSplit.startHour || splitAtUnit >= taskToSplit.endHour) return prev;
      
      const idA = `${Date.now()}-a-${Math.random().toString(16).slice(2)}`;
      const idB = `${Date.now()}-b-${Math.random().toString(16).slice(2)}`;
      const taskA: TaskBlock = { ...taskToSplit, id: idA, endHour: splitAtUnit };
      const taskB: TaskBlock = { ...taskToSplit, id: idB, startHour: splitAtUnit };
      
      const copy = [...prev];
      copy.splice(taskIndex, 1, taskA, taskB);
      return copy;
    });
  };

  const handleClearAll = () => {
    if (window.confirm("Clear all tasks?")) setTasks([]);
  };

  const handleRunAi = async () => {
    if (!aiPrompt.trim()) return;
    try {
      setAiStatus("loading");
      setAiError(null);
      const actions = await callAiPlanner(aiPrompt, tasks, todayKey);
      console.log("AI actions from backend:", actions);
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

  const handleStartResizeDetails = (e: React.MouseEvent<HTMLDivElement>) => {
    const startX = e.clientX;
    const startWidth = detailsWidth;
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(420, Math.max(180, startWidth - deltaX));
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

  const selectedTask = tasks.find(
    (t) => selectedTaskId && getLogicalId(t.id) === selectedTaskId
  ) || null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-4 border-b bg-white flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">TimeBlocks</h1>
          <p className="text-sm text-slate-500">Generic time-blocking calendar.</p>
        </div>
        <button onClick={handleClearAll} className="text-sm px-3 py-1 rounded-md border border-slate-300 hover:bg-slate-100">
          Clear all
        </button>
      </header>

      <main className="flex-1 overflow-hidden p-4 select-none">
        <div className="max-w-7xl w-full mx-auto h-full flex gap-4">
          <aside className="w-64 bg-white rounded-xl shadow-sm border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <button className="px-2 text-sm rounded hover:bg-slate-100" onClick={() => handleMonthChange(-1)}>‹</button>
              <div className="text-sm font-medium">{monthLabel}</div>
              <button className="px-2 text-sm rounded hover:bg-slate-100" onClick={() => handleMonthChange(1)}>›</button>
            </div>
            <div className="grid grid-cols-7 text-[11px] text-slate-500 mb-1">
              {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                <div key={d} className="h-6 flex items-center justify-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[2px] text-xs">
              {monthWeeks.map((week, wi) =>
                week.map((day, di) => {
                  if (!day) return <div key={`${wi}-${di}`} className="h-7" />;
                  const key = formatDateKey(day);
                  const isToday = key === todayKey;
                  const isCenter = key === centerDateKey;
                  let className = "h-7 flex items-center justify-center rounded cursor-pointer";
                  if (isCenter) className += " bg-blue-500 text-white";
                  else if (isToday) className += " border border-blue-400 text-blue-700";
                  else className += " hover:bg-slate-100";
                  return (
                    <button key={`${wi}-${di}`} className={className} onClick={() => setCenterDateKey(key)}>
                      {day.getDate()}
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200 text-xs">
              <div className="font-semibold text-slate-600 mb-1">AI assistant</div>
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
              {aiStatus === "done" && <p className="mt-1 text-[11px] text-emerald-600">Applied latest AI plan.</p>}
              {aiStatus === "error" && aiError && <p className="mt-1 text-[11px] text-red-600">{aiError}</p>}
            </div>
          </aside>

          <section className="flex-1 bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col">
            <div ref={scrollRef} className="flex-1 overflow-auto">
              <div className="inline-block min-w-max">
                <div className="grid" style={{ gridTemplateColumns: `80px repeat(${dayCols.length}, 160px)` }}>
                  <div className="border-b border-r bg-slate-50 sticky left-0 z-30" />
                  {dayCols.map((day) => {
                    const isToday = day.date === todayKey;
                    const base = "border-b border-r px-3 py-2 text-sm font-medium text-center";
                    const headerClass = isToday ? `${base} bg-blue-100 text-blue-700` : `${base} bg-slate-50 text-slate-700`;
                    return <div key={day.date} className={headerClass}>{day.label}</div>;
                  })}
                </div>

                <div>
                  {unitRange.map((unit) => {
                    const { hour, minute } = unitToTime(unit);
                    const isFullHourRow = minute === 0;
                    const showLabel = isFullHourRow;
                    return (
                      <div key={unit} className="grid" style={{ gridTemplateColumns: `80px repeat(${dayCols.length}, 160px)` }}>
                        <div className={"bg-slate-50 text-xs text-slate-500 px-2 py-1 flex items-start justify-end border-r sticky left-0 z-30" + (isFullHourRow ? " border-t" : "")}>
                          {showLabel ? `${hour.toString().padStart(2, "0")}:00` : ""}
                        </div>

                        {dayCols.map((day) => {
                          const cellKey = `${day.date}-${unit}`;
                          const cellTasks = tasksByCell.get(cellKey) || [];
                          const visibleTasks = cellTasks.slice(0, 3);
                          const startingTasks = cellTasks.filter(t => t.startHour === unit);
                          const hasContinuingTask = cellTasks.length > 0 && startingTasks.length === 0;
                          const showTopBorder = isFullHourRow && !hasContinuingTask;
                          const containsActiveSplit = visibleTasks.some(t => splitHover?.taskId === t.id && splitHover?.splitAtUnit === unit + 1);
                          const cellClass = "relative border-r h-6 cursor-pointer hover:bg-slate-50" + (showTopBorder ? " border-t" : "") + (containsActiveSplit ? " z-20" : "");

                          return (
                            <div
                              key={day.date}
                              className={cellClass}
                              onClick={() => handleCellClick(day.date, unit)}
                              onMouseUp={() => handleDropOnCell(day.date, unit)}
                            >
                              {visibleTasks.length > 0 && (
                                <div className="absolute inset-0 flex gap-[1px]">
                                  {visibleTasks.map((task) => {
                                    const isStart = task.startHour === unit;
                                    const isEnd = task.endHour - 1 === unit;
                                    const maxOverlap = taskMaxOverlaps.get(task.id) || 1;
                                    const currentOverlap = Math.min(visibleTasks.length, 3);
                                    const hotspotWidth = (currentOverlap / maxOverlap) * 20;
                                    const hotspotLeft = (currentOverlap / maxOverlap) * 40;

                                    return (
                                      <TaskBlockComponent
                                        key={task.id}
                                        task={task}
                                        unit={unit}
                                        isStart={isStart}
                                        isEnd={isEnd}
                                        hotspot={{ left: hotspotLeft, width: hotspotWidth }}
                                        dragState={dragState}
                                        splitHover={splitHover}
                                        onDragStart={(taskId, mode) => setDragState({ taskId, mode })}
                                        onClick={() => {
                                            setSelectedTaskId(getLogicalId(task.id));
                                            setIsColorPickerOpen(false);
                                            setIsUrgentPickerOpen(false);
                                        }}
                                        onDelete={handleDeleteTask}
                                        onSplitHover={(taskId, u) => setSplitHover({ taskId, splitAtUnit: u })}
                                        onSplitLeave={() => setSplitHover(null)}
                                        onSplitExecute={handleSplitTask}
                                      />
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

          {selectedTask && (
            <aside className="bg-white rounded-xl shadow-sm border p-4 flex flex-col relative" style={{ width: detailsWidth }}>
              <div className="absolute -left-1 top-0 bottom-0 w-2 cursor-col-resize" onMouseDown={handleStartResizeDetails} />
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Task details</h2>
                <button className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded" onClick={handleCloseDetails}>×</button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">Name</div>
                  <button
                    className="w-full text-left px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      const next = window.prompt("Edit task name:", selectedTask.title);
                      if (!next) return;
                      const rootId = selectedTaskId;
                      if (!rootId) return;
                      setTasks((prev) => prev.map((t) => getLogicalId(t.id) === rootId ? { ...t, title: next } : t));
                    }}
                  >
                    {selectedTask.title || "(untitled)"}
                  </button>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">Color</div>
                  <button
                    className="inline-flex items-center gap-2 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => { setIsColorPickerOpen((open) => !open); setIsUrgentPickerOpen(false); }}
                  >
                    <span className={`inline-block w-3 h-3 rounded-full ${selectedTask.color}`} />
                    <span>Change color</span>
                  </button>
                  {isColorPickerOpen && (
                    <div className="mt-1 grid grid-cols-6 gap-1">
                      {COLORS.map((c) => (
                        <button
                          key={c}
                          className={`w-6 h-6 rounded-full border ${c === selectedTask.color ? "ring-2 ring-offset-1 ring-slate-400" : ""} ${c}`}
                          onClick={() => {
                            const rootId = selectedTaskId;
                            if (!rootId) return;
                            setTasks((prev) => prev.map((t) => getLogicalId(t.id) === rootId ? { ...t, color: c } : t));
                            setIsColorPickerOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-400 mb-1">Urgent</div>
                  <button
                    className="inline-flex items-center gap-2 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50"
                    onClick={() => { setIsUrgentPickerOpen((open) => !open); setIsColorPickerOpen(false); }}
                  >
                    <span>Urgent [{selectedTask.urgent ? "yes" : "no"}]</span>
                  </button>
                  {isUrgentPickerOpen && (
                    <div className="mt-1 border border-slate-200 rounded overflow-hidden">
                       <button
                        className="w-full px-2 py-1 text-left hover:bg-slate-100 text-sm"
                        onClick={() => {
                          const rootId = selectedTaskId;
                          if (!rootId) return;
                          const isNowUrgent = !selectedTask.urgent;
                          setTasks((prev) => prev.map((t) => {
                              if (getLogicalId(t.id) !== rootId) return t;
                              let nextColor = t.color;
                              if (isNowUrgent && !nextColor.includes("rose") && !nextColor.includes("red")) {
                                nextColor = "bg-rose-400";
                              }
                              return { ...t, urgent: isNowUrgent, color: nextColor };
                          }));
                          setIsUrgentPickerOpen(false);
                        }}
                      >
                        {selectedTask.urgent ? "Set to NO" : "Set to YES"}
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