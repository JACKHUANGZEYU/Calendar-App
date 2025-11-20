import React from "react";
import type { TaskBlock as TaskType, DragMode } from "../types";

interface TaskBlockProps {
  task: TaskType;
  unit: number;
  isStart: boolean;
  isEnd: boolean;
  hotspot: { left: number; width: number };
  dragState: { taskId: string; mode: DragMode } | null;
  splitHover: { taskId: string; splitAtUnit: number } | null;
  onDragStart: (taskId: string, mode: DragMode) => void;
  onClick: () => void;
  onDelete: (taskId: string) => void;
  onSplitHover: (taskId: string, unit: number) => void;
  onSplitLeave: () => void;
  onSplitExecute: (taskId: string, unit: number) => void;
}

export const TaskBlockComponent: React.FC<TaskBlockProps> = ({
  task,
  unit,
  isStart,
  isEnd,
  hotspot,
  dragState,
  splitHover,
  onDragStart,
  onClick,
  onDelete,
  onSplitHover,
  onSplitLeave,
  onSplitExecute
}) => {
  let segmentClass = `${task.color} flex-1 text-[10px] text-white px-1 flex flex-col relative`;

  if (isStart && isEnd) {
    segmentClass += " rounded";
  } else if (isStart) {
    segmentClass += " rounded-t-md";
  } else if (isEnd) {
    segmentClass += " rounded-b-md";
  }

  if (!isStart) {
    segmentClass += " -mt-px";
  }

  return (
    <div
      key={task.id}
      className={`${segmentClass} ${dragState ? "pointer-events-none z-0" : "z-10"}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (dragState) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let hasMoved = false;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          const dx = Math.abs(moveEvent.clientX - startX);
          const dy = Math.abs(moveEvent.clientY - startY);
          if (dx > 5 || dy > 5) {
            hasMoved = true;
            onDragStart(task.id, "move");
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
          }
        };

        const handleMouseUp = () => {
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);

          if (!hasMoved) {
            onClick();
          }
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
      }}
      onMouseLeave={onSplitLeave}
    >
      {/* top resize handle */}
      {isStart && (
        <div
          className="h-1 w-full cursor-n-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDragStart(task.id, "resize-start");
          }}
        />
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-between">
        <span className="truncate flex items-center gap-1">
          {task.urgent && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
          )}
          <span className="truncate">{task.title}</span>
        </span>

        <button
          className="ml-1 text-[9px] opacity-80 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
        >
          ✕
        </button>
      </div>

      {/* Invisible crop hotspot */}
      {!isEnd && !dragState && (
        <div
          className="absolute -bottom-3 h-6 z-10"
          style={{
            cursor: "row-resize",
            left: `${hotspot.left}%`,
            width: `${hotspot.width}%`,
          }}
          onMouseEnter={() => onSplitHover(task.id, unit + 1)}
          onMouseLeave={onSplitLeave}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => {
            e.stopPropagation();
            onSplitExecute(task.id, unit + 1);
            onSplitLeave();
          }}
        />
      )}

      {/* Visible dashed line + scissors */}
      {splitHover?.taskId === task.id &&
        splitHover?.splitAtUnit === unit + 1 &&
        !dragState && (
          <div
            className="absolute -bottom-3 h-6 flex items-center justify-center z-20 pointer-events-none"
            style={{
              left: `${hotspot.left}%`,
              width: `${hotspot.width}%`,
            }}
          >
            <div className="flex-1 border-t border-dashed border-white opacity-75" />
            <div className="absolute left-1/2 -translate-x-1/2 bg-white rounded-full p-0.5 text-xs shadow-lg">
              ✂️
            </div>
          </div>
        )}

      {/* bottom resize handle */}
      {isEnd && (
        <div
          className="h-1 w-full cursor-s-resize"
          onMouseDown={(e) => {
            e.stopPropagation();
            onDragStart(task.id, "resize-end");
          }}
        />
      )}
    </div>
  );
};