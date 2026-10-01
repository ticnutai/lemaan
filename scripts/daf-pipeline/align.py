# -*- coding: utf-8 -*-
"""
שלב 3 (גרסה 4): יישור כפוי מטושטש — מילות OCR (עם מיקומים) מול הטקסט
הנקי שלנו, לכל זרם. מתמודד עם:
  • OCR מעוות של כתב רש"י (ש↔ס, ק↔ל…) — דמיון תווים, לא שוויון
  • שורות OCR שחוצות עמודות — פיצול ברווחים גדולים
  • עמודת השוליים (עין משפט / מסורת הש"ס) — לא בזרמים שלנו, נדחית גיאומטרית

תוצאה: שורות דפוס לכל זרם (תיבה מדויקת + טקסט נכון) + דוח בקרה.
שימוש: align.py pages.json.gz Masechet.json.gz out.json tractate first_scan_page daf_from daf_to
"""
import re, sys, json, gzip, statistics
from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein
from locate import load_amud, NIKUD, TAGS

HEB = re.compile(r"[א-ת]")
# קיפול בלבולי OCR נפוצים בכתב רש"י: האותיות הדומות מקבלות אותו סימן
FOLD = str.maketrans({"ס": "ש", "ם": "ס", "ך": "כ", "ן": "נ", "ף": "פ", "ץ": "צ", "ת": "ח"})

def norm_token(t):
    return re.sub(r"[^א-ת]", "", NIKUD.sub("", t))

def fold(t):
    return t.translate(FOLD)

def ref_tokens(segments):
    out = []
    for seg in segments:
        clean = NIKUD.sub("", TAGS.sub(" ", seg))
        for raw in clean.split():
            key = norm_token(raw)
            if key:
                out.append((key, raw))
    return out

# ---------- פיצול שורות OCR לפי רווחים גדולים ----------
def split_lines(page):
    """מחזיר רשימת 'פיסות': מילים עבריות רציפות אופקית (רווח <= 3×גובה גופן)."""
    pieces = []
    for ln in page["lines"]:
        ws = sorted((w for w in ln if HEB.search(w["t"])), key=lambda w: -w["x2"])  # ימין→שמאל
        if not ws:
            continue
        fs = statistics.median(w["y2"] - w["y1"] for w in ws)
        cur = [ws[0]]
        for w in ws[1:]:
            gap = cur[-1]["x1"] - w["x2"]
            # מרווח בין עמודות (~1.7×גובה גופן) לעומת רווח בין מילים (~0.3–0.6)
            if gap > 1.2 * fs:
                pieces.append(cur); cur = [w]
            else:
                cur.append(w)
        pieces.append(cur)
    return pieces

def box(words):
    x1 = min(w["x1"] for w in words); x2 = max(w["x2"] for w in words)
    y1 = min(w["y1"] for w in words); y2 = max(w["y2"] for w in words)
    fs = statistics.median(w["y2"] - w["y1"] for w in words)
    return x1, y1, x2, y2, fs

# ---------- יישור מטושטש מונוטוני (DP) ----------
def word_sim(a, b):
    if len(a) < 2 or len(b) < 2:
        return 0.0
    return fuzz.ratio(fold(a), fold(b)) / 100.0

def align_words(ocr_words, ref_keys, min_sim=0.72, band=None):
    """
    DP מונוטוני: מחזיר רשימת זוגות (i_ocr, j_ref) מותאמים.
    ציון: דמיון מילים (>= min_sim נחשב התאמה), פער = 0.
    """
    n, m = len(ocr_words), len(ref_keys)
    if n == 0 or m == 0:
        return []
    # חלון: מגבילים את ה-DP לרצועה סביב האלכסון (יחס n:m) כדי לחסוך זמן
    width = band or max(60, int(0.25 * max(n, m)))
    NEG = -1e9
    import array
    score = [array.array("d", [0.0] * (m + 1)) for _ in range(n + 1)]
    back = [array.array("b", [0] * (m + 1)) for _ in range(n + 1)]  # 0 diag, 1 up(i-1), 2 left(j-1)
    for i in range(1, n + 1):
        jc = int(i * m / n)
        jlo, jhi = max(1, jc - width), min(m, jc + width)
        row, prow, brow = score[i], score[i - 1], back[i]
        oi = ocr_words[i - 1]
        for j in range(jlo, jhi + 1):
            s = word_sim(oi, ref_keys[j - 1])
            d = prow[j - 1] + (s if s >= min_sim else -0.3)
            u = prow[j]
            l = row[j - 1]
            if d >= u and d >= l:
                row[j] = d; brow[j] = 0
            elif u >= l:
                row[j] = u; brow[j] = 1
            else:
                row[j] = l; brow[j] = 2
    # traceback
    i, j = n, m
    pairs = []
    while i > 0 and j > 0:
        b = back[i][j]
        if b == 0:
            if word_sim(ocr_words[i - 1], ref_keys[j - 1]) >= min_sim:
                pairs.append((i - 1, j - 1))
            i -= 1; j -= 1
        elif b == 1:
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs

# ---------- זרמים ----------
def x_overlap(a1, a2, b1, b2):
    return max(0, min(a2, b2) - max(a1, b1)) / max(1, min(a2 - a1, b2 - b1))

def cluster_columns(pieces, idxs):
    """קיבוץ פיסות לעמודות לפי חפיפה אופקית וגובה גופן. מחזיר [x1,x2,fs,y1,y2,count]."""
    cols = []
    for pi in sorted(idxs, key=lambda k: box(pieces[k])[1]):
        x1, y1, x2, y2, fs = box(pieces[pi])
        for c in cols:
            if x_overlap(x1, x2, c[0], c[1]) >= 0.6 and abs(c[2] - fs) <= 0.3 * c[2]:
                c[0] = min(c[0], x1); c[1] = max(c[1], x2); c[3] = min(c[3], y1); c[4] = max(c[4], y2)
                c[5] += 1; c[6].append(fs); c[2] = statistics.median(c[6])
                break
        else:
            cols.append([x1, x2, fs, y1, y2, 1, [fs]])
    return cols

def assign_streams(page, refs):
    """
    1) יישור גס של כל הפיסות (בסדר קריאה) מול כל זרם → פיסות עם התאמה חזקה
    2) עמודות לכל זרם מהפיסות החזקות (>=2 התאמות ו>=50% מילים)
    3) כל פיסה משויכת לעמודה הקרובה (חפיפה+גופן); תחרות → לזרם עם יותר התאמות
    """
    pieces = split_lines(page)
    order = sorted(range(len(pieces)), key=lambda k: (box(pieces[k])[1], -box(pieces[k])[2]))
    flat, owner_piece = [], []
    for k in order:
        for w in pieces[k]:
            flat.append(norm_token(w["t"])); owner_piece.append(k)
    strong = {s: {} for s in refs}
    for s, ref in refs.items():
        pairs = align_words(flat, [r[0] for r in ref])
        for i, j in pairs:
            strong[s].setdefault(owner_piece[i], []).append(j)
    cols = {}
    for s in refs:
        # זרע = פיסה עם >=3 התאמות ולפחות 60% ממילותיה — ציטוט בודד לא מספיק
        good = [k for k, js in strong[s].items() if len(js) >= 3 and len(js) >= 0.6 * len(pieces[k])]
        clusters = cluster_columns(pieces, good)
        # משקל עמודה = סך ההתאמות בה; עמודות שוליות (<25% מהדומיננטית) נדחות
        for c in clusters:
            c.append(0)
        for k in good:
            x1, y1, x2, y2, fs = box(pieces[k])
            for c in clusters:
                if x_overlap(x1, x2, c[0], c[1]) >= 0.6 and abs(c[2] - fs) <= 0.3 * c[2]:
                    c[7] += len(strong[s][k]); break
        top = max((c[7] for c in clusters), default=0)
        cols[s] = [c for c in clusters if c[5] >= 2 and c[7] >= 0.25 * top]
    members = {s: [] for s in refs}
    for k, words in enumerate(pieces):
        x1, y1, x2, y2, fs = box(words)
        best, best_score = None, 0
        for s, cs in cols.items():
            for cx1, cx2, cfs, cy1, cy2, cnt, _, _w in cs:
                if x_overlap(x1, x2, cx1, cx2) >= 0.7 and abs(fs - cfs) <= 0.3 * cfs and cy1 - 3 * cfs <= y1 and y2 <= cy2 + 3 * cfs:
                    # פיסה זעירה (הערת שוליים) נדחית אלא אם יש לה התאמות
                    if (x2 - x1) < 0.2 * (cx2 - cx1) and len(strong[s].get(k, [])) < 2:
                        continue
                    sc = 1 + len(strong[s].get(k, []))
                    if sc > best_score:
                        best, best_score = s, sc
        if best:
            members[best].append(k)
    return pieces, members, strong

def build_lines(pieces, members, ref, stream):
    """יישור מדויק של הזרם: רק הפיסות שלו, בסדר קריאה, DP מול הייחוס → תחום לכל פיסה."""
    ks = sorted(members, key=lambda k: (box(pieces[k])[1], -box(pieces[k])[2]))
    flat, owner, pos_in = [], [], []
    for k in ks:
        for p, w in enumerate(pieces[k]):
            flat.append(norm_token(w["t"])); owner.append(k); pos_in.append(p)
    keys = [r[0] for r in ref]
    pairs = align_words(flat, keys, min_sim=0.65)
    anchors = {}
    for i, j in pairs:
        anchors.setdefault(owner[i], []).append((pos_in[i], j))
    n_ref = len(keys)
    est = {}
    for k in ks:
        pts = anchors.get(k)
        if pts:
            n = len(pieces[k])
            est[k] = (max(0, int(statistics.median(r - p for p, r in pts))),
                      min(n_ref - 1, int(statistics.median(r + (n - 1 - p) for p, r in pts))))
    bounds, prev_end, i = [], -1, 0
    while i < len(ks):
        k = ks[i]
        if k in est:
            s, e = est[k]; s = max(s, prev_end + 1); e = max(s, e)
            bounds.append([k, s, e]); prev_end = e; i += 1; continue
        j = i
        while j < len(ks) and ks[j] not in est:
            j += 1
        next_start = est[ks[j]][0] if j < len(ks) else n_ref
        avail = max(0, next_start - (prev_end + 1))
        counts = [len(pieces[ks[t]]) for t in range(i, j)]
        total = max(1, sum(counts)); cur = prev_end + 1
        for t, cnt in zip(range(i, j), counts):
            take = round(avail * cnt / total)
            s, e = cur, min(n_ref - 1, cur + take - 1)
            bounds.append([ks[t], s, e]); cur = e + 1
        prev_end = cur - 1; i = j
    if bounds:
        bounds[-1][2] = n_ref - 1
    out = []
    for k, s, e in bounds:
        x1, y1, x2, y2, fs = box(pieces[k])
        text = " ".join(r[1] for r in ref[s:e + 1]) if e >= s else ""
        out.append({"s": stream, "x1": x1, "y1": y1, "x2": x2, "y2": y2, "fs": fs, "text": text,
                    "n_ref": max(0, e - s + 1), "n_ocr": len(pieces[k]), "n_anchor": len(anchors.get(k, [])),
                    "ocr": " ".join(w["t"] for w in pieces[k])})
    return out

def qa(lines, stream, n_ref):
    weak = sum(1 for l in lines if l["n_anchor"] < 2)
    edge = 0
    for l in lines:
        o = [norm_token(w) for w in l["ocr"].split()]
        r = [norm_token(w) for w in l["text"].split()]
        if o and r and (word_sim(o[0], r[0]) >= 0.7 or word_sim(o[-1], r[-1]) >= 0.7):
            edge += 1
    ratio_bad = sum(1 for l in lines if abs(l["n_ref"] - l["n_ocr"]) > max(2, 0.4 * l["n_ocr"]))
    return {"stream": stream, "lines": len(lines), "weak": weak, "edge": round(edge / max(1, len(lines)), 2),
            "ratio_bad": ratio_bad, "covered": round(sum(l["n_ref"] for l in lines) / max(1, n_ref), 2)}

def process_amud(page, amud):
    refs = {s: ref_tokens(amud[s]) for s in ("gemara", "rashi", "tosafot") if amud[s]}
    pieces, members, _ = assign_streams(page, refs)
    result, report = [], []
    for s, ref in refs.items():
        lines = build_lines(pieces, members[s], ref, s)
        result.extend(lines)
        report.append(qa(lines, s, len(ref)))
    return result, report

if __name__ == "__main__":
    pages_file, masechet_file, out_file, tractate = sys.argv[1:5]
    first_page, daf_from, daf_to = int(sys.argv[5]), int(sys.argv[6]), int(sys.argv[7])
    pages = json.load(gzip.open(pages_file, "rt", encoding="utf-8"))
    layout = {}
    for daf in range(daf_from, daf_to + 1):
        for ai, amud in enumerate(("a", "b")):
            key = f"{daf}{amud}"
            pidx = first_page + 2 * (daf - 2) + ai
            page = pages[pidx]
            try:
                ref = load_amud(masechet_file, key)
            except KeyError:
                continue
            lines, report = process_amud(page, ref)
            layout[key] = {"page": {"w": page["w"], "h": page["h"]}, "scan": pidx, "lines": lines}
            print(f"== {key} (scan {pidx})")
            for r in report:
                print(f"   {r['stream']:8} lines={r['lines']:3} weak={r['weak']:2} edge={r['edge']:.0%} bad-ratio={r['ratio_bad']:2} covered={r['covered']:.0%}")
    json.dump(layout, open(out_file, "w", encoding="utf-8"), ensure_ascii=False)
    print("wrote", out_file)
