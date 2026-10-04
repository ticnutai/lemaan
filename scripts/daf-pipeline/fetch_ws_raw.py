# -*- coding: utf-8 -*-
"""
נוסח הגמרא ישירות מדפי ויקיטקסט ("ברכות ב א", מקטע ==גמרא==) — בצורה שמודפסת בדף.

ספריא מעבירה את אותו תעתיק ("Wikisource Talmud Bavli") אבל בוחרת בתבניות השמות את הצורה
המלאה: {{תנא|רבי אליעזר|ר' אליעזר}} → "רבי אליעזר", כשבדפוס "ר' אליעזר". כאן נלקח הערך
המוצג (האחרון), כמו בדף עצמו. מראי מקום לפסוקים ({{קטן|({{הפניה לפסוק|…}})}}) וסימני הערות
שוליים ({{שוליים|א}}) אינם בגוף הדפוס ומוסרים.

שימוש: fetch_ws_raw.py <Tractate>  →  public/shas-wsraw/<Tractate>.json.gz  (אותו מבנה כמו shas-ws)
"""
import os, re, sys, json, gzip, time, urllib.request, urllib.parse, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "public")
CACHE = os.path.join(os.path.expanduser("~"), "lemaan-data", "ws-com")  # משותף עם ws_commentary
sys.path.insert(0, HERE)
from ws_commentary import heb_num

KEEP_LAST = {"תנא", "אמורא", "חכם", "שם", "רב", "תנאים"}   # תבנית שם: הערך המוצג = האחרון
DROP = {"שוליים", "הפניה לפסוק", "כותרת לעמוד בגמרא", "קטן", "ממ", "הערה", "ש"}


def title_of(he, key):
    m = re.match(r"^(\d+)([ab])$", key)
    return f"{he} {heb_num(int(m.group(1)))} {'א' if m.group(2) == 'a' else 'ב'}"


def wikitext(title):
    os.makedirs(CACHE, exist_ok=True)
    local = os.path.join(CACHE, title + ".txt")
    if os.path.exists(local):
        return open(local, encoding="utf-8").read()
    u = "https://he.wikisource.org/w/api.php?format=json&" + urllib.parse.urlencode({"action": "parse", "page": title, "prop": "wikitext"})
    for attempt in range(6):
        try:
            req = urllib.request.Request(u, headers={"User-Agent": "lemaan-pipeline/1.0 (ticnutai)"})
            d = json.load(urllib.request.urlopen(req, timeout=60))
            if "parse" not in d:
                return None
            w = d["parse"]["wikitext"]["*"]
            open(local, "w", encoding="utf-8").write(w)
            return w
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            return None
        except Exception:
            time.sleep(2)
    return None


def expand_templates(t):
    """פותח תבניות מבפנים החוצה."""
    pat = re.compile(r"\{\{([^{}]*)\}\}")
    while True:
        m = pat.search(t)
        if not m:
            return t
        parts = m.group(1).split("|")
        name = parts[0].strip()
        if name in DROP:
            rep = ""
        elif name in KEEP_LAST:
            vals = [p for p in parts[1:] if p.strip() and "=" not in p]
            rep = vals[-1] if vals else ""
        elif name.startswith("מתני"):
            rep = "מתני'"
        elif name.startswith("גמ"):
            rep = "גמ'"
        else:
            rep = ""  # תבנית לא מוכרת — לא חלק מגוף הדפוס
        t = t[:m.start()] + rep + t[m.end():]


def gemara_of(w):
    m = re.search(r"==\s*גמרא\s*==(.*?)(?=\n==[^=]|\Z)", w, re.S)
    if m:
        body = m.group(1)
    else:  # בלי כותרת "גמרא": הטקסט שלפני כותרת המפרש הראשונה
        body = re.split(r"\n==[^=]", w, maxsplit=1)[0]
    body = re.sub(r"<קטע[^>]*/>", " ", body)
    body = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", " ", body, flags=re.S)
    body = re.sub(r"<[^>]+>", " ", body)
    body = expand_templates(body)
    body = re.sub(r"\(\s*\)", " ", body)                                    # סוגריים שהתרוקנו
    body = re.sub(r"\[\[\s*(?:קטגוריה|Category)\s*:[^\]]*\]\]", " ", body)
    body = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", body)
    body = body.replace("'''", "").replace("‏", "").replace("‎", "")
    segs = [re.sub(r"\s+", " ", p).strip() for p in re.split(r"\n\s*\n", body)]
    return [s for s in segs if s] or None


def fetch(he, key):
    w = wikitext(title_of(he, key))
    return key, (gemara_of(w) if w else None)


def main(tractate):
    keys = list(json.loads(gzip.decompress(open(f"{ROOT}/shas/{tractate}.json.gz", "rb").read()))["amudim"].keys())
    he = next(m["he"] for m in json.load(open(f"{ROOT}/shas/index.json", encoding="utf-8"))["masechtot"] if m["slug"] == tractate)
    with cf.ThreadPoolExecutor(3) as ex:
        res = dict(ex.map(lambda k: fetch(he, k), keys))
    missing = [k for k, v in res.items() if not v]
    out = {"tractate": tractate, "source": "he.wikisource daf pages (printed forms of names/abbreviations)",
           "amudim": {k: res[k] for k in keys if res[k]}}
    os.makedirs(f"{ROOT}/shas-wsraw", exist_ok=True)
    open(f"{ROOT}/shas-wsraw/{tractate}.json.gz", "wb").write(gzip.compress(json.dumps(out, ensure_ascii=False).encode()))
    print(tractate, len(keys), "amudim; missing:", missing[:20], len(missing))


if __name__ == "__main__":
    main(sys.argv[1])
