# -*- coding: utf-8 -*-
"""
בנייה + סקירה של מסכת שלמה — הכל בפקודה אחת: מוריד מה שחסר (סריקה מאוצריא, גמרא מוויקיטקסט),
בודק שיש רש"י ותוספות באורייתא, ובונה בחלקים (כל חלק = הרצה נפרדת של review.py), כדי שהתקדמות
תישמר גם אם משהו נעצר באמצע. במצב חיסכון (ברירת מחדל) נשמרות תמונות רק לעמודים "לבדיקה".

שימוש:
  python run_tractate.py <Tractate> [--pdf path] [--chunk 80] [--skip 8a,8b] [--images]
  python run_tractate.py Bava_Metzia Bava_Batra Sanhedrin        (כמה מסכתות ברצף)
"""
import sys, os, subprocess, time, json, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hb_pdf as H

PDF_DIR = os.path.join(os.path.expanduser("~"), "Downloads", "otzaria")
LIB = "https://raw.githubusercontent.com/otzaria/otzaria-library/main/MoreBooks/ספרים/אוצריא/תלמוד בבלי"
PDF_NAME = {"נידה": "נדה"}  # שם הקובץ באוצריא כשהוא שונה מהשם באינדקס


def meta_of(slug):
    for m in json.load(open(f"{H.ROOT}/shas/index.json", encoding="utf-8"))["masechtot"]:
        if m["slug"] == slug:
            return m
    raise SystemExit(f"unknown tractate {slug}")


def ensure_pdf(m):
    name = PDF_NAME.get(m["he"], m["he"])
    path = os.path.join(PDF_DIR, f"{name}.pdf")
    if os.path.exists(path) and open(path, "rb").read(5) == b"%PDF-":
        return path
    os.makedirs(PDF_DIR, exist_ok=True)
    url = urllib.parse.quote(f"{LIB}/{m['seder_he']}/{name}.pdf", safe=":/")
    print(f"   downloading {name}.pdf …", flush=True)
    data = urllib.request.urlopen(url, timeout=600).read()
    if not data.startswith(b"%PDF-"):
        raise RuntimeError(f"no PDF for {m['he']} in the Otzaria library")
    open(path, "wb").write(data)
    print(f"   {len(data) / 1e6:.1f} MB", flush=True)
    return path


def ensure_sources(m):
    ws = f"{H.ROOT}/shas-ws/{m['slug']}.json.gz"
    if not os.path.exists(ws):
        print("   fetching gemara text (Wikisource) …", flush=True)
        subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "fetch_ws.py"), m["slug"]], check=True)
    if not os.path.exists(f"{H.ROOT}/shas-wsraw/{m['slug']}.json.gz"):
        print("   fetching gemara text (Wikisource daf pages, printed forms) …", flush=True)
        subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "fetch_ws_raw.py"), m["slug"]], check=False)
    import orayta
    for c in ("rashi", "tosafot"):
        d = orayta.load(m["he"], c)
        print(f"   {c}: {'Orayta ' + str(len(d)) + ' amudim' if d else 'NOT in Orayta - Wikisource per amud'}", flush=True)


def run_one(slug, args):
    m = meta_of(slug)
    chunk = int(args[args.index("--chunk") + 1]) if "--chunk" in args else 80
    skip = set(args[args.index("--skip") + 1].split(",")) if "--skip" in args else set()
    print(f"=== {slug} ({m['he']}, {m['amud_count']} amudim) {time.strftime('%H:%M:%S')}", flush=True)
    pdf = args[args.index("--pdf") + 1] if "--pdf" in args else ensure_pdf(m)
    ensure_sources(m)
    keys = [k for k in H.load(f"{H.ROOT}/shas/{slug}.json.gz") if k not in skip]
    parts = [keys[i:i + chunk] for i in range(0, len(keys), chunk)]
    env = dict(os.environ)
    if "--images" not in args:
        env["REVIEW_LEAN"] = "1"
    t0 = time.time()
    for i, part in enumerate(parts, 1):
        print(f"   part {i}/{len(parts)} ({part[0]}-{part[-1]}) {time.strftime('%H:%M:%S')}", flush=True)
        r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "review.py"), pdf, slug, ",".join(part)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
        for line in (r.stdout + r.stderr).splitlines():
            if any(x in line for x in ("FAILED", "status:", "Traceback", "Error", "!!", "held back", "regression")):
                print("     ", line[:220], flush=True)
        if r.returncode:
            print(f"      part {i} exited with {r.returncode}", flush=True)
    print(f"=== done {slug}: {len(keys)} amudim in {(time.time() - t0) / 60:.1f} min", flush=True)


def main():
    args = sys.argv[1:]
    flags_with_value = {"--pdf", "--chunk", "--skip"}
    slugs, i = [], 0
    while i < len(args):
        if args[i] in flags_with_value:
            i += 2
            continue
        if not args[i].startswith("--"):
            slugs.append(args[i])
        i += 1
    for slug in slugs:
        try:
            run_one(slug, args)
        except Exception as e:  # מסכת שנכשלה לא עוצרת את השאר
            print(f"=== {slug} FAILED: {e!r}", flush=True)


if __name__ == "__main__":
    main()
