import { useState, useRef, useEffect, useCallback } from "react";
import { CheckSquare, Plus, Trash2, Pencil, Check, X, GripVertical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "task-card-tasks-v1";

type Task = { id: string; text: string; done: boolean };

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* noop */
  }
}

let idCounter = Date.now();
function newId() {
  return String(++idCounter);
}

export function TaskCard() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  // Persist on change
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // Focus edit input when entering edit mode
  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const addTask = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setTasks((prev) => [...prev, { id: newId(), text, done: false }]);
    setInput("");
    inputRef.current?.focus();
  }, [input]);

  const toggleDone = useCallback((id: string) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startEdit = useCallback((task: Task) => {
    setEditingId(task.id);
    setEditText(task.text);
  }, []);

  const commitEdit = useCallback(() => {
    const text = editText.trim();
    if (!text) {
      setEditingId(null);
      return;
    }
    setTasks((prev) => prev.map((t) => t.id === editingId ? { ...t, text } : t));
    setEditingId(null);
  }, [editingId, editText]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const doneCnt = tasks.filter((t) => t.done).length;

  return (
    <Card className="gold-frame p-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {tasks.length > 0 && (
            <span className="text-xs text-muted-foreground">{doneCnt}/{tasks.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg font-semibold">משימות</h3>
          <span className="gold-icon-circle"><CheckSquare className="h-4 w-4" /></span>
        </div>
      </div>

      {/* Add input */}
      <div className="flex gap-2 mb-3">
        <Button
          type="button"
          size="icon"
          onClick={addTask}
          className="bg-gradient-navy text-primary-foreground rounded-xl shrink-0 h-9 w-9"
          title="הוסף משימה"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="הוסף משימה חדשה..."
          className="border-2 border-gold/50 rounded-xl text-right flex-1"
        />
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">אין משימות עדיין — הוסף אחת!</p>
        )}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            isEditing={editingId === task.id}
            editText={editText}
            editRef={editRef}
            onToggle={() => toggleDone(task.id)}
            onDelete={() => deleteTask(task.id)}
            onStartEdit={() => startEdit(task)}
            onEditChange={setEditText}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
        ))}
      </div>
    </Card>
  );
}

function TaskRow({
  task,
  isEditing,
  editText,
  editRef,
  onToggle,
  onDelete,
  onStartEdit,
  onEditChange,
  onCommit,
  onCancel,
}: {
  task: Task;
  isEditing: boolean;
  editText: string;
  editRef: React.RefObject<HTMLInputElement>;
  onToggle: () => void;
  onDelete: () => void;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const hoverTimer = useRef<number | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setActionsVisible(true), 1000);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setActionsVisible(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-gold px-3 py-2">
        <button onClick={onCancel} className="text-muted-foreground hover:text-destructive shrink-0"><X className="h-4 w-4" /></button>
        <button onClick={onCommit} className="text-emerald-600 hover:text-emerald-700 shrink-0"><Check className="h-4 w-4" /></button>
        <Input
          ref={editRef}
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommit();
            if (e.key === "Escape") onCancel();
          }}
          className="border-0 p-0 h-auto text-right text-sm bg-transparent focus-visible:ring-0 flex-1"
        />
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-2 rounded-xl border-2 border-gold/40 px-3 py-2.5 transition-colors hover:bg-secondary/50 relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Actions — appear after hover delay */}
      <div className={cn(
        "flex items-center gap-1 transition-opacity duration-150 shrink-0",
        actionsVisible ? "opacity-100" : "opacity-0 pointer-events-none",
      )}>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive p-0.5 rounded"
          title="מחק"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onStartEdit}
          className="text-muted-foreground hover:text-gold p-0.5 rounded"
          title="ערוך"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Done toggle */}
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center justify-center h-6 w-6 rounded-md border-2 shrink-0 transition-colors",
          task.done
            ? "border-gold bg-gold/20 text-gold"
            : "border-gold/40 hover:border-gold/70 text-transparent hover:text-muted-foreground",
        )}
        title={task.done ? "בטל סימון" : "סמן כבוצע"}
      >
        <Check className="h-3.5 w-3.5" />
      </button>

      {/* Text */}
      <span
        className={cn(
          "flex-1 text-sm font-medium text-right cursor-pointer select-none",
          task.done && "line-through text-muted-foreground",
        )}
        onDoubleClick={onStartEdit}
      >
        {task.text}
      </span>
    </div>
  );
}
