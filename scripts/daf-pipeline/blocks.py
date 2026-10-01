# -*- coding: utf-8 -*-
"""
שלב 4: ייצוג גושים (הרעיון של בעל המערכת) — לכל זרם, רצפי שורות באותו רוחב
הופכים ל"גוש": תיבה, גובה גופן, פסיעת שורות, מספר שורות (גיאומטרי, לא תלוי
בכמות שורות ה-OCR), ומילה ראשונה/אחרונה שמעגנות את תחום הטקסט מהמקור הנקי.
הטקסט עצמו מגיע 100% מהמקור; ה-OCR משמש רק לעיגון.

שימוש: blocks.py pages.json.gz Masechet.json.gz out.json first_scan_page daf_from daf_to
"""
import sys, json, gzip, statistics
from align import (ref_tokens, assign_streams, box, align_words, norm_token, word_sim)
from locate import load_amud

def group_blocks(pieces, members, page_w=3300):
    """
    פיסות הזרם בסדר קריאה → גושים של רוחב קבוע.
    בעברית הקצה הימני של עמודה יציב; השמאלי משתנה בשורות קצרות (סוף פסקה),
    לכן הקצה השמאלי "מוחלק" בחציון של שלוש שורות סמוכות לפני ההשוואה.
    """
    ks = sorted(members, key=lambda k: (box(pieces[k])[1], -box(pieces[k])[2]))
    if not ks:
        return []
    tol = 0.04 * page_w
    bx = [box(pieces[k]) for k in ks]
    x1s = [b[0] for b in bx]
    eff = []
    for i in range(len(ks)):
        win = x1s[max(0, i - 1):i + 2]
        eff.append(sorted(win)[len(win) // 2])
    blocks = []
    for i, k in enumerate(ks):
        x1, y1, x2, y2, fs = bx[i]
        if blocks:
            b = blocks[-1]
            if abs(eff[i] - b["ex1"]) <= tol and abs(x2 - b["x2"]) <= tol and abs(fs - b["fs"]) <= 0.3 * b["fs"]:
                b["pieces"].append(k); b["y2"] = max(b["y2"], y2); b["fss"].append(fs); b["xs1"].append(eff[i])
                b["ex1"] = statistics.median(b["xs1"])
                continue
        blocks.append({"ex1": eff[i], "xs1": [eff[i]], "x1": eff[i], "y1": y1, "x2": x2, "y2": y2,
                       "fs": fs, "fss": [fs], "pieces": [k]})
    for b in blocks:
        b["x1"] = min(b["xs1"]) if len(b["xs1"]) < 3 else sorted(b["xs1"])[len(b["xs1"]) // 4]
        xs2 = sorted(box(pieces[k])[2] for k in b["pieces"])
        b["x2"] = xs2[(3 * len(xs2)) // 4] if len(xs2) >= 4 else max(xs2)
        b["fs"] = statistics.median(b["fss"])
        ys = sorted(box(pieces[k])[1] for k in b["pieces"])
        dys = [ys[i + 1] - ys[i] for i in range(len(ys) - 1) if ys[i + 1] - ys[i] > 0.5 * b["fs"]]
        b["lh"] = statistics.median(dys) if dys else b["fs"] * 1.25
        b["n"] = max(1, round((b["y2"] - b["y1"]) / b["lh"]) + 1 if b["lh"] else len(b["pieces"]))
        b["n_ocr"] = len(b["pieces"])
    return blocks

def anchor_blocks(pieces, blocks, ref, min_sim=0.65):
    """יישור מטושטש של כל מילות הזרם מול המקור, ואז תחום לכל גוש מהעוגנים שבתוכו."""
    flat, owner = [], []
    for bi, b in enumerate(blocks):
        for k in b["pieces"]:
            for w in pieces[k]:
                flat.append(norm_token(w["t"])); owner.append(bi)
    keys = [r[0] for r in ref]
    pairs = align_words(flat, keys, min_sim=min_sim)
    hits = {}
    for i, j in pairs:
        hits.setdefault(owner[i], []).append(j)
    n_ref = len(keys)
    # קיבולת משוערת לגוש (מילים) = שורות × מילים לשורה (לפי OCR)
    for bi, b in enumerate(blocks):
        wpl = statistics.median(len(pieces[k]) for k in b["pieces"])
        b["cap"] = max(1, round(b["n"] * wpl))
        b["hits"] = sorted(hits.get(bi, []))
    # תחומים מונוטוניים: גוש מעוגן = [min hit .. max hit] מורחב לפי קיבולת; לא מעוגן = פרופורציונלי
    prev_end = -1
    for bi, b in enumerate(blocks):
        if b["hits"]:
            lo, hi = b["hits"][0], b["hits"][-1]
            # הרחבה לקיבולת אם העוגנים לא מכסים את כל הגוש
            missing = b["cap"] - (hi - lo + 1)
            if missing > 0:
                lo -= missing // 3; hi += missing - missing // 3
            s = max(prev_end + 1, lo)
            nxt = next((blocks[j]["hits"][0] for j in range(bi + 1, len(blocks)) if blocks[j]["hits"]), n_ref)
            e = min(hi, nxt - 1, n_ref - 1)
            e = max(s, e)
        else:
            nxt = next((blocks[j]["hits"][0] for j in range(bi + 1, len(blocks)) if blocks[j]["hits"]), n_ref)
            s = prev_end + 1
            e = min(nxt - 1, s + b["cap"] - 1, n_ref - 1)
            e = max(s, e)
        s = min(s, n_ref - 1); e = min(max(s, e), n_ref - 1)
        b["s"], b["e"] = s, e
        prev_end = e
    if blocks:
        blocks[-1]["e"] = n_ref - 1
    for b in blocks:
        b["text"] = " ".join(r[1] for r in ref[b["s"]:b["e"] + 1])
        b["n_words"] = b["e"] - b["s"] + 1
    return blocks

def qa_block(pieces, b, ref):
    if b["e"] < b["s"] or not ref:
        return {"first_ok": False, "last_ok": False, "fill": 0}
    first_ocr = norm_token(pieces[b["pieces"][0]][0]["t"])
    last_ocr = norm_token(pieces[b["pieces"][-1]][-1]["t"])
    first_ref, last_ref = ref[b["s"]][0], ref[b["e"]][0]
    return {"first_ok": word_sim(first_ocr, first_ref) >= 0.7, "last_ok": word_sim(last_ocr, last_ref) >= 0.7,
            "fill": round(b["n_words"] / max(1, b["cap"]), 2)}

def process(page, amud):
    refs = {s: ref_tokens(amud[s]) for s in ("gemara", "rashi", "tosafot") if amud[s]}
    pieces, members, _ = assign_streams(page, refs)
    out, report = [], []
    for s, ref in refs.items():
        blocks = anchor_blocks(pieces, group_blocks(pieces, members[s]), ref)
        for b in blocks:
            q = qa_block(pieces, b, ref)
            out.append({"s": s, "x1": b["x1"], "y1": b["y1"], "x2": b["x2"], "y2": b["y2"], "fs": b["fs"], "lh": b["lh"],
                        "n": b["n"], "text": b["text"], "qa": q})
        report.append({"stream": s, "blocks": len(blocks), "lines": sum(b["n"] for b in blocks),
                       "first_ok": sum(1 for b in blocks if qa_block(pieces, b, ref)["first_ok"]),
                       "last_ok": sum(1 for b in blocks if qa_block(pieces, b, ref)["last_ok"]),
                       "anchored": sum(1 for b in blocks if b["hits"])})
    return out, report

if __name__ == "__main__":
    pages_file, masechet_file, out_file = sys.argv[1:4]
    first_page, daf_from, daf_to = int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
    pages = json.load(gzip.open(pages_file, "rt", encoding="utf-8"))
    layout = {}
    for daf in range(daf_from, daf_to + 1):
        for ai, amud in enumerate(("a", "b")):
            key = f"{daf}{amud}"
            pidx = first_page + 2 * (daf - 2) + ai
            try:
                ref = load_amud(masechet_file, key)
            except KeyError:
                continue
            blocks, report = process(pages[pidx], ref)
            layout[key] = {"page": {"w": pages[pidx]["w"], "h": pages[pidx]["h"]}, "scan": pidx, "blocks": blocks}
            print(f"== {key} (scan {pidx})")
            for r in report:
                print(f"   {r['stream']:8} blocks={r['blocks']:2} lines={r['lines']:3} anchored={r['anchored']}/{r['blocks']} first-word ok={r['first_ok']} last-word ok={r['last_ok']}")
    json.dump(layout, open(out_file, "w", encoding="utf-8"), ensure_ascii=False)
    print("wrote", out_file)
