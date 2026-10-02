# -*- coding: utf-8 -*-
"""
צורת הדף מ-PDF של HebrewBooks (ש"ס נהרדעא — צילום דפוס וילנא, עם שכבת OCR
איכותית: מיקום וגודל לכל מילה, דיבור המתחיל מודגש).

מה לוקחים מה-OCR: רק גיאומטריה — המסגרת, הגושים, ושבירות השורות.
מה לוקחים מהטקסט: כל המילים עצמן — גמרא מויקיטקסט (כתיב הדפוס), רש"י
ותוספות מספריא (דפוס וילנא). כל מילה נכונה מעוגנת לשורת הדפוס שלה.

גודל הגופן מפריד את הזרמים: גמרא ~10, מפרשים ~8, שוליים 5–6, כותרת 18.
פלט: PrintLayout (כמו berakhot.json) — יחידות עמוד וילנא: מסגרת 121→556, ראש 33.

שימוש: hb_pdf.py <pdf> <Tractate> <first_pdf_page_of_2a> [amud,amud,...]
"""
import fitz, json, gzip, re, sys, os, statistics as st
from rapidfuzz import fuzz

sys.path.insert(0, os.path.dirname(__file__))
from align import align_words, norm_token, fold

HEB = re.compile(r"[א-ת]")
TAGS = re.compile(r"<[^>]+>")
NIKUD = re.compile(r"[֑-ׇ]")
V_L, V_W, V_TOP, PAGE_W = 121.0, 435.0, 33.0, 643.58
G_FS, G_LH, S_FS, S_LH = 12.6, 12.033, 7.7, 11.16
ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "public")


# ---------- מילים עם גודל/הדגשה ----------
def page_words(p):
    D = p.get_text("dict")
    out = []
    for x0, y0, x1, y1, t, b, l, _ in p.get_text("words"):
        try:
            spans = D["blocks"][b]["lines"][l]["spans"]
        except (IndexError, KeyError):
            continue
        cx = (x0 + x1) / 2
        sp = min(spans, key=lambda s: 0 if s["bbox"][0] <= cx <= s["bbox"][2] else min(abs(cx - s["bbox"][0]), abs(cx - s["bbox"][2])))
        out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "t": t, "size": sp["size"], "bold": "Bold" in sp["font"]})
    return out


def rows_of(words, tol=None, base=False):
    """קיבוץ לשורות לפי מרכז אנכי (או לפי קו הבסיס — כשיש מילים בגדלים שונים); מילים מימין לשמאל."""
    key = (lambda w: w["y1"]) if base else (lambda w: (w["y0"] + w["y1"]) / 2)
    ws = sorted(words, key=key)
    rows = []
    for w in ws:
        cy = key(w)
        h = w["y1"] - w["y0"]
        if rows and abs(rows[-1]["cy"] - cy) < (tol or 0.45 * h):
            r = rows[-1]; r["w"].append(w); r["cy"] = (r["cy"] * (len(r["w"]) - 1) + cy) / len(r["w"])
        else:
            rows.append({"cy": cy, "w": [w]})
    for r in rows:
        r["w"].sort(key=lambda w: -w["x1"])
        r["x0"] = min(w["x0"] for w in r["w"]); r["x1"] = max(w["x1"] for w in r["w"])
    return rows


def pieces_of(row, gap, cuts=None):
    """פיצול שורה לפיסות: רווח אופקי גדול — ואם נתונים קווי חלוקה, רק רווח שחוצה אחד מהם
    (בעמודה צרה מיושרת יש רווחים גדולים בין מילים, אבל הם אינם חוצים מרווח עמודות)."""
    out, cur = [], [row["w"][0]]
    for w in row["w"][1:]:
        a, b = w["x1"], cur[-1]["x0"]
        if b - a > gap and (cuts is None or any(a - 1 <= c <= b + 1 for c in cuts)):
            out.append(cur); cur = [w]
        else:
            cur.append(w)
    out.append(cur)
    return [{"cy": row["cy"], "w": p, "x0": min(w["x0"] for w in p), "x1": max(w["x1"] for w in p)} for p in out]


# ---------- טקסט ייחוס ----------
def load(path):
    b = open(path, "rb").read()
    return json.loads(gzip.decompress(b) if b[:2] == b"\x1f\x8b" else b)["amudim"]


DH = ""

# מראי-מקום לפסוקים בנוסח ספריא "(במדבר י״ז:ג׳)" — בדפוס וילנא: ספר ופרק בלבד "(במדבר יז)".
# מראי-מקום של הדפוס עצמו ("(שבת דף קד.)") אינם בתבנית הזו ונשארים כמו שהם.
VERSE_REF = re.compile(r"\(((?:[א-ת]+ ){1,3})([א-ת\"'״׳]+):[א-ת\"'״׳]+(?:[-–][א-ת\"'״׳:]+)?\)")
vilna_ref = lambda m: "(" + m.group(1) + re.sub(r"[\"'״׳]", "", m.group(2)) + ")"

def side_tokens(segs):
    """רש"י/תוספות: "ד"ה - פירוש:" → "ד"ה. פירוש:" (כמו בדפוס); מילות הד"ה מסומנות DH."""
    out = []
    for seg in segs:
        s = VERSE_REF.sub(vilna_ref, NIKUD.sub("", TAGS.sub(" ", seg)))
        m = re.match(r"^(.*?)\s+[–—-]\s+(.*)$", s, re.S)
        if m:
            dh = [t for t in m.group(1).split() if HEB.search(t)]
            if dh:
                dh[-1] = re.sub(r"[.:]?$", ".", dh[-1])
            out += [DH + t for t in dh] + [t for t in m.group(2).split() if HEB.search(t)]
        else:
            out += [t for t in s.split() if HEB.search(t)]
    return out


def line_html(tokens, drop=0):
    """שורת מפרש: רצפי ד"ה מודגשים (<b>), כמו בדפוס; drop = מילים פותחות מוגדלות."""
    out, inb = [], False
    for k, t in enumerate(tokens):
        if k < drop:
            t = (DH if t.startswith(DH) else "") + "<big>" + t.lstrip(DH) + "</big>"
        b = t.startswith(DH)
        if b and not inb:
            out.append("<b>"); inb = True
        elif not b and inb:
            out[-1] = out[-1] + "</b>"; inb = False
        out.append(t[1:] if b else t)
    if inb:
        out[-1] = out[-1] + "</b>"
    return " ".join(out).replace("<b> ", "<b>")


def gem_tokens(segs):
    return [t for t in NIKUD.sub("", TAGS.sub(" ", " ".join(segs))).split() if HEB.search(t)]


def window(tokens_of, keys, key, before=60, after=90):
    """הטקסט של העמוד + זנב הקודם + ראש הבא (גלישה בין עמודים)."""
    i = keys.index(key)
    prev = tokens_of(keys[i - 1])[-before:] if i > 0 else []
    nxt = tokens_of(keys[i + 1])[:after] if i + 1 < len(keys) else []
    cur = tokens_of(key)
    return prev + cur + nxt, len(prev), len(prev) + len(cur)


def heb_num(n):
    """מספר עברי לכותרת הדף (ב, יג, טו, טז, קכא)."""
    out = ""
    for v, c in ((400, "ת"), (300, "ש"), (200, "ר"), (100, "ק")):
        while n >= v:
            out += c; n -= v
    if n == 15: return out + "טו"
    if n == 16: return out + "טז"
    tens = " יכלמנסעפצ"; ones = " אבגדהוזחט"
    return out + (tens[n // 10] if n >= 10 else "") + (ones[n % 10] if n % 10 else "")


# ---------- עיגון: כל מילת ייחוס → שורת דפוס ----------
def anchor(lines, ref, bounds=None):
    """lines: [[ocr words]] בסדר קריאה. מחזיר טקסט נכון לכל שורה + כיסוי.
    bounds: (התחלה, סוף) של טקסט העמוד עצמו בתוך ref — ההשלמה לפני ההתאמה הראשונה
    ואחרי האחרונה לא חורגת ממנו (כדי שמילות הקשר מהעמוד הסמוך לא ייכנסו לשורה)."""
    lo, hi = bounds or (0, len(ref))
    flat = [(li, w["t"]) for li, ln in enumerate(lines) for w in ln]
    okeys = [fold(norm_token(t)) for _, t in flat]
    rkeys = [fold(norm_token(t)) for t in ref]
    # רצועת חיפוש רחבה: לייחוס נוספו ~150 מילות הקשר מהעמודים הסמוכים, האלכסון אינו יחסי
    pairs = align_words(okeys, rkeys, min_sim=0.7, band=max(200, len(rkeys) - len(okeys) + 60))
    # התאמות "קופצות" (מילה קצרה שהותאמה במקרה הרחק קדימה) — ההיסט j-i חורג מהשכנים
    if len(pairs) > 8:
        off = [j - i for i, j in pairs]
        keep = []
        for k, pr in enumerate(pairs):
            nb = off[max(0, k - 6): k] + off[k + 1: k + 7]
            if abs(off[k] - st.median(nb)) <= 8:
                keep.append(pr)
        pairs = keep
    if not pairs:
        return [[] for _ in lines], 0.0, None
    line_of = {}
    for i, j in pairs:
        line_of[j] = flat[i][0]
    # השלמת מילות ייחוס שלא הותאמו: פיזור ליניארי על מיקומי ה-OCR שביניהן
    full = list(pairs)
    i0, j0 = pairs[0]
    # לפני ההתאמה הראשונה: רק כמה שיש מילות OCR לפניה
    for k in range(1, min(i0, j0 - lo) + 1):
        line_of[j0 - k] = flat[i0 - k][0]
    # בין שתי התאמות: פיזור לפי רוחב פיזי (לא לפי מספר מילות OCR — OCR גרוע מפרק/מאחד מילים)
    # מיקום כל מילת OCR = רוחב השורות שלפניה + המרחק מקצה השורה הימני; מילות הייחוס לפי אורך באותיות
    flat_w = [w for ln in lines for w in ln]
    pos, off = [], 0.0
    for ln in lines:
        right = max(w["x1"] for w in ln) if ln else 0
        pos += [off + right - w["x1"] for w in ln]
        off += (right - min(w["x0"] for w in ln) if ln else 0) + 4
    starts, acc = [], 0.0
    for ln in lines:
        starts.append(acc)
        acc += (max(w["x1"] for w in ln) - min(w["x0"] for w in ln) + 4) if ln else 0
    cum = [0]
    for t in ref:
        cum.append(cum[-1] + len(t) + 1)
    import bisect
    for (ia, ja), (ib, jb) in zip(pairs, pairs[1:]):
        if jb - ja <= 1:
            continue
        g = jb - ja - 1
        if ib - ia - 1 == g:
            # OCR סביר בקטע (מספר מילים דומה) — פיזור לפי מיקומי מילות ה-OCR
            for k in range(g):
                oi = ia + round((k + 1) * (ib - ia) / (g + 1))
                line_of[ja + 1 + k] = flat[min(oi, len(flat) - 1)][0]
            continue
        wa = flat_w[ia]
        pa, pb = pos[ia] + (wa["x1"] - wa["x0"]) + 2, pos[ib]  # מסוף מילת העוגן ועד תחילת הבאה
        for j in range(ja + 1, jb):
            # מרכז המילה, יחסית לאורך הקטע באותיות
            fr = ((cum[j] + cum[j + 1]) / 2 - cum[ja + 1]) / max(1, cum[jb] - cum[ja + 1])
            x = pa + (pb - pa) * fr
            li = max(0, bisect.bisect_right(starts, x) - 1)
            line_of[j] = min(max(li, flat[ia][0]), flat[ib][0])
    i1, j1 = pairs[-1]
    for k in range(1, min(len(flat) - 1 - i1, len(ref) - 1 - j1) + 1):
        line_of[j1 + k] = flat[i1 + k][0]
    out = [[] for _ in lines]
    for j in sorted(line_of):
        out[line_of[j]].append(ref[j])
    cover = len(pairs) / max(1, len(flat))
    return out, cover, (min(line_of), max(line_of))


# ---------- עמוד ----------
def build_page(p, key, refs):
    W = [w for w in page_words(p) if HEB.search(w["t"])]
    # גדלי הגופן משתנים מעמוד לעמוד ובין מקורות ה-OCR (HebrewBooks: גמרא 9.5/11, מפרשים 6.5–7.5,
    # שוליים 5–6.5; ABBYY של אוצריא: גמרא 8.5–10, מפרשים 6.5–8, שוליים 4.5–5.5), ולפעמים רש"י ותוספות
    # באותו עמוד בשני גדלים. לכן: הגמרא = הגודל הגדול הנפוץ; המפרשים = כל מה שקטן ממנה (ולא זעיר) —
    # ובתוך המסגרת, שנמצאת גיאומטרית (ראו למטה) ולא לפי גודל.
    hist = {}
    for w in W:
        hist[round(w["size"] * 2) / 2] = hist.get(round(w["size"] * 2) / 2, 0) + 1
    G = max((z for z, n in hist.items() if n >= 100 and 8.5 <= z < 14), default=9.5)
    small_ = lambda w: 0.55 * G <= w["size"] < G - 0.6
    gem_ = lambda w: G - 0.6 <= w["size"] < G + 0.8
    bigcap = lambda w: G + 0.8 <= w["size"] < 14  # מילת פתיחה מוגדלת של רש"י/תוספות
    side = [w for w in W if small_(w) or bigcap(w)]
    gem = [w for w in W if gem_(w)]
    head = [w for w in W if w["size"] >= 14]

    # מסגרת: עמודות המפרשים מיושרות לשני הצדדים, ולכן שורות רבות מתחילות/נגמרות בדיוק בקצה המסגרת.
    # אוספים את קצוות השורות (פיסות המופרדות ברווח עמודה) ומחפשים זוג קצוות שאליו מתיישרות הכי הרבה
    # שורות — ברוחב מסגרת וילנא (~65% מרוחב העמוד, יציב מאוד). כך שוליים בגודל דומה לא מבלבלים.
    PW = p.rect.width
    lefts_h, rights_h = {}, {}
    for r in rows_of(side + gem, tol=3, base=True):
        segs, cur = [], [r["w"][0]]
        for a_, b_ in zip(r["w"], r["w"][1:]):
            if a_["x0"] - b_["x1"] >= 9:
                segs.append(cur); cur = []
            cur.append(b_)
        segs.append(cur)
        for sg in segs:
            if len(sg) >= 3:
                x0, x1 = round(min(w["x0"] for w in sg)), round(max(w["x1"] for w in sg))
                lefts_h[x0] = lefts_h.get(x0, 0) + 1; rights_h[x1] = rights_h.get(x1, 0) + 1
    near_ = lambda h, x: sum(h.get(x + d, 0) for d in (-2, -1, 0, 1, 2))
    # ציון = כמה שורות מתיישרות לשני הקצוות × קרבה לרוחב הטיפוסי (סריקות שונות בקנה מידה ב~±7%)
    import math
    best_ = None
    for l in lefts_h:
        for r in rights_h:
            if 0.55 * PW <= r - l <= 0.75 * PW:
                n_ = min(near_(lefts_h, l), near_(rights_h, r))
                sc_ = n_ * math.exp(-(((r - l) / PW - 0.655) / 0.03) ** 2)
                if n_ >= 8 and (best_ is None or sc_ > best_[0]):
                    best_ = (sc_, l, r)
    if best_:
        _, fL, fR = best_
        # הקצה המדויק: הערך הנפוץ בסביבה
        fL = max(range(fL - 2, fL + 3), key=lambda x: lefts_h.get(x, 0))
        fR = max(range(fR - 2, fR + 3), key=lambda x: rights_h.get(x, 0))
    else:  # גיבוי: אחוזונים של קצוות עמודות המפרשים
        xs0 = sorted(w["x0"] for w in side if w["x0"] > 0.14 * PW)
        xs1 = sorted(w["x1"] for w in side if w["x1"] < 0.9 * PW)
        fL, fR = xs0[int(0.02 * len(xs0))], xs1[int(0.98 * len(xs1)) - 1]
    if os.environ.get("FRAME_DEBUG"):
        print(key, "frame", fL, fR, "score", best_ and best_[0])
    inside = lambda w: w["x0"] >= fL - 3 and w["x1"] <= fR + 3
    # גודל המפרשים העיקרי; טקסט קטן ממנו שנמצא מתחת לשורת המפרש האחרונה = הערות תחתית
    # (ציטוטי "תורה אור", הגהות) — לא רש"י ולא תוספות
    # נבחר לפי מספר השורות (קווי בסיס שונים) ולא לפי מספר המילים: הערות התחתית צפופות בכמה שורות בלבד
    sh = {}
    for w in side:
        if small_(w) and inside(w):
            sh.setdefault(round(w["size"] * 2) / 2, set()).add(round(w["y1"] / 4))
    S = max(sh, key=lambda z: len(sh[z]), default=7.5)
    # לפי שורות: שורה שרוב מילותיה קטנות מהמפרשים, ואחרי השורה האחרונה של מפרשים/גמרא — הערה
    frows = rows_of([w for w in side + gem if inside(w)], tol=3, base=True)
    is_main = [st.median(w["size"] for w in r["w"]) >= S - 0.4 for r in frows]
    last_main = max((i for i, m in enumerate(is_main) if m), default=len(frows))
    notes = {id(w) for r in frows[last_main + 1:] for w in r["w"]}
    side = [w for w in side if id(w) not in notes]
    gem = [w for w in gem if id(w) not in notes]
    side = [w for w in side if inside(w)]
    gem = [w for w in gem if inside(w)]
    # ה-OCR מאחד לפעמים שורת גמרא עם שורת המפרש שלצדה לפיסה אחת בגודל הגמרא.
    # גבול עמודה = רווח ≥20, או רווח שעובר ברצועה לבנה אנכית (מרווח העמודות) — ריקה ברוב
    # השורות הסמוכות. החלק הרחב ביותר (לא זה עם הכי הרבה "מילים": OCR גרוע מתפרק לרסיסים) נשאר גמרא.
    allrows = rows_of([w for w in W if inside(w)])
    def gutter(xa, xb, cy):
        if xb - xa < 5:
            return False
        xa, xb = (xa + xb) / 2 - 2, (xa + xb) / 2 + 2  # אמצע הרווח — קצוות המילים הסמוכות לא "סוגרים" אותו
        # רק שורות שחוצות את המקום (יש להן מילים משני צדי הרצועה) — שורה של עמודה אחרת לא מעידה כלום
        near_ = [r for r in allrows if 2 < abs(r["cy"] - cy) <= 45
                 and min(w["x0"] for w in r["w"]) < xa - 15 and max(w["x1"] for w in r["w"]) > xb + 15]
        if len(near_) < 4:
            return False
        hit = sum(1 for r in near_ if any(w["x0"] < xb and w["x1"] > xa for w in r["w"]))
        return hit <= 0.25 * len(near_)
    keep = []
    for r in rows_of(gem):
        ws_ = r["w"]
        parts, cur = [], [ws_[0]]
        for a_, b_ in zip(ws_, ws_[1:]):
            g_ = a_["x0"] - b_["x1"]
            if g_ >= 20 or (g_ >= 7 and gutter(b_["x1"] + 1, a_["x0"] - 1, r["cy"])):
                parts.append(cur); cur = []
            cur.append(b_)
        parts.append(cur)
        main = max(parts, key=lambda pt: max(w["x1"] for w in pt) - min(w["x0"] for w in pt))
        keep += main
        for part in parts:
            if part is not main:
                side += [dict(w, size=S) for w in part]
    gem = keep
    # וגם כשהרווח רגיל (מרווח העמודות ~12): מילה "של גמרא" שבמקומה יש עמודת מפרש גם בשורות
    # שמעליה וגם בשורות שמתחתיה — שייכת לעמודה (במעבר לגמרא רחבה אין מפרש מתחת, ולכן לא נוגעים)
    side_c = [((w["x0"] + w["x1"]) / 2, (w["y0"] + w["y1"]) / 2, w["x0"], w["x1"]) for w in side]
    side_top = min((c[1] for c in side_c), default=0); side_bot = max((c[1] for c in side_c), default=0)
    def in_column(w):
        cx, cy = (w["x0"] + w["x1"]) / 2, (w["y0"] + w["y1"]) / 2
        near = lambda sgn: any(x0 - 3 <= cx <= x1 + 3 or abs(sx - cx) < 12
                               for sx, sy, x0, x1 in side_c if 3 < sgn * (sy - cy) < 26)
        # בשורה העליונה/התחתונה של עמודת המפרש אין שכן מצד אחד — מספיק הצד השני
        return (near(1) or cy <= side_top + 4) and (near(-1) or cy >= side_bot - 4)
    moved = [w for w in gem if in_column(w)]
    if moved:
        mv = {id(w) for w in moved}
        gem = [w for w in gem if id(w) not in mv]
        side += [dict(w, size=S) for w in moved]
    fTop = min(w["y0"] for w in side + gem)
    s = V_W / (fR - fL)
    X = lambda x: V_L + (x - fL) * s
    Y = lambda y: V_TOP + (y - fTop) * s

    # --- גמרא ---
    grows = rows_of(gem)
    pitch = st.median(b["cy"] - a["cy"] for a, b in zip(grows, grows[1:]) if 8 < b["cy"] - a["cy"] < 16)
    # מילת-קישור בתחתית (המילה הראשונה של העמוד הבא) — לא צמודה לשמאל הגוש
    if len(grows) > 2 and len(grows[-1]["w"]) <= 2 and abs(grows[-1]["x0"] - grows[-2]["x0"]) > 6 and grows[-1]["x1"] < grows[-2]["x1"] - 20:
        grows = grows[:-1]
    blocks = []
    for i, r in enumerate(grows):
        last = i == len(grows) - 1
        b = blocks[-1] if blocks else None
        same = b and abs(r["x1"] - b["x1"]) < 5 and (last or abs(r["x0"] - b["x0"]) < 5)
        if same:
            b["rows"].append(r)
        else:
            blocks.append({"x0": r["x0"], "x1": r["x1"], "rows": [r]})
    # --- מפרשים: שורות (לפי קו בסיס) → פיסות → צד ---
    srows = rows_of(side, tol=3.0, base=True)
    mid = (fL + fR) / 2
    gspan = []  # טווחי הגמרא: (y עליון, y תחתון, x0, x1)
    for b_ in blocks:
        rws = b_["rows"]
        gx0 = st.median(r["x0"] for r in rws[:-1]) if len(rws) > 1 else rws[0]["x0"]
        gspan.append((rws[0]["cy"] - pitch / 2, rws[-1]["cy"] + pitch / 2, gx0, st.median(r["x1"] for r in rws)))
    mk = lambda ws_, cy: {"cy": cy, "w": ws_, "x0": min(w["x0"] for w in ws_), "x1": max(w["x1"] for w in ws_)}
    pcs = []
    for r in srows:
        yc = r["cy"] - 2
        g = next((g for g in gspan if g[0] <= yc <= g[1]), None)
        if g:
            # לצד הגמרא: חותכים בדיוק בקצוות גוש הגמרא שבגובה הזה
            left = [w for w in r["w"] if w["x1"] <= g[2] + 2]
            right = [w for w in r["w"] if w["x0"] >= g[3] - 2]
            parts = [x for x in (right, left) if x]
        else:
            # מעל/מתחת לגמרא: שני חצאים זה לצד זה רק אם יש רווח ≥10 שמכסה את האמצע
            # (מרווח העמודות תמיד בדיוק באמצע, ~12; רווחי מילים מגיעים עד ~9)
            ws_ = r["w"]
            cut = next((i for i in range(len(ws_) - 1)
                        if ws_[i]["x0"] - ws_[i + 1]["x1"] >= 10 and ws_[i + 1]["x1"] <= mid - 4 and ws_[i]["x0"] >= mid + 4), None)
            parts = [ws_[: cut + 1], ws_[cut + 1:]] if cut is not None else [ws_]
        for part in parts:
            pc = mk(part, r["cy"])
            pc["side"] = "F" if pc["x1"] - pc["x0"] > 0.8 * (fR - fL) else ("R" if (pc["x0"] + pc["x1"]) / 2 > mid else "L")
            pcs.append(pc)
    text = lambda ps: " ".join(fold(norm_token(w["t"])) for pc in ps for w in pc["w"])
    rtxt = {k: " ".join(fold(norm_token(t)) for t in refs[k][0]) for k in ("rashi", "tosafot")}
    sc = lambda t, k: fuzz.partial_ratio(t, rtxt[k]) if t else 0
    R = [pc for pc in pcs if pc["side"] == "R"]; Lp = [pc for pc in pcs if pc["side"] == "L"]
    # רש"י תמיד בצד הפנימי (ליד הכריכה): בעמוד א מימין, בעמוד ב משמאל
    rashi_side = "R" if key.endswith("a") else "L"
    for pc in pcs:
        if pc["side"] == "F":
            t = text([pc])
            pc["s"] = "rashi" if sc(t, "rashi") >= sc(t, "tosafot") else "tosafot"
        else:
            pc["s"] = "rashi" if pc["side"] == rashi_side else "tosafot"
    # כשאין (כמעט) תוספות, רש"י ממשיך לעמודה החיצונית — מכריעים שורה-שורה לפי הטקסט,
    # עם החלקה על השכנים (שורה בודדת דומה במקרה למפרש השני לא מחליפה צד)
    for sd in ("R", "L"):
        col = sorted((pc for pc in pcs if pc["side"] == sd), key=lambda pc: pc["cy"])
        d = []
        for pc in col:
            t = text([pc])
            d.append(sc(t, "rashi") - sc(t, "tosafot") if len(t) >= 12 else 0)
        for i, pc in enumerate(col):
            m = st.median(d[max(0, i - 3): i + 4])
            if m > 12:
                pc["s"] = "rashi"
            elif m < -12:
                pc["s"] = "tosafot"
    gbottom = max((g[1] for g in gspan), default=0)

    slabs, report = [], {}
    # גמרא: עיגון
    glines = [r["w"] for b in blocks for r in b["rows"]]
    gtext, gcov, grange = anchor(glines, refs["gemara"][0], refs["gemara"][1:])
    report["gemara"] = {"lines": len(glines), "cover": round(gcov, 3)}
    lh = pitch * s
    li = 0
    for bi, b in enumerate(blocks):
        rows = b["rows"]
        x0 = st.median(r["x0"] for r in rows[:-1]) if len(rows) > 1 else b["x0"]
        x1 = st.median(r["x1"] for r in rows)
        L_, Rr = X(x0), X(x1)
        if abs(L_ - V_L) < 4: L_ = V_L
        if abs(Rr - (V_L + V_W)) < 4: Rr = V_L + V_W
        lines = []
        for k, r in enumerate(rows):
            t = " ".join(gtext[li]); li += 1
            partial = (r["x1"] - r["x0"]) < (x1 - x0) - 8
            lines.append({"t": t, "ws": None, "w": None if partial else round(Rr - L_, 2)})
        top = Y(rows[0]["cy"]) - lh / 2
        slabs.append({"s": "gemara", "l": round(L_, 2), "t": round(top, 2), "w": round(Rr - L_, 2), "h": round(len(rows) * lh, 2),
                      "fs": round(G_FS * lh / G_LH, 2), "lh": round(lh, 3), "lines": lines})
    # מפרשים: פסיעת שורה נמדדת בתוך כל עמודה (שורות רש"י ותוספות אינן באותו גובה)
    diffs = []
    for st_ in ("rashi", "tosafot"):
        ys = sorted(pc["cy"] for pc in pcs if pc["s"] == st_)
        diffs += [b - a for a, b in zip(ys, ys[1:]) if 7 < b - a < 14]
    spitch = st.median(diffs)
    slh = spitch * s
    for st_ in ("rashi", "tosafot"):
        ps = [pc for pc in pcs if pc["s"] == st_]
        if not ps:
            continue
        ps.sort(key=lambda pc: pc["cy"])
        # אות/מילה פותחת מוגדלת (על פני שתי שורות): מצטרפת לראש השורה הסמוכה מתחתיה בעמודה
        merged = []
        for i, pc in enumerate(ps):
            big = all(bigcap(w) for w in pc["w"]) and len(pc["w"]) <= 2
            nxt = next((q for q in ps[i + 1:] if 0 < q["cy"] - pc["cy"] < 1.6 * spitch and abs((q["x0"] + q["x1"]) / 2 - (pc["x0"] + pc["x1"]) / 2) < 140), None)
            if big and nxt is not None:
                nxt["w"] = pc["w"] + nxt["w"]; nxt["x1"] = max(nxt["x1"], pc["x1"]); nxt["drop"] = len(pc["w"])
                continue
            merged.append(pc)
        ps = merged
        # סדר קריאה: בעמודה אחת — מלמעלה למטה. מפרש בשתי העמודות (רש"י ממשיך לעמודה החיצונית
        # כשאין תוספות) — מנסים את שני הסדרים (ימין←שמאל / שמאל←ימין) ובוחרים לפי ההתאמה לטקסט.
        orders = [ps]
        if {pc["side"] for pc in ps} >= {"R", "L"}:
            for first in ("R", "L"):
                rank = lambda pc: 2 if pc["side"] == "F" and pc["cy"] > gbottom else (0 if pc["side"] in (first, "F") else 1)
                orders.append(sorted(ps, key=lambda pc: (rank(pc), pc["cy"])))
        best = None
        for cand in orders:
            # מילת-קישור בסוף עמודת מפרש (המילה הראשונה בעמוד הבא) — שורה של מילה אחת שאינה צמודה לימין
            if len(cand) > 2 and len(cand[-1]["w"]) == 1 and cand[-1]["x1"] < cand[-2]["x1"] - 8:
                cand = cand[:-1]
            res = anchor([pc["w"] for pc in cand], refs[st_][0], refs[st_][1:])
            if best is None or res[1] > best[1][1] + 0.01:
                best = (cand, res)
        ps, (stext, scov, _) = best
        report[st_] = {"lines": len(ps), "cover": round(scov, 3)}
        groups = []
        for i, (pc, t) in enumerate(zip(ps, stext)):
            g = groups[-1] if groups else None
            nxt = ps[i + 1] if i + 1 < len(ps) else None
            # שורה קצרה (סוף זרם/פיסקה) מצטרפת לגוש אם מתחילה באותו קו ימני
            short_ok = nxt is None or abs(nxt["x1"] - pc["x1"]) > 8
            # שורה מוזחת מימין (ליד אות פותחת מוגדלת) — אותו קצה שמאלי, הזחה קטנה
            indented = g is not None and abs(pc["x0"] - g["x0"]) < 6 and 0 < g["x1"] - pc["x1"] < 40
            if g and (abs(pc["x1"] - g["x1"]) < 8 or indented) and (abs(pc["x0"] - g["x0"]) < 8 or short_ok) and 0 < pc["cy"] - g["ps"][-1]["cy"] < 2.2 * spitch:
                g["ps"].append(pc); g["t"].append(t)
            else:
                groups.append({"x1": pc["x1"], "x0": pc["x0"], "ps": [pc], "t": [t]})
        for g in groups:
            ps_ = g["ps"]
            x0 = st.median(pc["x0"] for pc in ps_[:-1]) if len(ps_) > 1 else ps_[0]["x0"]
            x1 = st.median(pc["x1"] for pc in ps_)
            L_, Rr = X(x0), X(x1)
            if abs(L_ - V_L) < 4: L_ = V_L
            if abs(Rr - (V_L + V_W)) < 4: Rr = V_L + V_W
            top = Y(ps_[0]["cy"]) - 0.78 * slh
            lines = []
            for pc, t in zip(ps_, g["t"]):
                ind = max(0.0, (x1 - pc["x1"]) * s) if x1 - pc["x1"] > 3 else 0.0
                full = (pc["x1"] - pc["x0"]) >= (x1 - x0) - 8 - ind / s
                ln = {"t": line_html(t, pc.get("drop", 0)), "ws": None, "w": round(Rr - L_ - ind, 2) if full else None}
                if ind:
                    ln["i"] = round(ind, 2)
                lines.append(ln)
            slabs.append({"s": st_, "l": round(L_, 2), "t": round(top, 2), "w": round(Rr - L_, 2), "h": round(len(ps_) * slh, 2),
                          "fs": round(S_FS * slh / S_LH, 2), "lh": round(slh, 3), "lines": lines})
    # כותרת
    header = []
    head = [w for w in head if fL - 6 <= w["x0"] and w["x1"] <= fR + 6]
    for r in rows_of(head):
        for pc in pieces_of(r, gap=15):
            header.append({"l": round(X(pc["x0"]), 2), "t": round(Y(min(w["y0"] for w in pc["w"])), 2),
                           "fs": round(st.median(w["size"] for w in pc["w"]) * s, 2), "text": " ".join(w["t"] for w in pc["w"])})
    # סימן העמוד בכותרת: מהמספר עצמו (ה-OCR מאבד את הנקודה/הנקודתיים)
    label = heb_num(int(key[:-1])) + ("." if key.endswith("a") else ":")
    # הסימן בקצה החיצוני של הכותרת (ימין בעמוד ב, שמאל בעמוד א) — הפיסה הקצרה
    short = [h for h in header if len(h["text"].replace(" ", "")) <= 4]
    if short:
        # רעש קטן בכותרת נקרא גם הוא כ"פיסה קצרה" — נשאר רק הסימן בפינה החיצונית
        outer = min(short, key=lambda h: h["l"]) if key.endswith("a") else max(short, key=lambda h: h["l"])
        outer["text"] = label
        header = [h for h in header if h not in short or h is outer]
    if header and not short:
        # ה-OCR לא קרא את הסימן — מוסיפים אותו בפינה החיצונית (עמוד א משמאל, עמוד ב מימין)
        fs_ = max(h["fs"] for h in header); t_ = min(h["t"] for h in header)
        header.append({"l": round(V_L if key.endswith("a") else V_L + V_W - 1.2 * fs_, 2), "t": t_, "fs": fs_, "text": label})
    report["rashi_side"] = rashi_side
    report["frame"] = [round(fL, 1), round(fR, 1), round(fTop, 1)]
    report["blocks"] = [f'{sl["s"]} {round(sl["w"])}×{len(sl.get("lines") or []) or round(sl["h"] / sl["lh"])}' for sl in slabs]
    lay = {"page": {"w": PAGE_W, "h": round(Y(p.rect.height), 2)}, "slabs": slabs, "header": header}
    return lay, report


def compact(o):
    """מספרים בדיוק עשירית יחידה (≈עשירית פיקסל) — חוץ מריווח מילים (מאית)."""
    if isinstance(o, dict):
        return {k: (round(v, 2) if k == "ws" and isinstance(v, float) else compact(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [compact(v) for v in o]
    if isinstance(o, float):
        r = round(o, 1)
        return int(r) if r == int(r) else r
    return o


def write_layouts(path, layouts):
    data = json.dumps(compact(layouts), ensure_ascii=False, separators=(",", ":")).encode()
    open(path, "wb").write(gzip.compress(data, 9))


def main(pdf, tractate, first_page, only=None):
    shas = load(f"{ROOT}/shas/{tractate}.json.gz")
    ws = load(f"{ROOT}/shas-ws/{tractate}.json.gz")
    keys = list(shas.keys())
    doc = fitz.open(pdf)
    out_path = f"{ROOT}/tzurat/print/{tractate.lower()}.json.gz"
    out = json.loads(gzip.decompress(open(out_path, "rb").read())) if os.path.exists(out_path) else {}
    for idx, key in enumerate(keys):
        if only and key not in only:
            continue
        pg = first_page - 1 + idx
        if pg >= len(doc):
            break
        com = lambda k, c: next((x["segments"] for x in shas[k]["commentaries"] if x["key"] == c), [])
        refs = {
            "gemara": window(lambda k: gem_tokens(ws.get(k) or shas[k]["gemara"]), keys, key),
            "rashi": window(lambda k: side_tokens(com(k, "rashi")), keys, key),
            "tosafot": window(lambda k: side_tokens(com(k, "tosafot")), keys, key),
        }
        try:
            lay, rep = build_page(doc[pg], key, refs)
        except Exception as e:  # עמוד חריג לא עוצר את המסכת — מדווחים וממשיכים
            print(key, "pdf p", pg + 1, "FAILED", repr(e), flush=True)
            continue
        out[key] = lay
        print(key, "pdf p", pg + 1, json.dumps(rep, ensure_ascii=False), flush=True)
    out = {k: out[k] for k in keys if k in out}  # סדר העמודים במסכת
    write_layouts(out_path, out)
    print("→", out_path, len(out), "amudim")


def tractate_of(pdf):
    """מסכת לפי שם הקובץ העברי (למשל "מגילה.pdf", "שס נהרדעא - בבא מציעא.pdf")."""
    idx = json.load(open(f"{ROOT}/shas/index.json", encoding="utf-8"))["masechtot"]
    name = re.sub(r"[\s_\-]+", " ", os.path.splitext(os.path.basename(pdf))[0])
    hits = [m for m in idx if m["he"] in name or m["slug"].lower() in name.lower()]
    return max(hits, key=lambda m: len(m["he"]))["slug"] if hits else None


def first_page_of(doc, slug):
    """עמוד ה-PDF של דף ב. — העמוד שטקסט הגמרא שלו הכי דומה לתחילת ב. (בכרך יש לפעמים שער/הקדמה)."""
    shas = load(f"{ROOT}/shas/{slug}.json.gz")
    k0 = next(iter(shas))
    ref = " ".join(fold(norm_token(t)) for t in gem_tokens(shas[k0]["gemara"]))[:400]
    best = (0, 1)
    for i in range(min(25, len(doc))):
        ws_ = [w for w in page_words(doc[i]) if HEB.search(w["t"]) and w["size"] >= 8.5]
        txt = " ".join(fold(norm_token(w["t"])) for w in ws_)
        sc_ = fuzz.partial_ratio(ref[:200], txt) if txt else 0
        best = max(best, (sc_, i + 1))
    return best[1]


def update_index():
    """רשימת המסכתות שיש להן דפוס מדויק — האפליקציה קוראת אותה במקום רשימה קשיחה בקוד."""
    d = f"{ROOT}/tzurat/print"
    slugs = sorted(f[: -len(".json.gz")] for f in os.listdir(d) if f.endswith(".json.gz"))
    json.dump(slugs, open(f"{d}/index.json", "w", encoding="utf-8"))


def run(pdf, slug=None, first=None, only=None):
    slug = slug or tractate_of(pdf)
    if not slug:
        sys.exit(f"לא זוהתה מסכת משם הקובץ: {pdf}")
    if not os.path.exists(f"{ROOT}/shas-ws/{slug}.json.gz"):
        import fetch_ws  # גמרא בכתיב הדפוס (ויקיטקסט) — פעם אחת לכל מסכת
        fetch_ws.main(slug)
    first = first or first_page_of(fitz.open(pdf), slug)
    print(f"== {slug}: {pdf} (ב. = עמוד {first})", flush=True)
    main(pdf, slug, first, only)
    update_index()


if __name__ == "__main__":
    # hb_pdf.py <קובץ.pdf | תיקייה> [מסכת] [עמוד-של-ב.] [2a,2b...]
    # תיקייה: כל קובצי ה-PDF בה, מסכת לפי שם הקובץ ועמוד ב. מזוהה לבד
    arg = sys.argv[1]
    if os.path.isdir(arg):
        for f in sorted(os.listdir(arg)):
            if f.lower().endswith(".pdf"):
                try:
                    run(os.path.join(arg, f))
                except SystemExit as e:
                    print(e)
    else:
        a = sys.argv[2:]
        run(arg, a[0] if a else None, int(a[1]) if len(a) > 1 else None, a[2].split(",") if len(a) > 2 else None)
