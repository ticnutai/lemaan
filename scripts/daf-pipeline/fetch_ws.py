# -*- coding: utf-8 -*-
"""
גמרא בכתיב הדפוס: נוסח "Wikisource Talmud Bavli" מספריא — ראשי תיבות כמו בדפוס,
בלי פיסוק. מסירים רק מראי-מקום לפסוקים "(ספר פרק, פסוק)" שאינם בדפוס; סוגריים
אחרים (מחיקות הגהה) נשארים כי הם בדפוס.
שימוש: fetch_ws.py Megillah   → public/shas-ws/Megillah.json.gz
"""
import json, gzip, re, sys, os, urllib.request, urllib.parse, concurrent.futures as cf

BOOKS = set("בראשית שמות ויקרא במדבר דברים יהושע שופטים שמואל מלכים ישעיהו ישעיה ירמיהו ירמיה יחזקאל הושע יואל עמוס עובדיה יונה מיכה נחום חבקוק צפניה חגי זכריה מלאכי תהלים משלי איוב שיר רות איכה קהלת אסתר דניאל עזרא נחמיה דברי".split())

def is_ref(inner):
    w = inner.strip().split()
    return bool(w) and ("," in inner or w[0] in BOOKS or inner.strip() == "שם")

def clean(seg):
    return re.sub(r"\s*\(([^)]*)\)", lambda m: "" if is_ref(m.group(1)) else m.group(0), seg)

def fetch(tractate, key):
    u = f"https://www.sefaria.org/api/v3/texts/{tractate}.{key}?version=" + urllib.parse.quote("hebrew|Wikisource Talmud Bavli")
    for _ in range(3):
        try:
            t = json.load(urllib.request.urlopen(u, timeout=30))["versions"][0]["text"]
            return key, [clean(x) for x in (t if isinstance(t, list) else [t]) if x]
        except Exception:
            pass
    return key, None

def main(tractate):
    root = os.path.join(os.path.dirname(__file__), "..", "..", "public")
    keys = list(json.loads(gzip.decompress(open(f"{root}/shas/{tractate}.json.gz", "rb").read()))["amudim"].keys())
    with cf.ThreadPoolExecutor(8) as ex:
        res = dict(ex.map(lambda k: fetch(tractate, k), keys))
    missing = [k for k, v in res.items() if not v]
    out = {"tractate": tractate, "source": "Wikisource Talmud Bavli (via Sefaria)", "note": "verse references removed (not in print)",
           "amudim": {k: res[k] for k in keys if res[k]}}
    os.makedirs(f"{root}/shas-ws", exist_ok=True)
    open(f"{root}/shas-ws/{tractate}.json.gz", "wb").write(gzip.compress(json.dumps(out, ensure_ascii=False).encode()))
    print(tractate, len(keys), "amudim; missing:", missing)

if __name__ == "__main__":
    main(sys.argv[1])
