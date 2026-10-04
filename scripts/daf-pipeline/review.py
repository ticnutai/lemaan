# -*- coding: utf-8 -*-
"""
הכנת סקירה חזותית: הסריקה מול הדף שלנו, עמוד אחר עמוד.

לכל עמוד נוצרים (בתיקיית הסקירה, מחוץ לאפליקציה):
  <amud>-scan.png   — אזור הטקסט בסריקה (כולל הכותרת)
  <amud>-ours.png   — אותו אזור בדף שלנו (צילום מהאפליקציה), באותו גודל בדיוק
  <amud>-diff.png   — שכבות: שחור = באותו מקום, אדום = רק בדפוס, כחול = רק אצלנו
ונתונים ב-data.json: מידות (רוחב/גובה), התחלה וסוף של כל זרם (גמרא/רש"י/תוספות),
ושורה-שורה: מה הדפוס אומר מול מה אצלנו, עם סימון שורות שההתחלה או הסוף שלהן שונים.

שימוש:
  python review.py <pdf> <Tractate> <amudim 2a,2b,...> [outDir]
(דורש שרת פיתוח על 5173 לצילום הדף שלנו). אחר כך: python review_server.py
"""
import sys, os, json, gzip, re, subprocess
import fitz, numpy as np
from PIL import Image
from rapidfuzz import fuzz

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ["REVIEW"] = "1"
import hb_pdf as H

V_L, V_W, V_TOP = H.V_L, H.V_W, H.V_TOP
Z = 3          # פיקסלים לנקודה בתמונות הסקירה (≈216dpi)
PAD, HEAD = 4, 26  # שוליים סביב המסגרת; מקום לכותרת מעליה
DEFAULT_OUT = os.path.join(os.path.expanduser("~"), "lemaan-data", "review")

f = lambda t: H.fold(H.norm_token(re.sub(r"<[^>]+>", "", t).lstrip(H.DH)))


def same(a, b):
    return bool(a and b) and (fuzz.ratio(a, b) >= 70)


def line_check(ln):
    """התחלה/סוף השורה שלנו מול הדפוס. readable=False כשה-OCR של השורה לא קריא (אין למה להשוות)."""
    # אות בודדת בקצה שורת הדפוס (סימני מסורת הש"ס / הגהות, "נ", "ג", "ט׳") — ה-OCR קורא אותה כמילה; לא טקסט
    # (אבל "ר׳"/"ה׳" שגם אצלנו בקצה השורה — זה טקסט אמיתי, נשאר)
    raw = ln["print"].split()
    t = [x for x in (f(x) for x in ln["ours"].split()) if x]
    marker = lambda x: bool(re.fullmatch(r"[\(\[]?[א-ת][׳'״\"]?[\)\]]?", x))
    while raw and marker(raw[0]) and not (t and same(f(raw[0]), t[0])):
        raw = raw[1:]
    while raw and marker(raw[-1]) and not (t and same(f(raw[-1]), t[-1])):
        raw = raw[:-1]
    o = [x for x in (f(x) for x in raw) if x]
    hit = sum(1 for x in o if any(fuzz.ratio(x, y) >= 75 for y in t))
    readable = len(o) >= 3 and hit >= 0.6 * len(o)
    # מילה שבורה אחת של OCR בקצה (2 אותיות או פחות) לא נחשבת הבדל — אבל מילה עודפת אצלנו כן
    start = bool(o and t) and (same(o[0], t[0]) or same(" ".join(o[:2]), " ".join(t[:2])) or (len(o[0]) <= 2 and len(o) > 1 and same(o[1], t[0])))
    end = bool(o and t) and (same(o[-1], t[-1]) or same(" ".join(o[-2:]), " ".join(t[-2:])) or (len(o[-1]) <= 2 and len(o) > 1 and same(o[-2], t[-1])))
    return {"readable": readable, "start_ok": bool(start), "end_ok": bool(end), "empty": not t}


def ink_bbox(a):
    rows, cols = a.any(axis=1).nonzero()[0], a.any(axis=0).nonzero()[0]
    return (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1) if len(rows) else (0, 0, 0, 0)


READY = 0.97  # סף "מוכן": אחוז ההתאמה לסריקה
PUBLISH_MIN = 0.80  # מתחת לזה העמוד לא מתפרסם בדפוס מדויק
HB_MIN = 0.85  # מתחת לזה — שבירות השורה שונות מהדפוס לפי היברובוקס → לבדיקה
REGRESS_TOL = 0.005  # ירידה גדולה מזו לעומת הבנייה הקודמת = נסיגה → נשארת הפריסה הקודמת


GUTTER_TOL = 2.0  # נק' — סטייה מהרווח הקבוע בין העמודות (בדפוס: 14.3 נק' ± 0.4 ב-710 עמודים)


def gutters_of(page):
    """הרווח (בנק') בין עמודת הגמרא לעמודות הצד, לפי השורות שזוהו בעמוד — (שמאל, ימין) או None."""
    import statistics as st
    rows = page["rows"]
    g = [r for r in rows if r["s"] == "gemara" and r["box"][2] - r["box"][0] > 400]
    if not g:
        return None
    gx0 = st.median(r["box"][0] for r in g)
    gx1 = st.median(r["box"][2] for r in g)
    near = lambda r: any(abs(r["box"][1] - q["box"][1]) < 20 for q in g)
    side = [r for r in rows if r["s"] != "gemara" and near(r)]
    R = [r["box"][0] - gx1 for r in side if r["box"][0] > gx1 - 5]
    L = [gx0 - r["box"][2] for r in side if r["box"][2] < gx0 + 5]
    return (round(st.median(L) / Z, 1) if L else None, round(st.median(R) / Z, 1) if R else None)


def status_of(page):
    """מוכן / לבדיקה — כלל קבוע, כדי שההחלטה איזה עמוד לבדוק לא תהיה תחושה."""
    words = sum(i["n"] for i in page.get("audit", []) if i["n"] >= 2 or i["type"] != "missing")
    if (page.get("match") or 0) >= READY and words == 0 and not page.get("flags"):
        return "ready"
    return "review"


def main():
    pdf, tractate, amudim = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
    out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(DEFAULT_OUT, tractate.lower())
    os.makedirs(out, exist_ok=True)
    shas = H.load(f"{H.ROOT}/shas/{tractate}.json.gz")
    ws = H.load_ws(tractate)
    keys = list(shas)
    doc = fitz.open(pdf)
    first = H.first_page_of(doc, tractate)
    path = f"{H.ROOT}/tzurat/print/{tractate.lower()}.json.gz"
    lays = json.loads(gzip.decompress(open(path, "rb").read())) if os.path.exists(path) else {}

    # 1. בנייה מחדש של העמודים (עם נתוני השורות לסקירה)
    reports = {}
    prev_lays = {a: lays[a] for a in amudim if a in lays}  # לשחזור עמוד שנבנה גרוע (PUBLISH_MIN)
    for a in amudim:
        try:
            lay, rep = H.build_page(doc[first - 1 + keys.index(a)], a, H.make_refs(shas, ws, keys, a, tractate), tractate=tractate)
        except Exception as e:  # עמוד חריג (סריקה חלופית וכד') — נשאר הקיים, ולא עוצר את השאר
            print(f"{a} FAILED: {e!r} — kept previous layout")
            continue
        lays[a] = lay
        reports[a] = rep
    if os.environ.get("DEDUPE", "1") != "0":  # DEDUPE=0 — לניסוי השוואה בלבד
        print("boundary duplicates removed:", H.dedupe_boundaries(lays, keys, ref_of=H.ref_lookup(shas, ws, keys, tractate)), "words")
    H.write_layouts(path, {k: lays[k] for k in keys if k in lays})
    H.record_source(tractate, pdf, len(doc))
    H.update_index()
    amudim = [a for a in amudim if a in reports]

    # 2. צילום הדף שלנו מהאפליקציה
    subprocess.run(["node", os.path.join(HERE, "shot.mjs"), tractate, out, ",".join(amudim)], check=True)
    # עמוד שלא צולם (נתקע בטעינה) לא נבדק — לא מתפרסם בבנייה החדשה; חוזרת הפריסה הקודמת שלו
    unshot = [a for a in amudim if not os.path.exists(os.path.join(out, f"o-{a}.png"))]
    if unshot:
        print("not photographed - previous layout kept:", ",".join(unshot), flush=True)
    amudim = [a for a in amudim if a not in unshot]

    data_path = os.path.join(out, "data.json")
    data = json.load(open(data_path, encoding="utf-8")) if os.path.exists(data_path) else {"tractate": tractate, "pages": {}}
    for a in amudim:
        lay, rep = lays[a], reports[a]
        fL, fR, fTop = lay["src"]
        s = V_W / (fR - fL)
        bottom_u = max(sl["t"] + sl["h"] for sl in lay["slabs"])
        lines = rep.get("_lines", [])
        bot_pt = max([fTop + (bottom_u - V_TOP) / s] + [ln["base"] for ln in lines]) + 8
        crop = fitz.Rect(fL - PAD, fTop - HEAD, fR + PAD, bot_pt)
        pg = doc[first - 1 + keys.index(a)]
        if rep.get("k"):  # נבנה מעותק בקנה מידה אחר — גם הסריקה נחתכת ממנו
            pg = H.scaled_page(pg, rep["k"])
        pix = pg.get_pixmap(matrix=fitz.Matrix(Z, Z), clip=crop)
        scan = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        scan.save(os.path.join(out, f"{a}-scan.png"))
        # שלנו: אותו מלבן (בנקודות PDF) ← יחידות עמוד ← פיקסלים בצילום
        shot = Image.open(os.path.join(out, f"o-{a}.png")).convert("RGB")
        ppu = shot.width / lay["page"]["w"]
        U = lambda x, y: ((V_L + (x - fL) * s) * ppu, (V_TOP + (y - fTop) * s) * ppu)
        (ux0, uy0), (ux1, uy1) = U(crop.x0, crop.y0), U(crop.x1, crop.y1)
        canvas = Image.new("RGB", (int(round(ux1 - ux0)), int(round(uy1 - uy0))), "white")
        canvas.paste(shot, (int(round(-ux0)), int(round(-uy0))))
        ours = canvas.resize(scan.size, Image.LANCZOS)
        ours.save(os.path.join(out, f"{a}-ours.png"))
        # שכבות
        sa = np.asarray(scan.convert("L")) < 140
        oa = np.asarray(ours.convert("L")) < 170
        rgb = np.full(sa.shape + (3,), 255, np.uint8)
        rgb[sa & ~oa] = (220, 40, 40); rgb[oa & ~sa] = (40, 90, 230); rgb[sa & oa] = (0, 0, 0)
        Image.fromarray(rgb).save(os.path.join(out, f"{a}-diff.png"))

        # 3. מידות: תיבת הדיו בתוך המסגרת (בלי שורת הכותרת), בנקודות
        # רק אזור הטקסט: מתחת לכותרת ועד קו הבסיס של השורה האחרונה; מה שמתחת (מילת הקישור לעמוד הבא,
        # הערות "תורה אור") נמדד בנפרד
        cut = int((HEAD + 4) * Z)
        last_base = max((ln["base"] for ln in lines), default=crop.y1)
        lim = int((last_base - crop.y0 + 2) * Z)
        bs, bo = ink_bbox(sa[cut:lim]), ink_bbox(oa[cut:lim])
        below = lambda a: round((ink_bbox(a[lim:])[3] - ink_bbox(a[lim:])[1]) / Z, 1) if a[lim:].any() else 0
        size = {"print": {"w": round((bs[2] - bs[0]) / Z, 1), "h": round((bs[3] - bs[1]) / Z, 1)},
                "ours": {"w": round((bo[2] - bo[0]) / Z, 1), "h": round((bo[3] - bo[1]) / Z, 1)},
                "top_diff": round((bo[1] - bs[1]) / Z, 1), "bottom_diff": round((bo[3] - bs[3]) / Z, 1),
                "below": {"print": below(sa), "ours": below(oa)}}

        # 4. שורות: מיקום בתמונה + השוואה
        rows = []
        for i, ln in enumerate(lines):
            c = line_check(ln)
            rows.append({"i": i, "s": ln["s"], "k": ln.get("k"), "print": ln["print"], "ours": ln["ours"], **c,
                         "box": [round((ln["x0"] - crop.x0) * Z), round((ln["top"] - crop.y0) * Z) - 4,
                                 round((ln["x1"] - crop.x0) * Z), round((ln["base"] - crop.y0) * Z) + 4]})
        # מרווחים: כמה המילים שלנו ממלאות כל שורה מלאה (ביישור לשני הצדדים) במרווח רגיל.
        # שורה מתוחה = חסרה מילה; שורה דחוסה = מילה עודפת. היחס מנורמל לחציון של אותו זרם בעמוד
        import fit_width as FW
        for st_ in ("gemara", "rashi", "tosafot"):
            ls_ = [(sl, ln) for sl in lay["slabs"] if sl["s"] == st_ for ln in sl["lines"]]
            rs_ = [r for r in rows if r["s"] == st_]
            fills = []
            for (sl, ln), r in zip(ls_, rs_):
                toks = re.findall(r"<b>.*?</b>|\S+", ln["t"])
                words = []
                for tk in toks:
                    bold = tk.startswith("<b>")
                    for w in re.sub(r"<[^>]+>", "", tk).split():
                        words.append((w, "vilna" if st_ == "gemara" or bold else "rashi"))
                if not ln.get("w") or len(words) < 3:
                    continue
                space = FW.word_w(" ", "vilna" if st_ == "gemara" else "rashi")
                nat = (sum(FW.word_w(w, f) for w, f in words) + space * (len(words) - 1)) * sl["fs"]
                r["fill"] = round(nat / ln["w"], 3)
                fills.append(r["fill"])
            if len(fills) >= 5:
                med = sorted(fills)[len(fills) // 2]
                for r in rs_:
                    if "fill" in r:
                        r["fill_rel"] = round(r["fill"] / med, 3)
                        r["spacing"] = "tight" if r["fill_rel"] > 1.25 else "loose" if r["fill_rel"] < 0.72 else None
        edges = {}
        for st_ in ("gemara", "rashi", "tosafot"):
            rs = [r for r in rows if r["s"] == st_ and not r["empty"]]
            if rs:
                edges[st_] = {"lines": len(rs), "first": rs[0], "last": rs[-1]}
        flagged = [r for r in rows if r["readable"] and not (r["start_ok"] and r["end_ok"])]
        q = None
        try:
            import qa_scan
            q = qa_scan.compare(pg, lay, os.path.join(out, f"o-{a}.png"))
        except Exception as e:
            print(a, "qa failed:", repr(e))
        prev_match = (data["pages"].get(a) or {}).get("match")
        data["pages"][a] = {"prev_match": prev_match, "pdf_page": first + keys.index(a), "size": size, "edges": edges, "rows": rows,
                            "flagged": len(flagged), "readable": sum(1 for r in rows if r["readable"]),
                            "match": q and q["match"], "img": [scan.width, scan.height],
                            "cover": {k: rep[k]["cover"] for k in ("gemara", "rashi", "tosafot") if k in rep}}
        print(a, "match", q and q["match"], "| lines", len(rows), "| flagged", len(flagged), "| size", size, flush=True)
        os.remove(os.path.join(out, f"o-{a}.png"))
    data["pages"] = {k: data["pages"][k] for k in keys if k in data["pages"]}
    # עמוד שנבנה עכשיו בהתאמה נמוכה מ-PUBLISH_MIN לא מתפרסם בדפוס מדויק: חוזרת הפריסה הקודמת
    # שלו, ואם לא הייתה — העמוד יוצג בתצוגה הרגילה של צורת הדף (עדיף על פריסה שבורה)
    held = []
    kept = []
    for a in unshot:
        if a in prev_lays:
            lays[a] = prev_lays[a]
        else:
            lays.pop(a, None)
    for a in amudim:
        pg_ = data["pages"].get(a)
        # מניעת נסיגה: עמוד שנבנה עכשיו גרוע מהבנייה הקודמת שלו — חוזרת הפריסה הקודמת
        pm = pg_.get("prev_match") if pg_ else None
        if pg_ and pm is not None and a in prev_lays and (pg_.get("match") or 0) < pm - REGRESS_TOL:
            kept.append(f"{a} ({pm:.3f}→{pg_['match']:.3f})")
            lays[a] = prev_lays[a]
            pg_["kept_previous"] = True
            continue
        if pg_:
            pg_.pop("kept_previous", None)
        if pg_ and (pg_.get("match") or 0) < PUBLISH_MIN:
            held.append(a)
            pg_["held"] = True
            if a in prev_lays:
                lays[a] = prev_lays[a]
            else:
                lays.pop(a, None)
        elif pg_:
            pg_.pop("held", None)
    if held or kept or unshot:
        H.write_layouts(path, {k: lays[k] for k in keys if k in lays})
        H.update_index()
    if held:
        print(f"held back (match < {PUBLISH_MIN:.0%}):", ",".join(held), flush=True)
    if kept:
        print("regression - previous layout kept:", ", ".join(kept), flush=True)
    data["pdf"] = os.path.abspath(pdf)  # לבנייה מחדש מתוך כלי הסקירה
    # 5. בדיקת שלמות (audit.py) וסטטוס לכל עמוד: "מוכן" = התאמה ≥ READY ובלי מילים חסרות/כפולות
    import audit as AU
    au = AU.audit(tractate)
    # בדיקה צולבת מול היברובוקס (שבירות שורה בגמרא וברש"י, בלתי תלויה ב-OCR): רק מסמנת
    if os.environ.get("HB_CHECK", "1") == "1":
        import hb_check as HB
        from align import norm_token, fold
        nrm = lambda w: fold(norm_token(w))
        mno = next((m["key"] for m in json.load(open(f"{H.ROOT}/shas/index.json", encoding="utf-8"))["masechtot"] if m["slug"] == tractate), None)
        for a in amudim:
            pg_ = data["pages"].get(a)
            if not pg_ or a not in lays or mno is None:
                continue
            try:
                theirs = HB.hb_lines(mno, tractate.lower(), a)
            except Exception:
                theirs = None
            if not theirs:
                continue
            res = {}
            for s_ in ("gemara", "rashi"):
                ours = [re.sub(r"<[^>]+>", " ", ln["t"]) for sl in lays[a]["slabs"] if sl.get("s") == s_ for ln in sl.get("lines", [])]
                if theirs.get(s_):
                    res[s_] = HB.agreement(ours, theirs[s_], nrm)
            pg_["hb"] = res
    # בדיקת חריגות (רק מסמנת, לא משנה את הדף): רווח בין עמודות שרחוק מהרווח הטיפוסי של המסכת
    import statistics as st
    gut = {k: gutters_of(pg_) for k, pg_ in data["pages"].items()}
    vals = [v for g_ in gut.values() if g_ for v in g_ if v is not None]
    typical = st.median(vals) if len(vals) >= 10 else 14.3
    for k, pg_ in data["pages"].items():
        pg_["audit"] = au["pages"].get(k, [])
        pg_["gutters"] = gut[k]
        pg_["flags"] = [f"רווח {'שמאלי' if i == 0 else 'ימני'} בין העמודות {v} נק' (בדרך כלל {typical:.1f})"
                        for i, v in enumerate(gut[k] or ()) if v is not None and abs(v - typical) > GUTTER_TOL]
        for s_, v in (pg_.get("hb") or {}).items():
            if v is not None and v < HB_MIN:
                pg_["flags"].append(f"שבירות שורה ב{'גמרא' if s_ == 'gemara' else 'רש״י'}: {v:.0%} תואמות להיברובוקס")
        pg_["status"] = status_of(pg_)
    st_ = {}
    for pg_ in data["pages"].values():
        st_[pg_["status"]] = st_.get(pg_["status"], 0) + 1
    data["status"] = {"ready_threshold": READY, "counts": st_, "audit": au["streams"]}
    print("status:", st_, "| audit:", {k: (v["missing_words"], v["extra_words"]) for k, v in au["streams"].items()})
    # חיסכון במקום (REVIEW_LEAN=1): תמונות נשמרות רק לעמודים "לבדיקה" — עמוד "מוכן" לא צריך עין
    if os.environ.get("REVIEW_LEAN") == "1":
        for k in amudim:
            pg_ = data["pages"].get(k)
            if pg_ and pg_["status"] == "ready":
                for kind in ("scan", "ours", "diff"):
                    try:
                        os.remove(os.path.join(out, f"{k}-{kind}.png"))
                    except OSError:
                        pass
                pg_["noimg"] = True
            elif pg_:
                pg_.pop("noimg", None)
    json.dump(data, open(data_path, "w", encoding="utf-8"), ensure_ascii=False)
    print("→", out)


if __name__ == "__main__":
    main()
