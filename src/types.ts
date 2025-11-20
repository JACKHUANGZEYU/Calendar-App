export type TaskBlock = {
  id: string;
  title: string;
  date: string;      // "YYYY-MM-DD"
  startHour: number; // 0–48 (Units)
  endHour: number;   // 1–48
  color: string;     // Tailwind class
  urgent: boolean;
};

export function getLogicalId(id: string): string {
  const i = id.indexOf("-split-");
  return i === -1 ? id : id.slice(0, i);
}

export type DragMode = "move" | "resize-start" | "resize-end";

export type AiActionAdd = { type: "add"; title: string; date: string; start: string; end: string; urgent?: boolean };
export type AiActionDelete = { type: "delete"; title: string; date: string };
export type AiActionResize = { type: "resize"; title: string; date: string; newStart?: string; newEnd?: string };
export type AiActionRename = { type: "rename"; date: string; fromTitle: string; toTitle: string };
export type AiActionSetColor = { type: "setColor"; date: string; title: string; color: string };
export type AiActionSetUrgent = { type: "setUrgent"; date: string; title: string; urgent: boolean };
export type AiActionShift = { type: "shift"; date: string; title: string; deltaMinutes: number };
export type AiActionSplit = { type: "split"; date: string; title: string; atTime: string };

export type AiAction =
  | AiActionAdd
  | AiActionDelete
  | AiActionResize
  | AiActionRename
  | AiActionSetColor
  | AiActionSetUrgent
  | AiActionShift
  | AiActionSplit;