import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, ChevronLeft, Play } from "lucide-react";
import { db } from "../db";
import type { Card, Category } from "../features/study/types";
import OpenQuestionList from "./OpenQuestionList";

/**
 * ניווט בתיבות מתחלפות בעץ קטגוריות (למשל שולחן ערוך: חלק ← הלכות ← סימן ← סעיף ← השאלות).
 * רכיב משותף לשתי הפריסות (הנוכחית והמקורית) — אותו מידע, ומה שקורה בתרגול הוא של הפריסה שקראה לו.
 */
interface Props {
  /** שם קטגוריית השורש במאגר (למשל "טור") */
  rootName: string;
  /** השם שמוצג למשתמש לשורש (למשל "שולחן ערוך") */
  rootLabel: string;
  /** התחלת תרגול: השאלות, ומסלול השמות מהשורש (לפירורי הלחם) */
  onPractice: (cards: Card[], trail: string[]) => void;
}

/** שם קצר לתיבה: "סימן רמ״ב · סעיף א׳" ← "סעיף א׳". */
const shortName = (name: string) => name.split(" · ").pop() ?? name;

// המקום האחרון בעץ — כדי שחזרה מתרגול תחזיר לאותו מקום
const lastPath = new Map<string, string[]>();

interface Tree {
  root: Category | null;
  children: Map<string, Category[]>;
  total: Map<string, number>;
  byId: Map<string, Category>;
}
const treeCache = new Map<string, Tree | null>();
const rootIdCache = new Map<string, string | null>();

/** טוען רק את הענף של השורש: קטגוריות לפי רמות (אינדקס ההורה), ומונה שאלות לפי אינדקס הקטגוריה. */
async function loadTree(rootName: string): Promise<Tree | null> {
  let rootId = rootIdCache.get(rootName);
  if (rootId === undefined) {
    // לפי אינדקס השם (מיידי), ושומרים בזיכרון
    rootId = (await db.categories.where("name").equals(rootName).filter((c) => c.parentId === null).first())?.id ?? null;
    rootIdCache.set(rootName, rootId);
  }
  if (!rootId) return null;
  const root = (await db.categories.get(rootId)) ?? null;
  if (!root) return null;
  const all: Category[] = [root];
  let level = [rootId];
  while (level.length) {
    const kids = await db.categories.where("parentId").anyOf(level).toArray();
    all.push(...kids);
    level = kids.map((k) => k.id);
  }
  const children = new Map<string, Category[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    const list = children.get(c.parentId) ?? [];
    list.push(c);
    children.set(c.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name, "he"));
  // ספירה נפרדת לכל קטגוריה, במקביל (מהיר בהרבה משאילתה אחת על מאות מזהים)
  const direct = new Map<string, number>();
  const counts = await Promise.all(all.map((c) => db.cards.where("categoryId").equals(c.id).count()));
  all.forEach((c, i) => { if (counts[i]) direct.set(c.id, counts[i]); });
  const total = new Map<string, number>();
  const sum = (id: string): number => {
    let n = direct.get(id) ?? 0;
    for (const k of children.get(id) ?? []) n += sum(k.id);
    total.set(id, n);
    return n;
  };
  sum(rootId);
  return { root, children, total, byId: new Map(all.map((c) => [c.id, c])) };
}

export default function CategoryDrilldown({ rootName, rootLabel, onPractice }: Props) {
  // רק הענף של השורש (למשל 751 קטגוריות ו־652 שאלות) — לא כל עשרות אלפי השאלות במאגר.
  // התוצאה נשמרת בזיכרון, ולכן חזרה מתרגול מציגה את העץ מיד (והבדיקה מחדש קורית ברקע).
  const live = useLiveQuery(() => loadTree(rootName), [rootName]);
  if (live !== undefined) treeCache.set(rootName, live);
  const tree = live ?? treeCache.get(rootName);
  const [path, setPathState] = useState<string[]>(() => lastPath.get(rootName) ?? []);
  const setPath = (p: string[]) => {
    lastPath.set(rootName, p);
    setPathState(p);
  };

  if (tree === undefined) return <p className="text-center text-sm text-muted-foreground py-8">טוען…</p>;
  if (!tree || !tree.root || !tree.total.get(tree.root.id)) {
    return <div className="card-panel border-dashed text-center text-muted-foreground py-10">עדיין אין שאלות ב{rootLabel}.</div>;
  }

  // המסלול הנוכחי (מזהים) — מתעלמים ממזהה שכבר לא קיים
  const valid = path.filter((id) => tree.byId.has(id));
  const currentId = valid.length ? valid[valid.length - 1] : tree.root.id;
  const kids = (tree.children.get(currentId) ?? []).filter((c) => (tree.total.get(c.id) ?? 0) > 0);
  const trailNames = [rootLabel, ...valid.map((id) => shortName(tree.byId.get(id)!.name))];

  /** כל השאלות מתחת לקטגוריה (כולל תתי־קטגוריות). */
  const practiceAt = async (id: string, names: string[]) => {
    const ids: string[] = [];
    const walk = (cid: string) => {
      ids.push(cid);
      for (const k of tree.children.get(cid) ?? []) walk(k.id);
    };
    walk(id);
    // שאילתה לכל קטגוריה, במקביל (מהיר בהרבה משאילתה אחת על מאות מזהים)
    const cards = (await Promise.all(ids.map((cid) => db.cards.where("categoryId").equals(cid).toArray()))).flat();
    onPractice(cards, names);
  };

  return (
    <div className="gold-frame bg-card p-4 space-y-4 animate-fade-in" data-testid="category-drilldown">
      {/* פירורי לחם */}
      <nav aria-label="מיקום" className="flex flex-wrap items-center gap-1 text-sm">
        {trailNames.map((name, i) => {
          const last = i === trailNames.length - 1;
          return (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronLeft className="h-3.5 w-3.5 text-gold" />}
              {last ? (
                <span className="font-bold">{name}</span>
              ) : (
                <button className="text-muted-foreground hover:text-gold hover:underline" onClick={() => setPath(valid.slice(0, i))}>
                  {name}
                </button>
              )}
            </span>
          );
        })}
      </nav>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-lg">{trailNames[trailNames.length - 1]}</h3>
        <button className="btn-gold h-9 rounded-full text-sm" onClick={() => void practiceAt(currentId, trailNames)}>
          <Play className="h-4 w-4" /> תרגול כל השאלות כאן ({tree.total.get(currentId) ?? 0})
        </button>
      </div>

      {kids.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kids.map((c) => (
            <button
              key={c.id}
              onClick={() => setPath([...valid, c.id])}
              className="card-panel py-4 px-2 text-center hover:border-gold transition-colors"
              data-testid="drilldown-tile"
            >
              <BookOpen className="h-5 w-5 mx-auto text-gold mb-1.5" />
              <div className="font-bold leading-snug">{shortName(c.name)}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{tree.total.get(c.id)} שאלות</div>
            </button>
          ))}
        </div>
      ) : (
        <QuestionList categoryId={currentId} />
      )}
    </div>
  );
}

/** רשימת השאלות של קטגוריה אחרונה בעץ (סעיף) — עם בחירת תצוגה: רשימה נפתחת או כרטיסים מתהפכים. */
function QuestionList({ categoryId }: { categoryId: string }) {
  const cards = useLiveQuery(() => db.cards.where("categoryId").equals(categoryId).toArray(), [categoryId]);
  if (!cards) return null;
  return <OpenQuestionList cards={cards} />;
}