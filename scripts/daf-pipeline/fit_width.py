# -*- coding: utf-8 -*-
"""
תיקון שבירות שורה לפי רוחב: אחרי שההתאמה ל-OCR קבעה איזו מילה באיזו שורה, בודקים לכל שורה
אם המילים שהצבנו בה "ממלאות" אותה כמו בדפוס.

המדד: סכום רוחבי המילים (בלי הרווחים) — בדפוס הוא נמדד מהפיקסלים (בשורה מיושרת לשני
הצדדים הרווחים נמתחים, המילים לא), ואצלנו מחושב ממדדי הגופן. היחס בין גופן הדפוס לגופן שלנו
קבוע בקירוב לכל זרם, ונמדד מכל שורות העמוד.

מזיזים מילים בין שורות סמוכות (עד 2 לכל גבול) רק כשזה מקרב את שתיהן לדפוס בבירור —
ההתאמה ל-OCR נכונה ברוב המקרים, ולכן יש "קנס" על כל הזזה.
"""
import os, statistics as st
import numpy as np
from PIL import ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "..", "public", "tzurat", "assets", "fonts")
_FONT = {
    "vilna": ImageFont.truetype(os.path.join(FONTS, "mekorot-vilna", "Mekorot-Vilna.ttf"), 100),
    "rashi": ImageFont.truetype(os.path.join(FONTS, "mekorot", "Mekorot[wght].ttf"), 100),
}
_cache = {}
MAX_SHIFT = 2      # מילים לכל גבול שורה
PENALTY = 0.02     # עלות הזזת מילה אחת (ביחידות שגיאה יחסית בריבוע)


def word_w(tok, font):
    k = (tok, font)
    if k not in _cache:
        _cache[k] = _FONT[font].getlength(tok) / 100.0
    return _cache[k]


def ink_widths(ink, Z, rows, x_off, y_off):
    """לכל שורה (x0,x1,top,base בנק'): סכום רוחבי ריצות הדיו בגוף השורה, אחרי סגירת רווחים
    קטנים מנקודה (רווח בין אותיות) — כלומר רוחב המילים בלי הרווחים שביניהן."""
    out = []
    for r in rows:
        ya, yb = int((r["top"] - y_off) * Z), int((r["base"] - y_off) * Z) + 1
        xa, xb = int((r["x0"] - x_off) * Z), int((r["x1"] - x_off) * Z) + 1
        band = ink[max(0, ya):yb, max(0, xa):xb]
        if band.size == 0:
            out.append(0.0)
            continue
        col = band.any(axis=0)
        col = ndi.binary_closing(col, structure=np.ones(Z + 1, bool))
        out.append(float(col.sum()) / Z)
    return out


def refit(lines, inks, font_of, locked=None, label="", free=None):
    """lines: [[tokens]] לפי סדר הקריאה; inks: רוחב הדיו של כל שורה בדפוס. מחזיר שורות חדשות.
    locked: אינדקסים של שורות שתחילתן לא זזה (מילה מוגדלת בראש השורה וכד')."""
    n = len(lines)
    if n < 2:
        return lines, 0
    locked = set(locked or [])
    toks = [t for ln in lines for t in ln]
    widths = [word_w(t.lstrip(""), font_of(t)) for t in toks]
    cum = [0]
    for ln in lines:
        cum.append(cum[-1] + len(ln))
    pref = [0.0]
    for w in widths:
        pref.append(pref[-1] + w)
    W = lambda a, b: pref[b] - pref[a]
    # יחס דפוס/שלנו — מהשורות שיש בהן לפחות 3 מילים
    ratios = [inks[i] / W(cum[i], cum[i + 1]) for i in range(n) if cum[i + 1] - cum[i] >= 3 and W(cum[i], cum[i + 1]) > 0 and inks[i] > 5]
    if len(ratios) < 4:
        return lines, 0
    r = st.median(ratios)

    def cost(i, a, b):
        if inks[i] <= 5:
            return 0.0
        return ((r * W(a, b) - inks[i]) / inks[i]) ** 2

    # גבולות קבועים: התחלה/סוף, שורות ריקות (אין מה להזיז) והתחלות נעולות
    fixed = {0, n}
    for i in range(n):
        if not lines[i]:
            fixed.update((i, i + 1))
        if i in locked:
            fixed.add(i)
    if free is not None:  # רק הגבולות שה-OCR לא הכריע רשאים לזוז
        fixed.update(i for i in range(n + 1) if i not in free)
    cand = []
    for i in range(n + 1):
        if i in fixed:
            cand.append([cum[i]])
        else:
            cand.append([c for c in range(cum[i] - MAX_SHIFT, cum[i] + MAX_SHIFT + 1) if cum[i - 1] - MAX_SHIFT < c])
    # תכנון דינמי על מיקומי הגבולות
    best = {c: (0.0, None) for c in cand[0]}
    back = [best]
    for i in range(1, n + 1):
        cur = {}
        for c in cand[i]:
            opts = []
            for pc, (pcost, _) in back[-1].items():
                if c <= pc and lines[i - 1]:
                    continue  # שורה שהייתה מלאה לא מתרוקנת
                opts.append((pcost + cost(i - 1, pc, c) + PENALTY * abs(c - cum[i]), pc))
            if opts:
                cur[c] = min(opts)
        if not cur:
            return lines, 0
        back.append(cur)
    # שחזור
    pos = [cum[n]]
    for i in range(n, 0, -1):
        pos.append(back[i][pos[-1]][1])
    pos = pos[::-1]
    moved = sum(abs(pos[i] - cum[i]) for i in range(n + 1))
    if not moved:
        return lines, 0
    return [toks[pos[i]:pos[i + 1]] for i in range(n)], moved
