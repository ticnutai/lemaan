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


def main():
    pdf, tractate, amudim = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
    out = sys.argv[4] if len(sys.argv) > 4 else os.path.join(DEFAULT_OUT, tractate.lower())
    os.makedirs(out, exist_ok=True)
    shas = H.load(f"{H.ROOT}/shas/{tractate}.json.gz")
    ws = H.load(f"{H.ROOT}/shas-ws/{tractate}.json.gz")
    keys = list(shas)
    doc = fitz.open(pdf)
    first = H.first_page_of(doc, tractate)
    path = f"{H.ROOT}/tzurat/print/{tractate.lower()}.json.gz"
    lays = json.loads(gzip.decompress(open(path, "rb").read())) if os.path.exists(path) else {}

    # 1. בנייה מחדש של העמודים (עם נתוני השורות לסקירה)
    reports = {}
    for a in amudim:
        lay, rep = H.build_page(doc[first - 1 + keys.index(a)], a, H.make_refs(shas, ws, keys, a))
        lays[a] = lay
        reports[a] = rep
    H.write_layouts(path, {k: lays[k] for k in keys if k in lays})
    H.update_index()

    # 2. צילום הדף שלנו מהאפליקציה
    subprocess.run(["node", os.path.join(HERE, "shot.mjs"), tractate, out, ",".join(amudim)], check=True)

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
            rows.append({"i": i, "s": ln["s"], "print": ln["print"], "ours": ln["ours"], **c,
                         "box": [round((ln["x0"] - crop.x0) * Z), round((ln["top"] - crop.y0) * Z) - 4,
                                 round((ln["x1"] - crop.x0) * Z), round((ln["base"] - crop.y0) * Z) + 4]})
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
        data["pages"][a] = {"pdf_page": first + keys.index(a), "size": size, "edges": edges, "rows": rows,
                            "flagged": len(flagged), "readable": sum(1 for r in rows if r["readable"]),
                            "match": q and q["match"], "img": [scan.width, scan.height],
                            "cover": {k: rep[k]["cover"] for k in ("gemara", "rashi", "tosafot") if k in rep}}
        print(a, "match", q and q["match"], "| lines", len(rows), "| flagged", len(flagged), "| size", size, flush=True)
        os.remove(os.path.join(out, f"o-{a}.png"))
    data["pages"] = {k: data["pages"][k] for k in keys if k in data["pages"]}
    json.dump(data, open(data_path, "w", encoding="utf-8"), ensure_ascii=False)
    print("→", out)


if __name__ == "__main__":
    main()
