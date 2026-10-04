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
# מיקום קו הבסיס (תחתית גוף האות) בתוך תיבת השורה, כחלק מגובה השורה — גמרא (גופן וילנא) ומפרשים (גופן רש"י)
BASE_G, BASE_S = float(os.environ.get("BASE_G", 0.785)), float(os.environ.get("BASE_S", 0.684))


# ---------- מילים עם גודל/הדגשה ----------
def page_words(p):
    """מילות ה-OCR עם גודל גופן, נבנות מהתווים עצמם.
    סימני ההפניה הקטנים בגמרא (מספרים/אותיות של תורה אור, עין משפט, מסורת הש"ס, הגהות) נקראים
    כתווים קטנים שנדבקים למילה ("5׳ביום"): מסירים תווים קטנים בבירור מגוף המילה, וגרש/מקף בתחילתה."""
    D = p.get_text("rawdict")
    out = []
    for blk in D["blocks"]:
        for ln in blk.get("lines", []):
            cur = []
            def flush():
                if not cur:
                    return
                cnt = {}
                for c, sp in cur:
                    cnt[round(sp["size"], 1)] = cnt.get(round(sp["size"], 1), 0) + 1
                size = max(cnt, key=lambda z: (cnt[z], z))
                keep = [(c, sp) for c, sp in cur if sp["size"] >= 0.8 * size]
                t = re.sub(r"^[׳'״\"־■\-]+", "", "".join(c["c"] for c, _ in keep))
                if t:
                    xs = [c["bbox"] for c, _ in keep]
                    font = max(keep, key=lambda cs: cs[1]["size"])[1]["font"]
                    out.append({"x0": min(b_[0] for b_ in xs), "y0": min(b_[1] for b_ in xs), "x1": max(b_[2] for b_ in xs),
                                "y1": max(b_[3] for b_ in xs), "t": t, "size": size, "bold": "Bold" in font})
                cur.clear()
            for sp in ln["spans"]:
                for c in sp["chars"]:
                    if c["c"].isspace():
                        flush()
                    else:
                        cur.append((c, sp))
            flush()
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
                dh[-1] = dh[-1].rstrip(".:") + "."
            out += [DH + t for t in dh] + [t for t in m.group(2).split() if HEB.search(t)]
        else:
            toks = [t for t in s.split() if HEB.search(t)]
            # בלי מקף: הד"ה נגמר בנקודה הראשונה (בתוך 15 המילים הראשונות, לא בתוך סוגריים)
            depth, end = 0, None
            for i, t in enumerate(toks[:15]):
                depth += t.count("(") + t.count("[") - t.count(")") - t.count("]")
                if depth <= 0 and t.endswith("."):
                    end = i
                    break
            if end is not None:
                toks = [DH + t for t in toks[: end + 1]] + toks[end + 1:]
            out += toks
    return no_quotes(out)


def no_quotes(toks):
    """מרכאות ציטוט בקצה מילה ("משכו) — תוספת של ספריא, לא בדפוס. גרשיים בתוך מילה (ר"י) נשארים."""
    out = []
    for t in toks:
        pre = DH if t.startswith(DH) else ""
        core = re.sub(r'^["״]+|["״]+$', "", t[len(pre):])
        if core:
            out.append(pre + core)
    return out


def line_html(tokens, drop=0, prev=None):
    """שורת מפרש: רצפי ד"ה מודגשים (<b>), כמו בדפוס; drop = מילים פותחות מוגדלות.
    המילה הראשונה של כל ד"ה מסומנת <i> (בתוספות היא מרובעת מוגדלת). prev = המילה הקודמת בזרם."""
    out, inb = [], False
    for k, t in enumerate(tokens):
        b = t.startswith(DH)
        start = b and (prev is None or not prev.startswith(DH) or prev.endswith((".", ":")))
        prev = t
        if k < drop:
            t = (DH if b else "") + "<big>" + t.lstrip(DH) + "</big>"
        elif start:
            t = DH + "<i>" + t.lstrip(DH) + "</i>"
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


def load_ws(tractate):
    """נוסח הגמרא: דפי ויקיטקסט עצמם (shas-wsraw — הצורה המודפסת של שמות וראשי תיבות) כשקיימים,
    ולכל עמוד שחסר בהם — התעתיק דרך ספריא (shas-ws)."""
    out = {}
    p_old = f"{ROOT}/shas-ws/{tractate}.json.gz"
    p_raw = f"{ROOT}/shas-wsraw/{tractate}.json.gz"
    if os.path.exists(p_old):
        out.update(load(p_old))
    if os.path.exists(p_raw) and os.environ.get("WS_SOURCE", "raw") == "raw":
        out.update(load(p_raw))
    return out


def window(tokens_of, keys, key, before=60, after=90):
    """הטקסט של העמוד + זנב הקודם + ראש הבא (גלישה בין עמודים)."""
    i = keys.index(key)
    prev = tokens_of(keys[i - 1])[-before:] if i > 0 else []
    nxt = tokens_of(keys[i + 1])[:after] if i + 1 < len(keys) else []
    cur = tokens_of(key)
    return prev + cur + nxt, len(prev), len(prev) + len(cur)


_HE = {}
_WARNED = {}


def tractate_he(slug):
    """שם המסכת בעברית (מ-index.json)."""
    if slug and not _HE:
        for m in json.load(open(f"{ROOT}/shas/index.json", encoding="utf-8"))["masechtot"]:
            _HE[m["slug"]] = m["he"]
    return _HE.get(slug)


def clean_segments(segs, he=None):
    """תיקוני נוסח של ספריא במפרשים: פסקה כפולה ברצף נשארת פעם אחת; בהפניה לאותה מסכת
    ספריא מוסיפה את שם המסכת ("מגילה דף כו.") ובדפוס וילנא אין אותו ("דף כו.")."""
    out, prev = [], None
    for sg in segs:
        key = fold(re.sub(r"[^א-ת ]", "", TAGS.sub(" ", sg)))[:400]
        if prev is not None and key and fuzz.ratio(key, prev) >= 92:
            continue
        prev = key
        if he:
            sg = re.sub(r"\(((?:לקמן|לעיל)\s+)?" + re.escape(he) + r"\s+", lambda m: "(" + (m.group(1) or ""), sg)
        out.append(sg)
    return out


def make_refs(shas, ws, keys, key, slug=None):
    """טקסט הייחוס לעמוד: גמרא (ויקיטקסט), רש"י ותוספות (ספריא) — עם הקשר מהעמודים הסמוכים.
    למפרשים מצורפת גם החלוקה לדיבורים, כדי שאפשר יהיה לסדר אותם לפי סדרם בדף המודפס."""
    he = tractate_he(slug)
    # רש"י ותוספות: נוסח אורייתא (ספריית אוצריא). ספריא רק כגיבוי אם אין קובץ — עם אזהרה
    import orayta
    src = {c: (orayta.load(he, c) if he else None) for c in ("rashi", "tosafot")}
    for c, d in src.items():
        if d is None and not _WARNED.get((slug, c)):
            print(f"!! {slug} {c}: no Orayta text, using Wikisource per amud (Sefaria only if Wikisource lacks it)", flush=True)
            _WARNED[(slug, c)] = True
    import ws_commentary

    def com(k, c):
        if src[c] is None:
            # אין קובץ באורייתא למסכת (הוריות — תוספות): ויקיטקסט עמוד-עמוד; ספריא רק אם גם שם אין
            ws_ = ws_commentary.page(he, k, c) if he else None
            if ws_:
                return ws_
            sef = clean_segments(next((x["segments"] for x in shas[k]["commentaries"] if x["key"] == c), []), he)
            if sef:
                return sef
            # הוריות ט. והלאה: אין תוספות בדף — במקומם תוספות הרא"ש
            return (ws_commentary.alt_tosafot(he, k) if c == "tosafot" and he else None) or []
        if k in src[c]:
            return src[c][k]
        # עמוד בודד שחסר באורייתא (בבא קמא עא. בתוספות): מוויקיטקסט, לא מספריא
        ws_ = ws_commentary.page(he, k, c)
        if ws_ and not _WARNED.get((slug, c, k)):
            print(f"!! {slug} {k} {c}: missing in Orayta, using Wikisource", flush=True)
            _WARNED[(slug, c, k)] = True
        return ws_ or []
    refs = {"gemara": window(lambda k: gem_tokens(ws.get(k) or shas[k]["gemara"]), keys, key)}
    for c in ("rashi", "tosafot"):
        refs[c] = window(lambda k: side_tokens(com(k, c)), keys, key) + ([side_tokens([sg]) for sg in com(key, c)],)
    return refs


def print_order(ocr_lines, ref, lo, hi, segs):
    """סדר הדיבורים בדפוס אינו תמיד הסדר שבספריא (שם לפי מקום הדיבור בגמרא). מאתרים את תחילת כל
    דיבור ברצף ה-OCR של העמודה ומסדרים לפיו; דיבור שלא אותר נשאר צמוד לקודמו."""
    segs = [sg for sg in segs if sg]
    if len(segs) < 2 or sum(len(sg) for sg in segs) != hi - lo:
        return ref
    toks = [fold(norm_token(w["t"])) for ln in ocr_lines for w in ln]
    starts, hay, pos = [], [], 0
    for t in toks:
        starts.append(pos); hay.append(t); pos += len(t) + 1
    hay = " ".join(hay)
    if not hay:
        return ref
    import bisect
    where = []
    for sg in segs:
        needle = " ".join(fold(norm_token(t)) for t in sg[:10])
        al = fuzz.partial_ratio_alignment(needle, hay) if len(needle) >= 8 else None
        where.append(bisect.bisect_right(starts, al.dest_start) - 1 if al and al.score >= 80 else None)
    key_, last = [], -1
    for i, w_ in enumerate(where):
        last = w_ if w_ is not None else last
        key_.append((last, i))
    order = sorted(range(len(segs)), key=lambda i: key_[i])
    if order == list(range(len(segs))):
        return ref
    return ref[:lo] + [t for i in order for t in segs[i]] + ref[hi:]


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
ANCHOR_INFO = {}


def free_bounds(lines):
    """גבולות שורה שה-OCR לא הכריע: לפחות אחת משתי המילים שבצדי הגבול לא הותאמה ישירות."""
    J, M = ANCHOR_INFO.get("J", []), ANCHOR_INFO.get("M", set())
    free, t = set(), 0
    for i, ln in enumerate(lines[:-1]):
        t += len(ln)
        if 0 < t < len(J) and (J[t - 1] not in M or J[t] not in M):
            free.add(i + 1)
    return free


def anchor(lines, ref, bounds=None, ext=None):
    """lines: [[ocr words]] בסדר קריאה. מחזיר טקסט נכון לכל שורה + כיסוי.
    bounds: (התחלה, סוף) של טקסט העמוד עצמו בתוך ref — ההשלמה לפני ההתאמה הראשונה
    ואחרי האחרונה לא חורגת ממנו (כדי שמילות הקשר מהעמוד הסמוך לא ייכנסו לשורה)."""
    lo, hi = bounds or (0, len(ref))
    # ext: קצוות כל שורה (x0, x1) כפי שנמדדו מהתמונה — קיימים גם לשורות שה-OCR איבד לגמרי
    if ext is None:
        ext = [(min(w["x0"] for w in ln), max(w["x1"] for w in ln)) if ln else (0, 0) for ln in lines]
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
    # זנב: התאמה אחרונה שקופצת קדימה בטקסט הרבה יותר ממה שה-OCR התקדם, אל מעבר לסוף העמוד
    # (מילת קישור או הערה שהותאמה לראש העמוד הבא) — לא עוגן; אחרת כל מה שביניהן נדחס לשורה האחרונה
    # (גם אשכול שלם: ביטוי שחוזר פעמיים ברצף — סוף העמוד וראש הבא — והשורה האחרונה הותאמה למופע השני)
    m = len(pairs)
    while m > 0 and pairs[m - 1][1] >= hi:
        m -= 1
    if 0 < m < len(pairs):
        (ia, ja), (ib, jb) = pairs[m - 1], pairs[m]
        if (jb - ja) - (ib - ia) > 6:
            pairs = pairs[:m]
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
    pos, starts, off = [], [], 0.0
    for ln, (ex0, ex1) in zip(lines, ext):
        starts.append(off)
        pos += [off + max(0.0, ex1 - w["x1"]) for w in ln]
        off += (ex1 - ex0) + 4
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
    # אחרי ההתאמה האחרונה: לא חורגים מסוף העמוד (אלא אם הדפוס עצמו כבר המשיך מעבר לו)
    lim_ = (hi - 1 - j1) if j1 < hi else (len(ref) - 1 - j1)
    for k in range(1, min(len(flat) - 1 - i1, lim_) + 1):
        line_of[j1 + k] = flat[i1 + k][0]
    out = [[] for _ in lines]
    for j in sorted(line_of):
        out[line_of[j]].append(ref[j])
    # שורה שנשארה ריקה בין שורות מלאות (ה-OCR איבד אותה, והמילים שלה נדחסו לשכנותיה):
    # מחלקים מחדש את מילות השורות הסמוכות לפי רוחב כל שורה
    n = len(out)
    i = 0
    while i < n:
        if out[i] or ext[i][1] - ext[i][0] < 25:
            i += 1
            continue
        j = i
        while j + 1 < n and not out[j + 1]:
            j += 1
        a, b = i - 1, j + 1
        if a >= 0 and b < n and out[a] and out[b]:
            words = [w for k in range(a, b + 1) for w in out[k]]
            widths = [max(1.0, ext[k][1] - ext[k][0]) for k in range(a, b + 1)]
            if len(words) >= len(widths):
                size = [len(w.lstrip(DH)) + 1 for w in words]
                total, tw = sum(size), sum(widths)
                new, k, cum, lim = [[] for _ in widths], 0, 0.0, widths[0] / tw * total
                for w, sz in zip(words, size):
                    while k < len(widths) - 1 and cum + sz / 2 > lim:
                        k += 1
                        lim += widths[k] / tw * total
                    new[k].append(w); cum += sz
                if all(new):
                    out[a: b + 1] = new
        i = j + 1
    cover = len(pairs) / max(1, len(flat))
    # לתיקון לפי רוחב: אילו מילות ייחוס הותאמו ישירות למילת OCR (J = סדר המילים בפלט)
    ANCHOR_INFO.clear()
    ANCHOR_INFO.update({"J": sorted(line_of), "M": {j for _, j in pairs}})
    return out, cover, (min(line_of), max(line_of))


def fit_rows(cys, default_pitch):
    """קו הבסיס של השורה הראשונה + פסיעת השורה של גוש, בהתאמה חסינה (Theil–Sen) לכל שורות הגוש —
    שורה בודדת שנמדדה לא מדויק (סוגריים, ק/ך/ן, שורה קצרה) לא מזיזה את כל הגוש ולא צוברת סחף."""
    n = len(cys)
    if n < 3:
        return cys[0], default_pitch
    slopes = [(cys[j] - cys[i]) / (j - i) for i in range(n) for j in range(i + max(1, n // 2), n)]
    pitch = st.median(slopes)
    return st.median(c - i * pitch for i, c in enumerate(cys)), pitch


def running_header(head, fL, fR, p):
    """הכותרת הרצה = השורה העליונה של מילים גדולות בראש העמוד בלבד. מילה פותחת מוגדלת של רש"י/תוספות
    בדף פתיחה ("מאימתי", גופן 14) קרובה לכותרת ואינה חלק ממנה."""
    top = [w for w in head if fL - 6 <= w["x0"] and w["x1"] <= fR + 6 and w["y1"] < p.rect.y0 + 0.1 * p.rect.height]
    if not top:
        return []
    y_ = min(w["y1"] for w in top)
    return [w for w in top if w["y1"] <= y_ + 6]


# ---------- שורות מהתמונה ----------
def hadran_like(txt):
    """שורה שהיא כותרת "הדרן עלך ..." — בסבילות לשגיאות OCR ("הדק עלך")."""
    ws_ = [re.sub(r"[^א-ת]", "", w) for w in txt.split()][:3]
    return (any(fuzz.ratio(w, "הדרן") >= 50 for w in ws_[:2]) and any(fuzz.ratio(w, "עלך") >= 66 for w in ws_)
            and len(txt.split()) >= 3)


def hadran_text(ocr, refs):
    """נוסח הכותרת מהמקור: "הדרן עלך <שם הפרק>" מתוך טקסטי הייחוס, לפי הדמיון לקריאת ה-OCR."""
    n = len(ocr.split())
    cands = set()
    for v in refs.values():
        toks = [t.lstrip(DH) for t in v[0]]
        for i in range(len(toks) - 2):
            if re.sub(r"[^א-ת]", "", toks[i]) == "הדרן" and re.sub(r"[^א-ת]", "", toks[i + 1]) == "עלך":
                for m in range(max(3, n - 1), n + 2):
                    cands.add(re.sub(r"[^א-ת׳'\" ]", "", " ".join(toks[i:i + m])).strip())
    best = max(cands, key=lambda c: fuzz.ratio(c, ocr), default=None)
    return best if best and fuzz.ratio(best, ocr) >= 60 else re.sub(r"[^א-ת׳'\" ]", "", ocr).strip()


def image_rows(p, W, fL, fR, head):
    """שורות הגמרא והמפרשים כפי שהן בפיקסלים של הסריקה (img_lines), עם מילות ה-OCR שבתוכן.
    הסוג (גמרא/מפרש) נקבע לפי גובה גוף האות שנמדד בתמונה — לא לפי גודל הגופן שה-OCR ניחש.
    מחזיר (שורות גמרא, פיסות מפרשים, ראש הטקסט)."""
    import img_lines as IL
    mid = (fL + fR) / 2
    # הכותרת הרצה: מילים גדולות בראש העמוד בלבד (מילה גדולה באמצע הדף — פתיחת פרק — אינה כותרת)
    hd = running_header(head, fL, fR, p)
    y_top = max((w["y1"] for w in hd), default=p.rect.y0 + 18) + 1.0
    pieces, gutter_between = IL.find_lines(p, fL, fR, y_top, p.rect.height - 10)
    wd = lambda l: l["x1"] - l["x0"]
    # שני גבהים אופייניים: גמרא (~6.5 נק') ומפרשים (~5) — 2-means על השורות הארוכות
    xs_ = [l["xh"] for l in pieces if wd(l) >= 60 and 3.8 <= l["xh"] <= 8.5]
    cg, cs = 6.5, 5.0
    for _ in range(10):
        a = [x for x in xs_ if abs(x - cg) < abs(x - cs)]; b = [x for x in xs_ if abs(x - cg) >= abs(x - cs)]
        cg = st.mean(a) if a else cg; cs = st.mean(b) if b else cs
    if cg - cs < 0.8:
        raise ValueError(f"no gemara/commentary height split ({cg:.2f}/{cs:.2f})")
    thr = (cg + cs) / 2
    cls = lambda l: "n" if l["xh"] < cs - 0.9 else "g" if l["xh"] >= thr else "s"
    # רק לשורה רחבה שגובהה סביר גובה גוף האות (ולכן הסוג) אמין
    wide = lambda l: wd(l) >= 60 and l["xh"] >= cs - 0.9
    # הערות תחתית באות קטנה (תורה אור): שורות רחבות ונמוכות שמתחת לשורת הטקסט האחרונה — לא חלק מהזרמים.
    # שורה נמוכה באמצע הטקסט היא שורה רגילה שנמדדה חלקית (דפוס חיוור) — נשארת
    last_text = max((l["base"] for l in pieces if wide(l)), default=0)
    L = [l for l in pieces if not (wd(l) >= 60 and cls(l) == "n" and l["base"] > last_text)]

    def classify():
        """שורה רחבה — לפי גובה גוף האות. פיסה צרה (מילה-שתיים, שגובהה אינו אמין) — לפי העמודה
        שהיא יושבת בה: סוג השורה הרחבה הקרובה שמעליה/מתחתיה ושמכילה אותה אופקית."""
        W_ = [l for l in L if wide(l)]
        for l in W_:
            l["c"] = cls(l)
        # שורה רחבה שגובהה נמדד על הגבול (דפוס חיוור/עבה) וששתי שכנותיה באותה עמודה מסוג אחר — כמותן
        # וכן שורה שמילה פותחת מוגדלת בתוכה הגביהה אותה — כשהיא באותם קצוות בדיוק כמו שכנותיה (אותה עמודה)
        flips = []
        for l in W_:
            ov = lambda o: min(o["x1"], l["x1"]) - max(o["x0"], l["x0"]) >= 0.8 * wd(l)
            up = [o for o in W_ if 4 < l["base"] - o["base"] < 15 and ov(o)]
            dn = [o for o in W_ if 4 < o["base"] - l["base"] < 15 and ov(o)]
            if up and dn:
                u, d = max(up, key=lambda o: o["base"]), min(dn, key=lambda o: o["base"])
                same_col = all(abs(o["x0"] - l["x0"]) < 5 and abs(o["x1"] - l["x1"]) < 5 for o in (u, d))
                if u["c"] == d["c"] != l["c"] and (abs(l["xh"] - thr) < 0.8 or same_col):
                    flips.append((l, u["c"]))
            elif dn and not up:
                # ראש עמודה: שורת מפרש שמתחילה במילה מוגדלת (ד"ה פותח) נמדדת גבוהה כגמרא — אם שתי
                # השורות שמתחתיה הן מפרש באותה עמודה (קצה משותף), גם היא מפרש
                d = min(dn, key=lambda o: o["base"])
                d2 = [o for o in W_ if 4 < o["base"] - d["base"] < 15
                      and min(o["x1"], l["x1"]) - max(o["x0"], l["x0"]) > 0.5 * min(wd(o), wd(l))]
                edge = lambda o: abs(o["x0"] - l["x0"]) < 5 or abs(o["x1"] - l["x1"]) < 5
                if l["c"] == "g" and d2:
                    d2 = min(d2, key=lambda o: o["base"])
                    if d["c"] == d2["c"] == "s" and edge(d):
                        flips.append((l, "s"))
        if os.environ.get("TOP_DEBUG"):
            y0_ = min(l["base"] for l in W_)
            for l in sorted(W_, key=lambda l: l["base"]):
                if l["base"] < y0_ + 40:
                    print("TOP", round(l["x0"], 1), round(l["x1"], 1), round(l["top"], 1), round(l["base"], 1), round(l["xh"], 2), l["c"], round(thr, 2))
        for l, c in flips:
            l["c"] = c
        for l in L:
            if wide(l):
                continue
            cx = (l["x0"] + l["x1"]) / 2
            nb = [o for o in W_ if o["x0"] - 3 <= cx <= o["x1"] + 3 and 4 < abs(o["base"] - l["base"]) < 15]
            # העמודה שהפיסה שייכת לה = השורה הצרה ביותר שמכילה אותה (עמודת רש"י, לא גמרא רחבה שמתחת)
            l["c"] = min(nb, key=lambda o: (wd(o), abs(o["base"] - l["base"])))["c"] if nb else ("g" if l["xh"] >= thr else "s")
        # גמרא שמתרחבת לכל רוחב העמוד (ברווחים גדולים): מילה-שתיים באותיות גמרא באותה שורה ממש עם פיסת
        # גמרא סמוכה — גמרא, גם אם היא יושבת מתחת לעמודת מפרש (שרשרת: "בת" ← "שלש שנים" ← שורת הגמרא)
        # (אבל לא כשעמודת המפרש ממשיכה מתחתיה — אז זו מילה באותיות גדולות בתוך המפרש)
        changed_ = True
        while changed_:
            changed_ = False
            for l in L:
                if wide(l) or l["c"] != "s" or l["xh"] < thr - 0.3:
                    continue
                if widened(l):
                    l["c"] = "g"; changed_ = True

    def widened(l):
        """פיסה צמודה לפיסת גמרא באותה שורה ממש, ובלי שורת מפרש מתחתיה באותה עמודה."""
        if not any(o is not l and o["c"] == "g" and abs(o["base"] - l["base"]) <= 1.5
                   and min(abs(o["x0"] - l["x1"]), abs(l["x0"] - o["x1"])) < 25 for o in L):
            return False
        return not any(o["c"] == "s" and 4 < o["base"] - l["base"] < 15
                       and min(o["x1"], l["x1"]) - max(o["x0"], l["x0"]) > 0.5 * min(wd(o), wd(l)) for o in L)

    def same_row(a, b):
        # שבר דק (רק ה"גג" או רק ה"בסיס" של מילה) — שייך לשורה שהפס שלה מכיל אותו
        for t, o in ((a, b), (b, a)):
            if t["xh"] < 3.4 and o["xh"] >= 3.4:
                return t["top"] >= o["top"] - 1 and t["base"] <= o["base"] + 1
        ov = min(a["base"], b["base"]) - max(a["top"], b["top"])
        tol = 1.2 if wide(a) and wide(b) else 2.6  # מילה בודדת עם ק/ך/ן נמדדת נמוך יותר
        return abs(a["base"] - b["base"]) <= tol and ov >= 0.6 * min(a["base"] - a["top"], b["base"] - b["top"])

    def mergeable(a, b, gap):  # b משמאל ל-a, על אותה שורה
        if a["c"] != b["c"]:
            return False  # שורת גמרא ושורת מפרש שבמקרה באותו גובה
        if a["c"] == "g":
            # לגמרא עמודה אחת — רווח גדול (או "נהר" של כמה שורות) בתוכה הוא רווחי מילים; אבל מרווח עמודות
            # אמיתי (נהר לבן לאורך עשרות שורות) מפריד בין שורת גמרא לשורת כותרת/מפרש באותיות גדולות שלצדה
            return gutter_between(a, b) < 60
        # שני מפרשים זה לצד זה נפרדים רק במרווח שבאמצע העמוד
        return not (gap >= 9 and b["x1"] <= mid - 3 and a["x0"] >= mid + 3)

    changed = True
    while changed:
        changed = False
        classify()
        L.sort(key=lambda l: -l["x1"])
        for i, a in enumerate(L):
            for b in L[i + 1:]:
                gap = a["x0"] - b["x1"]
                thin = a["xh"] < 3.4 or b["xh"] < 3.4  # שבר דק יכול לחפוף אופקית לשורה שלו
                if (-2 <= gap or thin) and gap < 25 and same_row(a, b) and mergeable(a, b, gap):
                    main, other = (a, b) if wd(a) >= wd(b) else (b, a)
                    m = dict(main, x0=min(a["x0"], b["x0"]), x1=max(a["x1"], b["x1"]))
                    # מילה פותחת מוגדלת (גבוהה בבירור מהשורה שלידה) בתוך שורת מפרש
                    if other["xh"] > main["xh"] + 1.2 and wd(other) < 60 and other["top"] < main["top"] - 0.8:
                        m["big"] = (other["x0"], other["x1"])
                    elif a.get("big") or b.get("big"):
                        m["big"] = a.get("big") or b.get("big")
                    L.remove(a); L.remove(b); L.append(m)
                    changed = True
                    break
            if changed:
                break
    classify()
    # שברי דיו שאינם שורה (סימוני הערה, כתמים): צרים ונמוכים מאוד
    L = [l for l in L if wd(l) >= 60 or l["xh"] >= 3.4]
    L.sort(key=lambda l: (l["base"], -l["x1"]))
    # פיסות באותה שורה (קווי בסיס שונים בנקודה-שתיים) — מימין לשמאל, כסדר הקריאה
    rows_, cur = [], []
    for l in L:
        if cur and l["base"] - cur[0]["base"] > 2.0:
            rows_.append(cur); cur = []
        cur.append(l)
    if cur:
        rows_.append(cur)
    L = [l for r in rows_ for l in sorted(r, key=lambda l: -l["x1"])]
    # מילות ה-OCR לשורות (לפי מיקום — הגודל שה-OCR נתן להן לא משנה)
    for l in L:
        l["w"] = []
    hd_ids = {id(w) for w in hd}
    # מילת פתיחת המסכת במסגרת המעוטרת (פי 3–4 מהגופן הרגיל) — לא שייכת לשום שורה; מילה פותחת
    # מוגדלת של רש"י/תוספות (פי 1.5–2) כן שייכת לשורה שלה
    # (גם מעל פי 1.5 מגופן הגמרא: בעמוד שרובו מפרשים, ה-OCR נותן להם גופן קטן והחציון יורד)
    szs = sorted(w["size"] for w in W)
    title_sz = max(2.2 * st.median(szs), 1.5 * szs[int(0.9 * (len(szs) - 1))])
    for w in W:
        if id(w) in hd_ids or w["size"] >= title_sz:
            continue
        cx, cy = (w["x0"] + w["x1"]) / 2, (w["y0"] + w["y1"]) / 2
        c = [l for l in L if l["x0"] - 2 <= cx <= l["x1"] + 2 and l["top"] - 3 <= cy <= l["base"] + 2.5]
        if c:
            min(c, key=lambda l: abs(cy - (l["top"] + l["base"]) / 2))["w"].append(w)
    for l in L:
        l["w"].sort(key=lambda w: -w["x1"])
        # סימן הפניה שנקרא כמילה נפרדת (אות/מספר קטנים בתוך שורת גמרא או מפרש) — לא טקסט
        if len(l["w"]) >= 3:
            med_sz = st.median(w["size"] for w in l["w"])
            l["w"] = [w for w in l["w"] if not (w["size"] < 0.75 * med_sz and len(w["t"]) <= 3)]
        # מילה פותחת מוגדלת בראש שורת מפרש (תחילת מסכת/פרק): ה-OCR נותן לה גופן גדול בבירור מיתר השורה
        if l["c"] == "s" and len(l["w"]) >= 3 and not l.get("big"):
            med_ = st.median(w["size"] for w in l["w"])
            k_ = 0
            while k_ < min(3, len(l["w"]) - 1) and l["w"][k_]["size"] >= 1.45 * med_:
                k_ += 1
            if k_:
                l["big"] = (min(w["x0"] for w in l["w"][:k_]), max(w["x1"] for w in l["w"][:k_]))
        if l.get("big") and l["c"] == "s" and l["big"][1] >= l["x1"] - 3:  # מילה מוגדלת בראש (ימין) שורת מפרש
            l["drop"] = max(1, sum(1 for w in l["w"] if l["big"][0] - 2 <= (w["x0"] + w["x1"]) / 2 <= l["big"][1] + 2))
    # כיול מול מוסכמות ה-OCR (מרכז תיבת מילה לגמרא, תחתית התיבה למפרשים) — כדי שמיקום הגושים לא ישתנה
    full = lambda c: [l for l in L if l["c"] == c and len(l["w"]) >= 3]
    med = lambda v, d: st.median(v) if v else d
    c_g = med([l["base"] - st.median((w["y0"] + w["y1"]) / 2 for w in l["w"]) for l in full("g")], 2.9)
    c_s = med([st.median(w["y1"] for w in l["w"]) - l["base"] for l in full("s")], 1.6)
    c_t = med([l["top"] - min(w["y0"] for w in l["w"]) for l in full("g") + full("s")], 2.5)
    # cy = קו הבסיס האמיתי של השורה (מהפיקסלים). תיבות ה-OCR אינן עקביות בין עמודים (±0.3 נק')
    # שורה "גמרא" (אותיות גדולות) שאינה בעמודת הגמרא — אין לה שכנה מעליה/מתחתיה בגמרא שחופפת אותה
    # אופקית — היא שורת מפרש באותיות גדולות (דיבור המתחיל מודגש ברשימה, "לקמיצה") או כותרת "הדרן עלך"
    heads_ = []
    gl = [l for l in L if l["c"] == "g" and wd(l) >= 40]
    for l in [l for l in L if l["c"] == "g"]:
        nb = [o for o in gl if o is not l and 0 < abs(o["base"] - l["base"]) < 30]
        ov = [o for o in nb if min(o["x1"], l["x1"]) - max(o["x0"], l["x0"]) > 0.5 * min(wd(o), wd(l))]
        txt = " ".join(w["t"] for w in l["w"])
        above = [o for o in ov if 3 < l["base"] - o["base"] < 16]
        # "הדרן עלך" בעמודת מפרש: אין מעליה שורת גמרא (מתחתיה יכולה להתחיל גמרא רחבה);
        # או כותרת ממורכזת בין הזרמים (גם כשה-OCR קרא "הדק עלך")
        centered = abs((l["x0"] + l["x1"]) / 2 - mid) < 0.12 * (fR - fL)
        if hadran_like(txt) and wd(l) < 0.5 * (fR - fL) and ((nb and not above) or (centered and not above)):
            l["c"] = "h"
            heads_.append({"x0": min(w["x0"] for w in l["w"]), "y0": min(w["y0"] for w in l["w"]),
                           "size": st.median(w["size"] for w in l["w"]), "text": txt})
        elif wd(l) < 60 and widened(l):
            pass  # חלק משורת גמרא שמתרחבת לרוחב העמוד (פיסה סמוכה באותה שורה ממש)
        elif (len(nb) >= 2 and not ov) or (wd(l) < 60 and not any(
                min(o["x1"], l["x1"]) - max(o["x0"], l["x0"]) > 0 and 0 < abs(o["base"] - l["base"]) < 40 for o in gl)):
            # וגם מילה-שתיים באותיות גדולות בלי שום שורת גמרא מעליה או מתחתיה (סוף עמודת מפרש)
            l["c"] = "s"
            l.setdefault("big", (l["x0"], l["x1"]))
    if os.environ.get("TOP_DEBUG"):
        for l in L:
            print("PIECE", round(l["x0"], 1), round(l["x1"], 1), round(l["top"], 1), round(l["base"], 1), round(l["xh"], 2), l["c"], " ".join(w["t"] for w in l["w"])[:40])
    catch_ = []  # מילות הקישור מזוהות ב-build_page (שם יש את הטקסט של העמוד הבא)
    grows = [dict(l, cy=l["base"]) for l in L if l["c"] == "g"]
    pcs = []
    for l in L:
        if l["c"] == "s":
            pc = dict(l, cy=l["base"])
            # רוחב מלא — או שורה ממורכזת (סוף דיבור) שחוצה את אמצע העמוד: עמודות צד אינן חוצות אותו
            full_ = wd(pc) > 0.8 * (fR - fL) or (pc["x0"] < mid - 30 and pc["x1"] > mid + 30)
            pc["side"] = "F" if full_ else ("R" if (pc["x0"] + pc["x1"]) / 2 > mid else "L")
            pcs.append(pc)
    fTop = min(l["top"] for l in L) - c_t
    if os.environ.get("FRAME_DEBUG"):
        print(f"image rows: gemara {len(grows)}, commentary {len(pcs)}, xh g/s {cg:.2f}/{cs:.2f}, calib {c_g:.2f} {c_s:.2f} {c_t:.2f}")
    return grows, pcs, fTop, heads_, catch_


# ---------- עמוד ----------
def image_frame(p):
    """קצות המסגרת לפי עמודות לבנות כמעט לגמרי לאורך גוף העמוד: ה"פנימית" ביותר בכל צד שנותנת
    רוחב סביר (55%–80% מרוחב הדף). → (fL, fR) או None."""
    import img_lines as IL
    import numpy as np
    r = p.rect
    ink = IL.ink_mask(p, fitz.Rect(0, r.height * 0.12, r.width, r.height * 0.9))
    Z = IL.Z
    k = int(3 * Z)
    sm = np.convolve(ink.mean(axis=0), np.ones(k) / k, mode="same")
    for thr_ in (0.004, 0.01):
        white = sm < thr_
        runs = []
        for i in np.flatnonzero(white):
            if runs and i == runs[-1][1] + 1:
                runs[-1][1] = i
            else:
                runs.append([i, i])
        runs = [(a / Z, b / Z) for a, b in runs if (b - a) / Z >= 3]
        Ls = [b for a, b in runs if 0.05 * r.width < b < 0.35 * r.width]
        Rs = [a for a, b in runs if 0.65 * r.width < a < 0.95 * r.width]
        pairs = [(R_ - L_, L_, R_) for L_ in Ls for R_ in Rs if 0.55 * r.width <= R_ - L_ <= 0.8 * r.width]
        if pairs:
            _, L_, R_ = min(pairs)
            return L_, R_
    return None


def frame_of(p, W):
    """מסגרת הטקסט (קצה שמאל/ימין) לפי יישור קצוות השורות. → (fL, fR, ציון, G, side, gem, head)"""
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
            if a_["x0"] - b_["x1"] >= 6.5:  # מרווח בין עמודת שוליים למסגרת יכול להיות ~8 נק'
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
        if xs0 and xs1:
            fL, fR = xs0[int(0.02 * len(xs0))], xs1[int(0.98 * len(xs1)) - 1]
        else:  # ה-OCR לא נתן גדלים שמזהים מפרשים (ברכות כד.) — ציון 0, והמסגרת תימדד מהתמונה
            fL, fR = 0.17 * PW, 0.83 * PW
    return fL, fR, (best_[0] if best_ else 0), G, side, gem, head


OVERRIDES_DIR = os.environ.get("OVERRIDES_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "overrides")
_ovr_cache = {}


def overrides_for(tractate, key):
    """תיקונים ידניים קבועים (overrides/<Tractate>.json) — נשמרים בכל בנייה מחדש.
    מבנה: {"2a": [{"s": "gemara", "k": 12, "end": "שמע"}, {"s": "rashi", "k": 3, "start": "פירוש"},
                  {"s": "rashi", "k": 9, "drop": "גמ'"}]}   (drop = מילה במקור שאינה בדפוס)
    k = מספר השורה בזרם (מ-0, בסדר הקריאה, כמו בכלי הסקירה); end/start = המילה שבה השורה
    צריכה להסתיים/להתחיל בדפוס. הגבול זז רק עד 8 מילים, ורק אם המילה נמצאת שם."""
    if tractate not in _ovr_cache:
        p = os.path.join(OVERRIDES_DIR, f"{tractate}.json")
        _ovr_cache[tractate] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
    return _ovr_cache[tractate].get(key, [])


def apply_overrides(lines, stream, ovr, applied):
    """lines = [[tokens]] של זרם אחד; מזיז גבולות שורות לפי התיקונים. מחזיר רשימה חדשה."""
    mine = [o for o in ovr if o.get("s") == stream]
    if not mine:
        return lines
    toks = [t for ln in lines for t in ln]
    cum = [0]
    for ln in lines:
        cum.append(cum[-1] + len(ln))
    plain = lambda t: fold(norm_token(re.sub(r"<[^>]+>", "", t.lstrip(DH))))
    # מילה שאינה בדפוס (למשל "גמ'" שנוסף במקור): מוסרים את המופע הקרוב בשורה k (או בשכנותיה)
    for o in mine:
        k, w_ = o.get("k"), o.get("drop")
        if not w_ or not isinstance(k, int) or not 0 <= k < len(lines):
            continue
        target = plain(w_)
        for kk in (k, k - 1, k + 1):
            if 0 <= kk < len(lines):
                i = next((i for i in range(cum[kk], cum[kk + 1]) if plain(toks[i]) == target), None)
                if i is not None:
                    del toks[i]
                    for j in range(kk + 1, len(cum)):
                        cum[j] -= 1
                    applied.append(dict(o, stream=stream))
                    break
    for o in mine:
        k = o.get("k")
        if not isinstance(k, int) or not 0 <= k < len(lines) or o.get("drop"):
            continue
        word = o.get("end") or o.get("start")
        if not word:
            continue
        b = k + 1 if o.get("end") else k  # הגבול שזז: אחרי השורה (end) או לפניה (start)
        if b <= 0 or b >= len(lines):
            continue
        target = plain(word)
        cands = [i for i in range(max(0, cum[b] - 8), min(len(toks), cum[b] + 8)) if plain(toks[i]) == target]
        if not cands:
            continue
        i = min(cands, key=lambda i: abs((i + 1 if o.get("end") else i) - cum[b]))
        nb = i + 1 if o.get("end") else i
        if cum[b - 1] < nb <= cum[b + 1]:  # השורה שלפני הגבול לא מתרוקנת; השורה שאחריו מותר (פיסה בלי מילים בדפוס)
            cum[b] = nb
            applied.append(dict(o, stream=stream))
    return [toks[cum[i]:cum[i + 1]] for i in range(len(lines))]


FRAME_W = 411.0  # רוחב מסגרת וילנא הטיפוסי בסריקות (נק'); הספים בקוד מכוילים אליו
_scaled_docs = []


def scaled_page(p, k):
    """עותק של העמוד בקנה מידה k (תמונה ושכבת טקסט יחד) — לעמודים שנסרקו מחדש בגודל אחר."""
    nd = fitz.open()
    sp = nd.new_page(width=p.rect.width * k, height=p.rect.height * k)
    sp.show_pdf_page(sp.rect, p.parent, p.number)
    _scaled_docs.append(nd)  # שהמסמך לא ייאסף
    return sp


def build_page(p, key, refs, _scaled=False, tractate=None):
    W = [w for w in page_words(p) if HEB.search(w["t"])]
    # גדלי הגופן משתנים מעמוד לעמוד ובין מקורות ה-OCR (HebrewBooks: גמרא 9.5/11, מפרשים 6.5–7.5,
    # שוליים 5–6.5; ABBYY של אוצריא: גמרא 8.5–10, מפרשים 6.5–8, שוליים 4.5–5.5), ולפעמים רש"י ותוספות
    # באותו עמוד בשני גדלים. לכן: הגמרא = הגודל הגדול הנפוץ; המפרשים = כל מה שקטן ממנה (ולא זעיר) —
    # ובתוך המסגרת, שנמצאת גיאומטרית (ראו למטה) ולא לפי גודל.
    fL, fR, score_, G, side, gem, head = frame_of(p, W)
    small_ = lambda w: 0.55 * G <= w["size"] < G - 0.6
    gem_ = lambda w: G - 0.6 <= w["size"] < G + 0.8
    bigcap = lambda w: G + 0.8 <= w["size"] < 14
    # ציון נמוך (עמוד שרובו גמרא ומעט שורות מפרש מיושרות): המסגרת מהתמונה — הרצועות הלבנות הארוכות
    # שבין עמודות השוליים לטקסט. (לא מעמודים סמוכים: עמודים שנסרקו מחדש בקנה מידה אחר)
    # (מסגרת ה-OCR ברוחב הטיפוסי — נשארת גם בציון נמוך: הרצועות הלבנות בתמונה לא תמיד חד-משמעיות)
    if score_ < 25 and abs((fR - fL) / FRAME_W - 1) > 0.03:
        fi = image_frame(p)
        if fi:
            fL, fR = fi
        elif os.environ.get("FRAME_DEBUG"):
            print(key, "frame: low score and no image gutters")
    # עמוד בקנה מידה אחר (סריקה חלופית): בונים מעותק מוקטן/מוגדל לרוחב הטיפוסי
    if not _scaled and abs((fR - fL) / FRAME_W - 1) > 0.05:
        k_ = FRAME_W / (fR - fL)
        if os.environ.get("FRAME_DEBUG"):
            print(key, f"rescaled page x{k_:.3f}")
        lay_, rep_ = build_page(scaled_page(p, k_), key, refs, _scaled=True, tractate=tractate)
        rep_["k"] = k_
        return lay_, rep_
    if os.environ.get("FRAME_DEBUG"):
        print(key, "frame", fL, fR, "score", score_)
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
    # מקור הגיאומטריה: התמונה עצמה (ברירת מחדל) או שורות ה-OCR (GEOM=ocr, וגם כגיבוי אם התמונה נכשלת)
    use_img = os.environ.get("GEOM", "image") == "image"
    side_heads, catches = [], []
    if use_img:
        try:
            grows, pcs, fTop, side_heads, catches = image_rows(p, W, fL, fR, head)
            # מילת הקישור לעמוד הבא: פיסה קצרה (מילה-שתיים) בחלק התחתון של העמוד, שהטקסט שלה הוא
            # המילה הראשונה של העמוד הבא באחד הזרמים. מוצאים אותה מהזרמים ומציגים בנפרד
            nxt_word = {}
            for st_ in ("gemara", "rashi", "tosafot"):
                ref_, hi_ = refs[st_][0], refs[st_][2]
                nw = [t.lstrip(DH) for t in ref_[hi_: hi_ + 3] if not re.match(r"^(מתני|גמ)[׳']?\.?$", t.lstrip(DH))]
                if nw:
                    nxt_word[st_] = nw[0]
            page_h = p.rect.height
            for coll, kinds in ((grows, ("gemara",)), (pcs, ("rashi", "tosafot"))):
                for r in list(coll):
                    if all(k in {c_["stream"] for c_ in catches} for k in kinds):
                        break
                    if r["x1"] - r["x0"] > 60 or not r["w"] or len(r["w"]) > 2 or r["base"] < fTop + 0.55 * (page_h - fTop):
                        continue
                    o_ = fold(norm_token(r["w"][0]["t"]))
                    have_ = {c_["stream"] for c_ in catches}
                    best_ = max(((fuzz.ratio(o_, fold(norm_token(nxt_word[k]))), k) for k in kinds if k in nxt_word and k not in have_), default=(0, None))
                    if best_[0] >= 60:
                        coll.remove(r)
                        catches.append({"x0": r["x0"], "base": r["base"], "stream": best_[1], "text": nxt_word[best_[1]]})
        except Exception as e:
            print(key, "image geometry failed, using OCR rows:", repr(e), flush=True)
            use_img = False
    if not use_img:
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
    if not use_img:
        grows = rows_of(gem)
    pitch = st.median(b["cy"] - a["cy"] for a, b in zip(grows, grows[1:]) if 8 < b["cy"] - a["cy"] < 16)
    # מילת-קישור בתחתית (המילה הראשונה של העמוד הבא) — לא צמודה לשמאל הגוש
    if len(grows) > 2 and grows[-1]["x1"] - grows[-1]["x0"] < 60 and (use_img or len(grows[-1]["w"]) <= 2) and abs(grows[-1]["x0"] - grows[-2]["x0"]) > 6 and grows[-1]["x1"] < grows[-2]["x1"] - 20:
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
    srows = [] if use_img else rows_of(side, tol=3.0, base=True)
    mid = (fL + fR) / 2
    gspan = []  # טווחי הגמרא: (y עליון, y תחתון, x0, x1)
    for b_ in blocks:
        rws = b_["rows"]
        gx0 = st.median(r["x0"] for r in rws[:-1]) if len(rws) > 1 else rws[0]["x0"]
        gspan.append((rws[0]["cy"] - pitch / 2, rws[-1]["cy"] + pitch / 2, gx0, st.median(r["x1"] for r in rws)))
    mk = lambda ws_, cy: {"cy": cy, "w": ws_, "x0": min(w["x0"] for w in ws_), "x1": max(w["x1"] for w in ws_)}
    if not use_img:
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
    if use_img:
        # גיבוי מתוך מילות ה-OCR: לפעמים שורת ההערות שבתחתית ("תורה אור") צמודה למילת הקישור,
        # ובתמונה שתיהן התמזגו לשורה דקה אחת שנפסלה. מחפשים מילה שאינה בשום שורה, מיד מתחת
        # לשורה האחרונה של עמודה, שהטקסט שלה הוא המילה הראשונה של העמוד הבא באותו זרם
        # (כאן, אחרי שיוך המפרשים — הזרם נקבע לפי השורה שמעליה, גם כששלושת הזרמים מתחילים באותה מילה)
        have = {c_["stream"] for c_ in catches}
        assigned = {id(w) for r in grows + pcs for w in r["w"]}
        side_sz = st.median([w["size"] for r in pcs for w in r["w"]] or [7.5])
        page_h = p.rect.height
        for w in sorted(W, key=lambda w: -w["y1"]):
            if id(w) in assigned or len(w["t"]) < 2 or w["size"] < 0.8 * side_sz or w["y1"] < fTop + 0.55 * (page_h - fTop):
                continue
            o_ = fold(norm_token(w["t"]))
            cands = [k for k in nxt_word if k not in have and fuzz.ratio(o_, fold(norm_token(nxt_word[k]))) >= 70]
            if not cands:
                continue
            cx = (w["x0"] + w["x1"]) / 2
            col = [r for r in grows + pcs if r["x0"] - 12 <= cx <= r["x1"] + 3]
            above = [r for r in col if 0 < w["y1"] - r["base"] < 25]
            if not above or any(r["base"] > w["y1"] + 2 for r in col):
                continue  # צריכה להיות מתחת לשורה האחרונה של העמודה
            a_ = max(above, key=lambda r: r["base"])
            st_ = "gemara" if any(a_ is g for g in grows) else a_.get("s")
            if st_ in cands:
                catches.append({"x0": w["x0"], "base": w["y1"] - 0.18 * w["size"], "stream": st_, "text": nxt_word[st_]})
                have.add(st_)
    gbottom = max((g[1] for g in gspan), default=0)

    slabs, report = [], {}
    # גמרא: עיגון
    glines = [r["w"] for b in blocks for r in b["rows"]]
    gtext, gcov, grange = anchor(glines, refs["gemara"][0], refs["gemara"][1:3], [(r["x0"], r["x1"]) for b in blocks for r in b["rows"]])
    # תיקון שבירות לפי רוחב המילים בדפוס (fit_width.py). כבוי כברירת מחדל: נבדק על 10 עמודי מגילה
    # (2026-10-03) — בלי הגבלה שבר 33 שורות ותיקן 2; רק בגבולות שה-OCR לא הכריע: תיקן 4, שבר 5.
    # הפעלה לניסויים: FIT=1
    fit_on = use_img and os.environ.get("FIT", "0") == "1"
    if fit_on:
        import fit_width as FW, img_lines as IL
        fclip = fitz.Rect(fL - 4, fTop - 4, fR + 4, p.rect.height - 5)
        fink = IL.ink_mask(p, fclip)
        g_rows = [r for b in blocks for r in b["rows"]]
        gtext, moved = FW.refit(gtext, FW.ink_widths(fink, IL.Z, g_rows, fclip.x0, fclip.y0), lambda t: "vilna",
                                free=free_bounds(gtext))
        report["fit"] = {"gemara": moved}
    ovr = overrides_for(tractate, key) if tractate else []
    if ovr:
        gtext = apply_overrides(gtext, "gemara", ovr, report.setdefault("overrides", []))
    report["gemara"] = {"lines": len(glines), "cover": round(gcov, 3)}
    # מצב סקירה (review.py): כל שורה — מיקומה בסריקה, מה ה-OCR קרא בדפוס, ומה הצבנו אצלנו
    review = report.setdefault("_lines", []) if os.environ.get("REVIEW") else None
    edge = lambda r: (r.get("top", r["cy"] - 7), r.get("base", r["cy"] + 2))
    if review is not None:
        for k_, (r, t) in enumerate(zip((r for b in blocks for r in b["rows"]), gtext)):
            review.append({"s": "gemara", "k": k_, "x0": r["x0"], "x1": r["x1"], "top": edge(r)[0], "base": edge(r)[1],
                           "print": " ".join(w["t"] for w in r["w"]), "ours": " ".join(t)})
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
        # מיקום קו הבסיס בתוך תיבת השורה (יחסית לגובה השורה): נמדד מול הסריקה (qa_scan)
        # פסיעת השורה של הגוש עצמו — בלי סחף מצטבר לאורך עשרות שורות
        cy0, pitch_b = fit_rows([r["cy"] for r in rows], pitch)
        lh_b = pitch_b * s
        top = Y(cy0) - (BASE_G * lh if use_img else lh / 2)
        slabs.append({"s": "gemara", "l": round(L_, 2), "t": round(top, 2), "w": round(Rr - L_, 2), "h": round(len(rows) * lh_b, 2),
                      "fs": round(G_FS * lh / G_LH, 2), "lh": round(lh_b, 3), "lines": lines})
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
            big = not use_img and all(bigcap(w) for w in pc["w"]) and len(pc["w"]) <= 2
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
            if len(cand) > 2 and len(cand[-1]["w"]) <= 1 and cand[-1]["x1"] - cand[-1]["x0"] < 40 and cand[-1]["x1"] < cand[-2]["x1"] - 8:
                cand = cand[:-1]
            ref_, lo_, hi_ = refs[st_][0], refs[st_][1], refs[st_][2]
            if len(refs[st_]) > 3:
                ref_ = print_order([pc["w"] for pc in cand], ref_, lo_, hi_, refs[st_][3])
            res = anchor([pc["w"] for pc in cand], ref_, (lo_, hi_), [(pc["x0"], pc["x1"]) for pc in cand])
            if best is None or res[1] > best[1][1] + 0.01:
                best = (cand, res, dict(ANCHOR_INFO))
        ps, (stext, scov, _), info_ = best
        ANCHOR_INFO.clear(); ANCHOR_INFO.update(info_)
        if fit_on:
            locked = [i for i, pc in enumerate(ps) if pc.get("drop") or pc.get("big")]
            stext, moved = FW.refit(stext, FW.ink_widths(fink, IL.Z, ps, fclip.x0, fclip.y0),
                                    lambda t: "vilna" if t.startswith(DH) else "rashi", locked, free=free_bounds(stext))
            report["fit"][st_] = moved
        if ovr:
            stext = apply_overrides(stext, st_, ovr, report.setdefault("overrides", []))
        report[st_] = {"lines": len(ps), "cover": round(scov, 3)}
        if review is not None:
            for k_, (pc, t) in enumerate(zip(ps, stext)):
                review.append({"s": st_, "k": k_, "x0": pc["x0"], "x1": pc["x1"], "top": edge(pc)[0], "base": edge(pc)[1],
                               "print": " ".join(w["t"] for w in pc["w"]), "ours": " ".join(x.lstrip(DH) for x in t)})
        groups = []
        for i, (pc, t) in enumerate(zip(ps, stext)):
            g = groups[-1] if groups else None
            nxt = ps[i + 1] if i + 1 < len(ps) else None
            # שורה קצרה (סוף זרם/פיסקה) מצטרפת לגוש אם מתחילה באותו קו ימני
            short_ok = nxt is None or abs(nxt["x1"] - pc["x1"]) > 8
            # שורה מוזחת מימין (ליד אות פותחת מוגדלת) — אותו קצה שמאלי, הזחה קטנה
            indented = g is not None and abs(pc["x0"] - g["x0"]) < 6 and 0 < g["x1"] - pc["x1"] < 40
            # (שורה קצרה — לא שורה *רחבה* מהגוש: שורה ברוחב מלא מתחת לעמודה צרה פותחת גוש חדש)
            wider = pc["x0"] < g["x0"] - 8 if g else False
            if g and not wider and (abs(pc["x1"] - g["x1"]) < 8 or indented) and (abs(pc["x0"] - g["x0"]) < 8 or short_ok) and 0 < pc["cy"] - g["ps"][-1]["cy"] < 2.2 * spitch:
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
            cy0, pitch_b = fit_rows([pc["cy"] for pc in ps_], spitch)
            top = Y(cy0) - (BASE_S if use_img else 0.78) * slh
            lines = []
            prev_t = None
            for pc, t in zip(ps_, g["t"]):
                ind = max(0.0, (x1 - pc["x1"]) * s) if x1 - pc["x1"] > 3 else 0.0
                full = (pc["x1"] - pc["x0"]) >= (x1 - x0) - 8 - ind / s
                ln = {"t": line_html(t, pc.get("drop", 0), prev_t), "ws": None, "w": round(Rr - L_ - ind, 2) if full else None}
                if ind:
                    ln["i"] = round(ind, 2)
                lines.append(ln)
                if t:
                    prev_t = t[-1]
            slh_b = pitch_b * s
            slabs.append({"s": st_, "l": round(L_, 2), "t": round(top, 2), "w": round(Rr - L_, 2), "h": round(len(ps_) * slh_b, 2),
                          "fs": round(S_FS * slh / S_LH, 2), "lh": round(slh_b, 3), "lines": lines})
    # כותרת
    header = []
    head = running_header(head, fL, fR, p)
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
    report["geom"] = "image" if use_img else "ocr"
    report["rashi_side"] = rashi_side
    report["frame"] = [round(fL, 1), round(fR, 1), round(fTop, 1)]
    report["blocks"] = [f'{sl["s"]} {round(sl["w"])}×{len(sl.get("lines") or []) or round(sl["h"] / sl["lh"])}' for sl in slabs]
    # src: מסגרת הטקסט בסריקה (שמאל, ימין, ראש — בנקודות PDF) — למיפוי חזרה אל הצילום (בדיקת איכות)
    # שורות ריקות בקצה גוש (שורה שזוהתה בתמונה ואין לה מילים — מסגרת עיטור, כתם) — מסירים
    empty = lambda ln: not re.sub(r"<[^>]+>|\s", "", ln["t"])
    for sl in slabs:
        while sl["lines"] and empty(sl["lines"][0]):
            sl["lines"].pop(0); sl["t"] = round(sl["t"] + sl["lh"], 2); sl["h"] = round(sl["h"] - sl["lh"], 2)
        while sl["lines"] and empty(sl["lines"][-1]):
            sl["lines"].pop(); sl["h"] = round(sl["h"] - sl["lh"], 2)
    slabs = [sl for sl in slabs if sl["lines"]]
    # דף הפתיחה של מסכת: המילה הראשונה של המשנה מודפסת במסגרת מעוטרת שה-OCR לא קורא.
    # המילה (אחרי "מתני׳") נלקחת מהטקסט, והמסגרת — בין ראשי המפרשים לשורת הגמרא הראשונה
    box = None
    if refs["gemara"][1] == 0:
        gref = [t for t in refs["gemara"][0] if not re.match(r"^מתני[׳']?$", t)]
        gs = sorted((sl for sl in slabs if sl["s"] == "gemara"), key=lambda sl: sl["t"])
        if gref and gs:
            g0 = gs[0]
            first_shown = re.sub(r"<[^>]+>", "", g0["lines"][0]["t"]).split()[:1]
            # המילה עצמה נכנסה לשורה הראשונה (כשה-OCR קרא סימן קטן לפני המילה הבאה, למשל בבבא קמא ב.)
            # — המסגרת עדיין נמדדת, והמילה מוסרת מהשורה כי היא מוצגת במסגרת
            dup = bool(first_shown) and fold(norm_token(first_shown[0])) == fold(norm_token(gref[0]))
            if first_shown:
                # המסגרת נמדדת מהתמונה: הדיו בעמודת הגמרא, בין ראשי המפרשים (הרחבים) לשורת הגמרא הראשונה
                import img_lines as IL
                heads = [sl for sl in slabs if sl["s"] != "gemara" and sl["w"] >= 0.4 * V_W and sl["t"] + sl["h"] <= g0["t"] + 2]
                top_u = max((sl["t"] + sl["h"] for sl in heads), default=V_TOP)
                ux = lambda u: fL + (u - V_L) / s
                uy = lambda u: fTop + (u - V_TOP) / s
                clip = fitz.Rect(ux(g0["l"]) - 2, uy(top_u) + 1, ux(g0["l"] + g0["w"]) + 2, uy(g0["t"]) - 0.5)
                if clip.height > 12:
                    ink = IL.ink_mask(p, clip)
                    # המסגרת = רצועת השורות הרציפה הגבוהה ביותר (רווחים של עד 2 נק' בתוכה) — בלי
                    # ראשי האותיות של שורת הגמרא שמתחתיה (קידושין ב.: המסגרת "ירדה" 13 נק' עד הטקסט)
                    rr = ink.any(axis=1).nonzero()[0]
                    runs_ = []
                    for r_ in rr:
                        if runs_ and r_ - runs_[-1][1] <= 3 * IL.Z:
                            runs_[-1][1] = r_
                        else:
                            runs_.append([r_, r_])
                    if runs_:
                        a_, b_ = max(runs_, key=lambda ab: ab[1] - ab[0])
                        ink = ink.copy(); ink[:a_] = False; ink[b_ + 1:] = False
                    rows_, cols_ = ink.any(axis=1).nonzero()[0], ink.any(axis=0).nonzero()[0]
                    if len(rows_) and len(cols_):
                        bx0, bx1 = clip.x0 + cols_[0] / IL.Z, clip.x0 + (cols_[-1] + 1) / IL.Z
                        by0, by1 = clip.y0 + rows_[0] / IL.Z, clip.y0 + (rows_[-1] + 1) / IL.Z
                        if by1 - by0 > 12 and bx1 - bx0 > 40:
                            box = {"l": round(X(bx0), 2), "t": round(Y(by0), 2), "w": round((bx1 - bx0) * s, 2),
                                   "h": round((by1 - by0) * s, 2), "text": gref[0]}
                            if dup:
                                g0["lines"][0]["t"] = g0["lines"][0]["t"].split(" ", 1)[1] if " " in g0["lines"][0]["t"] else ""
    # מילות הקישור (זוהו למעלה): בגופן ובגודל של הזרם שלהן
    catch_out = [{"s": c_["stream"], "l": round(X(c_["x0"]), 2), "base": round(Y(c_["base"]), 2),
                  "fs": round(G_FS * lh / G_LH if c_["stream"] == "gemara" else S_FS * slh / S_LH, 2),
                  "text": re.sub(r"<[^>]+>", "", c_["text"])} for c_ in catches]
    # כותרות "הדרן עלך" שבעמודות המפרשים (מודפסות שם, לא חלק מטקסט רש"י/תוספות)
    for hd_ in (side_heads if use_img else []):
        header.append({"l": round(X(hd_["x0"]), 2), "t": round(Y(hd_["y0"]), 2), "fs": round(hd_["size"] * s, 2),
                       "text": hadran_text(hd_["text"], refs)})
    lay_box = {"box": box} if box else {}
    if catch_out:
        lay_box["catch"] = catch_out
    lay = {"page": {"w": PAGE_W, "h": round(Y(p.rect.height), 2)}, "slabs": slabs, "header": header, **lay_box,
           "src": [round(fL, 1), round(fR, 1), round(fTop, 1)]}
    return lay, report


# דיוק לפי שדה: פסיעת שורה וגודל גופן מוכפלים בעשרות שורות — עיגול לעשירית צובר סחף של כמה נקודות
PRECISION = {"ws": 2, "lh": 3, "fs": 2}

def compact(o, key=None):
    """מספרים בדיוק עשירית יחידה (≈עשירית פיקסל), חוץ מהשדות שב-PRECISION."""
    if isinstance(o, dict):
        return {k: compact(v, k) for k, v in o.items()}
    if isinstance(o, list):
        return [compact(v, key) for v in o]
    if isinstance(o, float):
        r = round(o, PRECISION.get(key, 1))
        return int(r) if r == int(r) else r
    return o


def _drop_last_words(html, n):
    """מוריד n מילים מסוף שורת HTML (עם התגיות שלהן) וסוגר תגיות שנשארו פתוחות."""
    parts = html.split(" ")
    while n > 0 and parts:
        last = parts.pop()
        if HEB.search(re.sub(r"<[^>]+>", "", last)):
            n -= 1
    out = " ".join(parts)
    for tag in ("i", "big", "b"):
        opened = len(re.findall(f"<{tag}>", out)) - len(re.findall(f"</{tag}>", out))
        out += f"</{tag}>" * max(0, opened)
    return re.sub(r"<(b|i|big)></>", "", out).strip()


def dedupe_boundaries(lays, keys, report=None, ref_of=None):
    """גבול בין עמודים: אם סוף זרם בעמוד א חוזר בדיוק על תחילת אותו זרם בעמוד ב (המילים
    "נדחסו" לשורה האחרונה של א), מורידים אותן מ-א. תחילת ב מעוגנת בשורה הראשונה שלו, ולכן אמינה.
    מחזיר כמה מילים הורדו."""
    def words(lay, s):
        return [(i, j, t) for i, sl in enumerate(lay["slabs"]) if sl.get("s") == s
                for j, ln in enumerate(sl.get("lines", [])) for t in re.sub(r"<[^>]+>", " ", ln.get("t", "")).split() if HEB.search(t)]
    nrm = lambda t: fold(norm_token(re.sub(r"[\"'״׳.,:;()\[\]]", "", t)))
    total = 0
    # רק עמודים מהצינור הנוכחי (יש להם "src"); בפריסות ישנות המילה האחרונה היא מילת הקישור — נשארת
    ks = [k for k in keys if k in lays and lays[k].get("slabs") and lays[k].get("src")]
    for a, b in zip(ks, ks[1:]):
        if keys.index(b) != keys.index(a) + 1:
            continue
        for s in ("gemara", "rashi", "tosafot"):
            A, B = words(lays[a], s), words(lays[b], s)
            An, Bn = [nrm(t) for _, _, t in A], [nrm(t) for _, _, t in B]
            n = next((n for n in range(min(len(An), len(Bn), 80), 0, -1) if An[-n:] == Bn[:n]), 0)
            if n == 1 and len(An[-1]) < 3:  # מילה קצרה אחת ("לא", "על") יכולה לחזור באמת
                n = 0
            if n and ref_of is not None:
                # הביטוי חוזר פעמיים ברצף גם במקור (סוף עמוד א + תחילת ב) — זו לא כפילות שלנו
                # (מוסרים רק עודף: כשמוצג יותר פעמים ממה שיש במקור באותו קטע)
                cnt = lambda seq, ph: sum(1 for i in range(len(seq) - len(ph) + 1) if seq[i:i + len(ph)] == ph)
                ph = An[-n:]
                if cnt(An[-80:] + Bn[:80], ph) <= cnt(ref_of(a, s)[-80:] + ref_of(b, s)[:80], ph):
                    n = 0
            if not n:
                continue
            # מורידים מהשורות האחרונות של א, שורה אחר שורה
            per_line = {}
            for i, j, _ in A[-n:]:
                per_line[(i, j)] = per_line.get((i, j), 0) + 1
            for (i, j), c in per_line.items():
                ln = lays[a]["slabs"][i]["lines"][j]
                ln["t"] = _drop_last_words(ln["t"], c)
            total += n
            if report is not None:
                report.append({"amud": a, "stream": s, "removed": n})
    return total


def ref_lookup(shas, ws, keys, tractate):
    """לדה-דופליקציה: מילות המקור המנורמלות של כל עמוד לפי זרם (רק העמוד עצמו)."""
    nrm = lambda t: fold(norm_token(re.sub(r"[\"'״׳.,:;()\[\]]", "", t.lstrip(DH))))
    cache = {}

    def ref_of(k, s):
        if k not in cache:
            r = make_refs(shas, ws, keys, k, tractate)
            cache[k] = {st_: [nrm(t) for t in v[0][v[1]:v[2]] if nrm(t)] for st_, v in r.items()}
        return cache[k][s]
    return ref_of


def write_layouts(path, layouts):
    data = json.dumps(compact(layouts), ensure_ascii=False, separators=(",", ":")).encode()
    open(path, "wb").write(gzip.compress(data, 9))


def main(pdf, tractate, first_page, only=None):
    shas = load(f"{ROOT}/shas/{tractate}.json.gz")
    ws = load_ws(tractate)
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
        refs = make_refs(shas, ws, keys, key, tractate)
        try:
            lay, rep = build_page(doc[pg], key, refs, tractate=tractate)
        except Exception as e:  # עמוד חריג לא עוצר את המסכת — מדווחים וממשיכים
            print(key, "pdf p", pg + 1, "FAILED", repr(e), flush=True)
            continue
        out[key] = lay
        rep.pop("_lines", None)
        print(key, "pdf p", pg + 1, json.dumps(rep, ensure_ascii=False), flush=True)
    out = {k: out[k] for k in keys if k in out}  # סדר העמודים במסכת
    print("boundary duplicates removed:", dedupe_boundaries(out, keys, ref_of=ref_lookup(shas, ws, keys, tractate)), "words")
    write_layouts(out_path, out)
    record_source(tractate, pdf, len(doc))
    print("→", out_path, len(out), "amudim")


def tractate_of(pdf):
    """מסכת לפי שם הקובץ העברי (למשל "מגילה.pdf", "שס נהרדעא - בבא מציעא.pdf")."""
    idx = json.load(open(f"{ROOT}/shas/index.json", encoding="utf-8"))["masechtot"]
    name = re.sub(r"[\s_\-]+", " ", os.path.splitext(os.path.basename(pdf))[0])
    hits = [m for m in idx if m["he"] in name or m["slug"].lower() in name.lower()]
    return max(hits, key=lambda m: len(m["he"]))["slug"] if hits else None


def first_page_of(doc, slug):
    """עמוד ה-PDF של דף ב. — בכרך יש לפעמים שער/הקדמה. משווים זוג עמודים רצופים לטקסט ב. ו-ב:
    (כל המילים, בלי סינון לפי גודל: ה-OCR נותן לגמרא גדלים שונים בעמודים שונים)."""
    shas = load(f"{ROOT}/shas/{slug}.json.gz")
    k0, k1 = list(shas)[:2]
    ref = lambda k: " ".join(fold(norm_token(t)) for t in gem_tokens(shas[k]["gemara"]))
    r0, r1 = ref(k0), ref(k1)
    n = min(26, len(doc))
    txt = [" ".join(fold(norm_token(w["t"])) for w in page_words(doc[i]) if HEB.search(w["t"])) for i in range(n)]
    sc = lambda r, t: (fuzz.partial_ratio(r[:150], t) + fuzz.partial_ratio(r[-150:], t)) / 2 if t else 0
    best = max(range(n - 1), key=lambda i: (sc(r0, txt[i]) + sc(r1, txt[i + 1]), -i))
    return best + 1


def record_source(tractate, pdf, pages):
    """מאיזו סריקה נבנתה כל מסכת: שם הקובץ, SHA-256 ומספר עמודים (tzurat/print/sources.json)."""
    import hashlib, datetime
    h = hashlib.sha256()
    with open(pdf, "rb") as f_:
        for chunk in iter(lambda: f_.read(1 << 20), b""):
            h.update(chunk)
    path = f"{ROOT}/tzurat/print/sources.json"
    src = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    src[tractate.lower()] = {"file": os.path.basename(pdf), "sha256": h.hexdigest(), "pages": pages,
                             "built": datetime.date.today().isoformat()}
    json.dump(src, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)


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
