# -*- coding: utf-8 -*-
"""
בדיקת שלמות: כל מילה של טקסט המקור מופיעה בדף שלנו פעם אחת בדיוק ובסדר הנכון — בלי השמטות
ובלי כפילויות, גם בגבולות שבין העמודים.

לכל זרם (גמרא / רש"י / תוספות) משרשרים את המילים שמוצגות בכל העמודים שנבנו בצינור הנוכחי,
לפי סדר העמודים, ומשווים לשרשור טקסט המקור של אותם עמודים (השוואת רצפים).
במפרשים הדפוס מסדר לפעמים את הדיבורים אחרת מהמקור — רצף שחסר במקום אחד ומופיע בעמוד
סמוך מסומן "הוזז" ואינו נחשב שגיאה.

שימוש:  python audit.py <Tractate> [amudim 2a,2b,...]
פלט: סיכום למסך, ו-~/lemaan-data/review/<tractate>/audit.json (כלי הסקירה מציג אותו לכל עמוד).
"""
import sys, os, json, gzip, re, difflib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hb_pdf as H
from align import norm_token, fold

OUT = os.path.join(os.path.expanduser("~"), "lemaan-data", "review")
STREAMS = ("gemara", "rashi", "tosafot")


def norm(t):
    t = re.sub(r"<[^>]+>", "", t).lstrip(H.DH)
    return fold(norm_token(re.sub(r"[\"'״׳.,:;!?()\[\]<>־-]", "", t)))


def shown(lay, stream):
    """המילים שמוצגות בזרם, בסדר הקריאה (כולל המילה שבמסגרת הפתיחה; בלי מילות הקישור)."""
    out = []
    if stream == "gemara" and lay.get("box"):
        out += re.sub(r"<[^>]+>", " ", lay["box"].get("text", "")).split()
    for sl in lay.get("slabs", []):
        if sl.get("s") == stream:
            for ln in sl.get("lines", []):
                out += re.sub(r"<[^>]+>", " ", ln.get("t", "")).split()
    return [t for t in out if H.HEB.search(t)]


def strip_hadran(seq, keys_, names):
    """כותרות "הדרן עלך <פרק>" הן כותרות, לא טקסט של זרם — מוציאים אותן משני הצדדים."""
    out, outk, i = [], [], 0
    while i < len(seq):
        if seq[i] == "הדרנ" and i + 1 < len(seq) and seq[i + 1] == "עלכ":
            n = 2 + max((len(nm) for nm in names if seq[i + 2: i + 2 + len(nm)] == nm), default=0)
            i += n
            continue
        out.append(seq[i]); outk.append(keys_[i]); i += 1
    return out, outk


def audit(tractate, only=None, path=None, save=True):
    slug = tractate.lower()
    lays = json.loads(gzip.decompress(open(path or f"{H.ROOT}/tzurat/print/{slug}.json.gz", "rb").read()))
    shas = H.load(f"{H.ROOT}/shas/{tractate}.json.gz")
    ws = H.load(f"{H.ROOT}/shas-ws/{tractate}.json.gz")
    keys = [k for k in shas if k in lays and lays[k].get("src")]  # רק עמודים מהצינור הנוכחי
    if only:
        keys = [k for k in keys if k in only]
    # רצפים של עמודים סמוכים בלבד (פער בבנייה = רצף חדש, כדי לא לדווח "חסר" על עמוד שלא נבנה)
    allk = list(shas)
    runs, cur = [], []
    for k in keys:
        if cur and allk.index(k) != allk.index(cur[-1]) + 1:
            runs.append(cur); cur = []
        cur.append(k)
    if cur:
        runs.append(cur)
    refs = {k: H.make_refs(shas, ws, allk, k, tractate) for k in keys}
    # שמות הפרקים כפי שהם בכותרות ההדרן שבמקור
    names = set()
    for k in allk:
        for m in re.finditer(r"הדרן עלך ([^<:]+)", " ".join(ws.get(k) or [])):
            names.add(tuple(norm(t) for t in m.group(1).split() if norm(t)))
    res = {"tractate": tractate, "amudim": len(keys), "streams": {}, "pages": {k: [] for k in keys}}
    for s in STREAMS:
        tot_ref = tot_ok = 0
        issues = []
        for run in runs:
            R, Rk, D, Dk = [], [], [], []
            for k in run:
                ref, lo, hi = refs[k][s][0], refs[k][s][1], refs[k][s][2]
                for t in ref[lo:hi]:
                    if norm(t):
                        R.append(norm(t)); Rk.append(k)
                for t in shown(lays[k], s):
                    if norm(t):
                        D.append(norm(t)); Dk.append(k)
            R, Rk = strip_hadran(R, Rk, names)
            D, Dk = strip_hadran(D, Dk, names)
            sm = difflib.SequenceMatcher(None, R, D, autojunk=False)
            ops = [o for o in sm.get_opcodes()]
            tot_ref += len(R)
            tot_ok += sum(i2 - i1 for tag, i1, i2, j1, j2 in ops if tag == "equal")
            dels = [(i1, i2, j1) for tag, i1, i2, j1, j2 in ops if tag in ("delete", "replace")]
            ins = [(j1, j2, i1) for tag, i1, i2, j1, j2 in ops if tag in ("insert", "replace")]
            used = set()
            for i1, i2, j1 in dels:
                seq = R[i1:i2]
                k_ = Dk[min(j1, len(Dk) - 1)] if Dk else Rk[i1]
                # הוזז: אותו רצף בדיוק מופיע כתוספת בעמוד זה או בסמוך
                # (התאמה מקורבת: מילה-שתיים בקצה הרצף יכולות להיות שונות — חלוקת המילים בין רצפים)
                same = lambda x, y: x == y or (min(len(x), len(y)) >= 5 and
                                               difflib.SequenceMatcher(None, x, y, autojunk=False).ratio() >= 0.9)
                mv = next((n for n, (a, b, _) in enumerate(ins) if n not in used and same(D[a:b], seq)
                           and abs(allk.index(Dk[a]) - allk.index(Rk[i1])) <= 1), None)
                if mv is not None:
                    used.add(mv)
                    continue
                issues.append({"amud": Rk[i1], "stream": s, "type": "missing", "n": i2 - i1, "words": " ".join(seq[:12])})
            for n, (j1, j2, i1) in enumerate(ins):
                if n in used:
                    continue
                seq = D[j1:j2]
                dup = " ".join(seq) in " ".join(R[max(0, i1 - 40): i1 + 40])
                issues.append({"amud": Dk[j1], "stream": s, "type": "duplicate" if dup else "extra", "n": j2 - j1, "words": " ".join(seq[:12])})
        res["streams"][s] = {"words": tot_ref, "in_order": round(tot_ok / tot_ref, 4) if tot_ref else None,
                             "issues": len(issues), "missing_words": sum(i["n"] for i in issues if i["type"] == "missing"),
                             "extra_words": sum(i["n"] for i in issues if i["type"] != "missing")}
        # מילים שהוסרו בכוונה (תיקון "drop": במקור אך לא בדפוס) אינן חוסר
        drops = {(k, norm(o["drop"])) for k in keys for o in H.overrides_for(tractate, k) if o.get("drop") and o.get("s") == s}
        issues = [i for i in issues if not (i["type"] == "missing" and (i["amud"], i["words"]) in drops)]
        for i in issues:
            res["pages"].setdefault(i["amud"], []).append(i)
    if not save:
        return res
    os.makedirs(os.path.join(OUT, slug), exist_ok=True)
    json.dump(res, open(os.path.join(OUT, slug, "audit.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return res


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--fix"]
    t = args[0]
    only = set(args[1].split(",")) if len(args) > 1 else None
    if "--fix" in sys.argv:  # מסירת כפילויות בגבולות העמודים בקובץ הקיים (בלי בנייה מחדש)
        path = f"{H.ROOT}/tzurat/print/{t.lower()}.json.gz"
        lays = json.loads(gzip.decompress(open(path, "rb").read()))
        rep = []
        shas_, ws_ = H.load(f"{H.ROOT}/shas/{t}.json.gz"), H.load(f"{H.ROOT}/shas-ws/{t}.json.gz")
        n = H.dedupe_boundaries(lays, list(shas_), rep, ref_of=H.ref_lookup(shas_, ws_, list(shas_), t))
        H.write_layouts(path, lays)
        print("fix: removed", n, "duplicated words:", rep)
    r = audit(t, only)
    print(f"{t}: {r['amudim']} amudim")
    for s, v in r["streams"].items():
        print(f"  {s:8} words {v['words']:6}  in order {v['in_order']:.2%}  missing {v['missing_words']}  extra {v['extra_words']}  ({v['issues']} places)")
    worst = sorted(((sum(i['n'] for i in v), k) for k, v in r["pages"].items() if v), reverse=True)[:8]
    for n, k in worst:
        print(f"  {k}: {n} words —", "; ".join(f"{i['stream']} {i['type']} {i['n']}: {i['words'][:40]}" for i in r["pages"][k][:3]))
