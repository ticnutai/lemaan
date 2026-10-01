# -*- coding: utf-8 -*-
"""
שלב 1 של צנרת צורת הדף: פענוח DjVu-XML של Internet Archive לעמודים/שורות/מילים.
כל מילה: טקסט, תיבה (x1,y1,x2,y2 — ראשית למעלה-שמאל), ביטחון.
"""
import re, sys, json, gzip
import xml.etree.ElementTree as ET

def iter_pages(path):
    """מניב (index, page_dict) לכל OBJECT בקובץ, בלי לטעון את כל הקובץ לזיכרון."""
    idx = -1
    for event, el in ET.iterparse(path, events=("end",)):
        if el.tag != "OBJECT":
            continue
        idx += 1
        w = h = None
        for p in el.findall("PARAM"):
            if p.get("name") == "PAGE":
                pass
            elif p.get("name") == "DPI":
                pass
        # גודל העמוד מתוך הקובץ: OBJECT width/height
        try:
            w, h = int(el.get("width")), int(el.get("height"))
        except (TypeError, ValueError):
            pass
        lines = []
        for ln in el.iter("LINE"):
            words = []
            for wd in ln.findall("WORD"):
                c = wd.get("coords", "")
                parts = [int(float(v)) for v in c.split(",")[:4]]
                if len(parts) < 4:
                    continue
                x1, y2, x2, y1 = parts  # DjVu: left, bottom, right, top
                txt = (wd.text or "").strip()
                if not txt:
                    continue
                words.append({"t": txt, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                              "c": int(wd.get("x-confidence", "0") or 0)})
            if words:
                lines.append(words)
        yield idx, {"w": w, "h": h, "lines": lines}
        el.clear()

HEB = re.compile(r"[א-ת]")

def page_text(page):
    return " ".join(w["t"] for ln in page["lines"] for w in ln)

if __name__ == "__main__":
    path = sys.argv[1]
    out = sys.argv[2]
    pages = []
    for idx, page in iter_pages(path):
        heb = sum(1 for ln in page["lines"] for w in ln if HEB.search(w["t"]))
        page["heb_words"] = heb
        pages.append(page)
        if idx % 50 == 0:
            print(f"page {idx}: {len(page['lines'])} lines, {heb} hebrew words", file=sys.stderr)
    with gzip.open(out, "wt", encoding="utf-8") as f:
        json.dump(pages, f, ensure_ascii=False)
    print(f"wrote {len(pages)} pages -> {out}")
