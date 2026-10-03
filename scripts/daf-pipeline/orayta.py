# -*- coding: utf-8 -*-
"""
רש"י ותוספות בנוסח דפוס וילנא — מקובצי "אורייתא" שבספריית אוצריא (github.com/otzaria/otzaria-library).
מחליף את ספריא למפרשים: בספריא נמצאו פסקאות כפולות, שם המסכת נוסף להפניות ("(מגילה דף כו.)")
ועוד. באורייתא: בלי ניקוד, ראשי תיבות כבדפוס, הפניות כבדפוס, והדיבור המתחיל מסומן <b>.

מבנה הקובץ: "<h3>דף ב - א</h3>" לכל עמוד, פסקאות מסתיימות בנקודתיים, ד"ה ב-<b>...</b>.
מחזיר לכל עמוד רשימת פסקאות בצורה "דיבור המתחיל - פירוש" (כמו שספריא מגישה), כדי שהמשך הצינור
(side_tokens) לא ישתנה.
"""
import os, re, urllib.request, urllib.parse

CACHE = os.path.join(os.path.expanduser("~"), "lemaan-data", "orayta")
BASE = "https://raw.githubusercontent.com/otzaria/otzaria-library/main/OraytaToOtzaria/ספרים/לא ממויין/ראשונים שס"
PATHS = {"rashi": "רשי/תלמוד בבלי - {he} - רשי.txt", "tosafot": "תוספות/תלמוד בבלי - {he} - תוספות.txt"}
_cache = {}


def gematria(s):
    v = {"א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9, "י": 10, "כ": 20, "ך": 20, "ל": 30,
         "מ": 40, "ם": 40, "נ": 50, "ן": 50, "ס": 60, "ע": 70, "פ": 80, "ף": 80, "צ": 90, "ץ": 90, "ק": 100, "ר": 200,
         "ש": 300, "ת": 400}
    return sum(v.get(c, 0) for c in s)


def fetch(he, comm):
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, f"{he} - {comm}.txt")
    if not os.path.exists(local):
        url = BASE + "/" + PATHS[comm].format(he=he)
        url = urllib.parse.quote(url, safe=":/")
        try:
            data = urllib.request.urlopen(url, timeout=60).read()
        except Exception:
            return None
        open(local, "wb").write(data)
    return open(local, encoding="utf-8").read()


def to_segments(body):
    """טקסט של עמוד → פסקאות "ד"ה - פירוש". פסקה חדשה מתחילה ב-<b> או אחרי נקודתיים."""
    body = body.replace("''", '"')  # גרשיים: אורייתא כותבת שני גרשים
    body = re.sub(r"\s+", " ", body).strip()
    # חיתוך: לפני כל <b>, ואחרי ": " (סוף פסקה) — רק מחוץ לסוגריים ("(דף ב: ושם)" אינו סוף פסקה)
    parts, cur, depth, i = [], [], 0, 0
    while i < len(body):
        if body.startswith("<b>", i) and depth == 0 and "".join(cur).strip():
            parts.append("".join(cur)); cur = []
        ch = body[i]
        depth += ch in "([" ; depth -= ch in ")]"; depth = max(depth, 0)
        cur.append(ch)
        if ch == ":" and depth == 0 and body[i + 1: i + 2] == " ":
            parts.append("".join(cur)); cur = []
        i += 1
    parts.append("".join(cur))
    segs = []
    for p in parts:
        p = p.strip()
        if not p or p == "אין פירוש בדף זה":
            continue
        m = re.match(r"^<b>(.*?)</b>(\s*[.:])?\s*(.*)$", p, re.S)
        if m:
            dh, punct, rest = m.group(1).strip(), m.group(2), m.group(3).strip()
            # בלי נקודה אחרי ה-</b>: הסימון קצר מהד"ה שבדפוס — ממשיכים עד הנקודה הראשונה (עד 8 מילים)
            if not punct and rest and not dh.endswith((".", ":")):
                head, dot, tail = rest.partition(". ")
                if dot and tail and len(head.split()) <= 8 and "(" not in head:
                    dh, rest = f"{dh} {head}", tail
            segs.append(f"{dh} - {rest}" if rest else dh)
        else:
            segs.append(p)
    return segs


def load(he, comm):
    """→ {"2a": [פסקאות], ...} או None אם אין קובץ."""
    k = (he, comm)
    if k in _cache:
        return _cache[k]
    txt = fetch(he, comm)
    if txt is None:
        _cache[k] = None
        return None
    out = {}
    for m in re.finditer(r"<h3>\s*דף\s+([א-ת\"']+)\s*-\s*([אב])\s*</h3>(.*?)(?=<h3>|\Z)", txt, re.S):
        daf = gematria(m.group(1))
        body = re.sub(r"<h[12][^>]*>.*?</h[12]>", " ", m.group(3), flags=re.S)
        out[f"{daf}{'a' if m.group(2) == 'א' else 'b'}"] = to_segments(body)
    _cache[k] = out
    return out
