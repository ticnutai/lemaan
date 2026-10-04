# -*- coding: utf-8 -*-
"""
גיבוי לעמוד בודד של רש"י/תוספות שחסר באורייתא: דף הגמרא בוויקיטקסט ("בבא קמא עא א"),
מקטע ==רש"י== / ==תוספות==. אותה משפחת מקורות כמו נוסח הגמרא שלנו — לא ספריא.
מחזיר פסקאות "ד"ה - פירוש" (כמו orayta.load), או None.
"""
import os, re, json, urllib.request, urllib.parse

CACHE = os.path.join(os.path.expanduser("~"), "lemaan-data", "ws-com")
SECTION = {"rashi": 'רש"י', "tosafot": "תוספות"}
BOLD = "'" * 3


def heb_num(n):
    out = ""
    for v, c in ((400, "ת"), (300, "ש"), (200, "ר"), (100, "ק")):
        while n >= v:
            out += c
            n -= v
    if n == 15:
        return out + "טו"
    if n == 16:
        return out + "טז"
    return out + ("יכלמנסעפצ"[n // 10 - 1] if n >= 10 else "") + ("אבגדהוזחט"[n % 10 - 1] if n % 10 else "")


def page(he, key, comm):
    m = re.match(r"^(\d+)([ab])$", key)
    if not m or comm not in SECTION:
        return None
    title = f"{he} {heb_num(int(m.group(1)))} {'א' if m.group(2) == 'a' else 'ב'}"
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, title + ".txt")
    if not os.path.exists(local):
        u = "https://he.wikisource.org/w/api.php?format=json&" + urllib.parse.urlencode(
            {"action": "parse", "page": title, "prop": "wikitext"})
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "lemaan-pipeline/1.0"})
            w = json.load(urllib.request.urlopen(req, timeout=60))["parse"]["wikitext"]["*"]
        except Exception:
            return None
        open(local, "w", encoding="utf-8").write(w)
    w = open(local, encoding="utf-8").read()
    sec = re.search(r"==\s*" + re.escape(SECTION[comm]) + r"\s*==(.*?)(?=\n==[^=]|\Z)", w, re.S)
    if not sec:
        return None
    body = sec.group(1)
    body = re.sub(r"<קטע[^>]*/>", " ", body)
    body = re.sub(r"\[\[\s*(?:קטגוריה|Category)\s*:[^\]]*\]\]", " ", body)  # קטגוריות — לא טקסט
    body = re.sub(r"\{\{[^{}]*\}\}", " ", body)                 # תבניות
    body = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", body)  # קישורים → הטקסט
    body = body.replace("‏", "").replace("‎", "")
    segs = []
    for para in re.split(r"\n\s*\n", body):
        para = re.sub(r"\s+", " ", para).strip()
        if not para:
            continue
        if para.startswith(BOLD) and BOLD in para[3:]:
            dh, rest = para[3:].split(BOLD, 1)
            rest = rest.strip()
            segs.append(f"{dh.strip()} - {rest}" if rest else dh.strip())
        else:
            segs.append(para)
    return segs or None


if __name__ == "__main__":
    import sys
    for s in page(sys.argv[1], sys.argv[2], sys.argv[3]) or []:
        print(s[:100])
