# -*- coding: utf-8 -*-
"""
בנייה + סקירה של מסכת שלמה בחלקים (כל חלק = הרצה נפרדת של review.py), כדי שהתקדמות תישמר
גם אם משהו נעצר באמצע.

שימוש:  python run_tractate.py <pdf> <Tractate> [--chunk 80] [--skip 8a,8b]
  --skip: עמודים שנשארים בפריסה הקיימת (עמודים מיוחדים שהוחלט לא לבנות מחדש)
"""
import sys, os, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hb_pdf as H


def main():
    args = sys.argv[1:]
    pdf, tractate = args[0], args[1]
    chunk = int(args[args.index("--chunk") + 1]) if "--chunk" in args else 80
    skip = set(args[args.index("--skip") + 1].split(",")) if "--skip" in args else set()
    keys = [k for k in H.load(f"{H.ROOT}/shas/{tractate}.json.gz") if k not in skip]
    parts = [keys[i:i + chunk] for i in range(0, len(keys), chunk)]
    t0 = time.time()
    for i, part in enumerate(parts, 1):
        print(f"=== {tractate} part {i}/{len(parts)} ({part[0]}-{part[-1]}, {len(part)} amudim) {time.strftime('%H:%M:%S')}", flush=True)
        r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "review.py"), pdf, tractate, ",".join(part)],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        for line in (r.stdout + r.stderr).splitlines():
            if any(x in line for x in ("FAILED", "status:", "boundary", "Traceback", "Error", "!!")):
                print("   ", line[:220], flush=True)
        if r.returncode:
            print(f"   part {i} exited with {r.returncode}", flush=True)
    print(f"=== done {tractate}: {len(keys)} amudim in {(time.time() - t0) / 60:.1f} min", flush=True)


if __name__ == "__main__":
    main()
