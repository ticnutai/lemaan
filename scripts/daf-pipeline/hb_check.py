# -*- coding: utf-8 -*-
"""
בדיקה צולבת בלתי תלויה: שבירות השורה שלנו מול הטקסט של היברובוקס (hebrewbooks.org, תצוגת טקסט),
שבו כל שורה בדפוס היא שורה בטקסט — לגמרא ולרש"י. (בתוספות שם השורות אינן לפי הדפוס — לא נבדק.)

המדד: מתוך גבולות השורה של היברובוקס (המילה שאחריה השורה נגמרת), כמה הם גם גבול שורה אצלנו.
שורת גמרא רחבה שאצלנו מחולקת לשני חלקים אינה נחשבת שגיאה (אצלנו יש יותר גבולות, לא פחות).
התוצאה נשמרת לכל עמוד בנתוני הסקירה; עמוד עם התאמה נמוכה מסומן "לבדיקה".
"""
import os, re, json, html, time, difflib, urllib.request

CACHE = os.path.join(os.path.expanduser("~"), "lemaan-data", "hb-text")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CLS = {"gemara": "shastext2", "rashi": "shastext3"}


def hb_lines(mesechta_no, slug, key):
    """→ {"gemara": [שורות], "rashi": [שורות]} או None. נשמר במטמון מקומי."""
    os.makedirs(os.path.join(CACHE, slug), exist_ok=True)
    local = os.path.join(CACHE, slug, key + ".json")
    if os.path.exists(local):
        return json.load(open(local, encoding="utf-8"))
    daf = key[:-1] + ("" if key.endswith("a") else "b")
    url = f"https://www.hebrewbooks.org/shas.aspx?mesechta={mesechta_no}&daf={daf}&format=text"
    s = None
    for attempt in range(3):
        try:
            s = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60).read().decode("utf-8", "replace")
            break
        except Exception:
            time.sleep(3 * (attempt + 1))
    if s is None:
        return None
    out = {}
    for name, cls in CLS.items():
        m = re.search(r'<div class="' + cls + r'">(.*?)</div>', s, re.S)
        if m:
            t = html.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))
            out[name] = [re.sub(r"\s+", " ", l).strip() for l in t.split("\n") if l.strip()]
    json.dump(out, open(local, "w", encoding="utf-8"), ensure_ascii=False)
    time.sleep(0.4)  # נימוס כלפי האתר
    return out


def _tok(s, norm):
    return [norm(w) for w in re.sub(r"[.,:;!?()\[\]]", " ", s).split() if re.search("[א-ת]", w) and norm(w)]


def breaks(lines, norm):
    """רצף מילים + אינדקסים שאחריהם נגמרת שורה."""
    words, ends = [], set()
    for ln in lines:
        t = _tok(ln, norm)
        if not t:
            continue
        words += t
        ends.add(len(words) - 1)
    return words, ends


def agreement(ours, theirs, norm):
    """אחוז גבולות השורה של היברובוקס שהם גם גבולות אצלנו (אחרי יישור המילים)."""
    A, ea = breaks(ours, norm)
    B, eb = breaks(theirs, norm)
    if len(eb) < 3 or not A:
        return None
    sm = difflib.SequenceMatcher(None, B, A, autojunk=False)
    mapb = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                mapb[i1 + k] = j1 + k
    # שורה אחרונה של העמוד אצל היברובוקס כוללת לפעמים את מילת הקישור — לא נחשבת
    eb = {e for e in eb if e != len(B) - 1}
    hit = sum(1 for e in eb if e in mapb and mapb[e] in ea)
    return round(hit / max(1, len(eb)), 3)
