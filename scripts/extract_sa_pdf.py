# חילוץ שאלות ותשובות מקובץ הסיכומים על שולחן ערוך אורח חיים.
# לכל "סעיף X'": השאלה = השורה הראשונה בגופן הכותרת (FbThila) אחריו, התשובות = השורות שאחריה
# עד הכותרת הבאה (או הסעיף הבא). כל מה שאחרי זה בתוך אותו סעיף — מדולג.
import json, re, sys
import fitz

PDF = sys.argv[1]
FIRST, LAST = int(sys.argv[2]), int(sys.argv[3])  # מספרי עמודים (מ-1)
OUT = sys.argv[4]

LTR_RUN = re.compile(r"[0-9A-Za-z][0-9A-Za-z.,:/%\-]*[0-9A-Za-z]|[0-9A-Za-z]")


def line_text(chars):
    """שורה חזותית → טקסט בסדר קריאה: אותיות מימין לשמאל, ומספרים/לועזית חוזרים לכיוונם."""
    chars = sorted(chars, key=lambda c: -(c[0] + c[1]) / 2)
    s = "".join(ch for _, _, ch in chars)
    s = LTR_RUN.sub(lambda m: m.group(0)[::-1], s)
    return re.sub(r"\s+", " ", s).strip()


def page_lines(page):
    """שורות העמוד: [(y, גודל, סוג, טקסט)] — מקבצים תווים לפי גובה, ומסווגים לפי הגופן."""
    raw = page.get_text("rawdict")
    rows = {}
    for b in raw["blocks"]:
        for l in b.get("lines", []):
            for sp in l["spans"]:
                font, size = sp["font"], round(sp["size"], 1)
                if size < 9:  # מספרי הערות שוליים קטנים — לא חלק מהטקסט
                    continue
                for c in sp["chars"]:
                    x0, y0, x1, y1 = c["bbox"]
                    key = round((y0 + y1) / 2 / 3)  # שורות באותו גובה (בקירוב)
                    r = rows.setdefault(key, {"chars": [], "fonts": {}, "y": y0})
                    r["chars"].append((x0, x1, c["c"]))
                    r["fonts"][(font, size)] = r["fonts"].get((font, size), 0) + 1
    out = []
    for key in sorted(rows):
        r = rows[key]
        (font, size), _ = max(r["fonts"].items(), key=lambda kv: kv[1])
        out.append((r["y"], size, font, line_text(r["chars"])))
    return out


def kind(y, size, font, text):
    if y < 60:
        return "header"
    if size >= 15.5 and "Bold" in font and re.match(r"^סעיף\s+[א-ת]{1,3}['׳]?$", text):
        return "seif"
    if size >= 17:
        return "siman"
    if "Thila" in font and size >= 13.5 and "הערות" in text:
        return "notes"
    if "Thila" in font and 11.5 <= size < 13.5:
        return "topic"
    if 10.5 <= size < 11.6:
        return "body"
    return "other"


doc = fitz.open(PDF)
items = []
siman = None
cur = None  # {"siman", "seif", "question", "answer": [], "pages": set()}
state = "skip"  # skip | want_topic | answer

for pno in range(FIRST - 1, LAST):
    in_notes = False
    for y, size, font, text in page_lines(doc[pno]):
        k = kind(y, size, font, text)
        if k == "header":
            m = re.search(r"סי'\s*([א-ת\"״]+)\s*[–-]\s*(.+)", text)
            if m:
                siman = (m.group(1), m.group(2).strip())
            continue
        if k == "notes":
            in_notes = True
            continue
        if in_notes or not text:
            continue
        if k == "siman":
            continue
        if k == "seif":
            if cur and cur["answer"]:
                items.append(cur)
            cur = {"siman": siman, "seif": re.sub(r"['׳]", "", text.split()[-1]), "question": None, "answer": [], "pages": {pno + 1}}
            state = "want_topic"
            continue
        if k == "topic":
            if state == "want_topic":
                cur["question"] = text
                state = "answer"
            elif state == "answer" and not cur["answer"]:
                cur["question"] += " " + text  # שאלה שנמשכת לשורה נוספת
            elif state == "answer":
                state = "skip"  # כותרת שנייה בסעיף — מדלגים עד הסעיף הבא
            continue
        if k == "body" and state == "answer":
            cur["answer"].append(text)
            cur["pages"].add(pno + 1)

if cur and cur["answer"]:
    items.append(cur)


def join_answer(lines):
    """מחבר שורות לפסקאות: כל סעיף משנה ("א." "ב." ...) בשורה חדשה."""
    paras = []
    for t in lines:
        t = re.sub(r"\s+([.,:;])", r"\1", t)
        if re.match(r"^[א-ת]{1,2}\.\s", t) or not paras:
            paras.append(t)
        else:
            paras[-1] += " " + t
    return "\n".join(re.sub(r"\s+", " ", p).strip() for p in paras)


res = [{
    "siman": it["siman"][0] if it["siman"] else None,
    "simanTitle": it["siman"][1] if it["siman"] else None,
    "seif": it["seif"],
    "question": it["question"],
    "answer": join_answer(it["answer"]),
    "pages": sorted(it["pages"]),
} for it in items if it["question"]]
json.dump(res, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(res))
