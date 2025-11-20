// prompts/tools.js
export const AVAILABLE_TOOLS = `
### OUTPUT RULES
- Respond with raw JSON only: { "actions": [...] }.
- Use only the actions below. Do not invent fields or tools.
- Target tasks by exact "title" and "date" from Existing Tasks.
- One atomic user request = one action. Multiple requests = multiple actions in the same array.
- Times are 24-hour "HH:MM". Hours beyond 24:00 are valid for next-day spillover. Prefer 30-minute increments.
- Core principle: "move/shift/delay/push/bring forward" = change start/end together (no duration change). "extend/shorten/longer" = change duration.
- Exclusive insert policy (default when the user wants a new task that is NOT concurrent, e.g., "take a break", "watch a movie alone", "do nothing else"):
  1) Use the specified duration; default to 30 minutes if omitted.
  2) Carve the original task into two parts by RESIZING the original block to end at the new task start (newEnd = insertStart). If the user also moves the start earlier/later, set newStart accordingly.
  3) Insert the new task via "add" from insertStart to insertStart + duration (title provided by the user, e.g., "Break", "Watch Movie").
  4) Add the remaining part of the original task after the inserted task, with duration = originalDuration - firstPartDuration; start at insertEnd, end at insertEnd + remainingDuration.
  5) Keep the total duration of the original task unchanged unless the user explicitly changes it.
  6) If the user says the overlapping task is concurrent ("while studying", "at the same time"), DO NOT carve or shift the original task; simply add the overlapping task.
  7) Do not use "split" + "shift" to make a gap; it would move all parts together. Use the resize + add + add sequence instead.
- Property coherence for split tasks: If the user renames/sets color/sets urgent on a task that has been split into segments, apply the attribute change to all segments that share the same title across the relevant date(s).

### AVAILABLE ACTIONS (The only JSON objects you can create)

1) "split" (divide a task without deleting it):
   - When: User says cut/split/break into two parts.
   - Params: "title", "date", "atTime" (HH:MM).
   - Guardrails: atTime must be strictly inside the task window. Never simulate by delete+add or resize.

2) "shift" (move start and end together, keep duration):
   - When: User says move/shift/delay/postpone/push back/bring forward/start earlier/start later WITHOUT asking for a longer/shorter duration.
   - Params: "title", "date", "deltaMinutes" (number; + = later, - = earlier).
   - Guardrails: Duration stays identical. Do not set newStart/newEnd when shifting. Crossing midnight is fine; trust the client to wrap/split. Never change duration when verbs are about movement only. If user says "45 minutes or an hour", pick the first explicit quantity and shift by that (no resize).

3) "resize" (change duration, anchor the opposite edge):
   - When: User says extend/shorten/longer/shorter/end later/end earlier OR explicitly specifies a new start/end boundary for duration change.
   - Params: "title", "date", and either "newStart" or "newEnd" (HH:MM). Provide both only when the user provides both boundaries or a total extension + a partial boundary.
   - Default anchor: If the user only says "longer/extend by X" and gives no anchor, change the END time (newEnd = oldEnd + X). If the user only says "shorten/cut by X", change the END earlier (newEnd = oldEnd - X).
   - Start-bound tweaks: If the user says "start X earlier" AND also says "make it longer by Y", move the start earlier by X (newStart) and extend the end by the remaining (Y - X) if positive; if Y > X, split the increase between start and end as stated (example in few shots).
   - Guardrails: Use "newStart" for start adjustments, "newEnd" for end adjustments. Crossing midnight is allowed (e.g., "25:00").

4) "rename" | "setColor" | "setUrgent" | "add" | "delete":
   - Only use when explicitly requested by the user.
   - Colors list: "bg-rose-400", "bg-blue-500", "bg-emerald-400", "bg-amber-400".
`;
