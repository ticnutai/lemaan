# -*- coding: utf-8 -*-
"""
שורות הטקסט ישירות מפיקסלי הסריקה — בלי תלות ב-OCR.

ה-OCR של הסריקות מאבד שורות שלמות כשהוא מתקלקל באזור מסוים; הדיו עצמו תמיד שם.
מזהים:
  1. מרווחי עמודות ("נהרות" לבנים אנכיים, ברוחב ≥7 נק' ובגובה של כמה שורות)
  2. ליבת כל שורה (אזור גוף האותיות, בלי הזנבות של ל/ק/ך/ן) — צפיפות דיו אופקית
  3. לכל שורה: קו בסיס, גובה גוף האות (מבדיל גמרא ממפרשים), וקצוות הדיו ימין/שמאל

כל המידות המוחזרות בנקודות PDF.
"""
import numpy as np
import fitz
from scipy import ndimage as ndi

Z = 3  # פיקסלים לנקודה (≈216dpi)


def ink_mask(page, clip):
    pix = page.get_pixmap(matrix=fitz.Matrix(Z, Z), colorspace=fitz.csGRAY, clip=clip)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 140


def gutters(ink, min_w=7.0, min_h=34.0):
    """פיקסלים לבנים שהם חלק מרצועה לבנה רחבה (≥min_w) שנמשכת אנכית ≥min_h."""
    H, W = ink.shape
    idx = np.arange(W)[None, :]
    prev = np.maximum.accumulate(np.where(ink, idx, -1), axis=1)
    nxt = np.minimum.accumulate(np.where(ink, idx, W)[:, ::-1], axis=1)[:, ::-1]
    wide = ~ink & ((nxt - prev - 1) >= min_w * Z)
    idy = np.arange(H)[:, None]
    up = np.maximum.accumulate(np.where(~wide, idy, -1), axis=0)
    dn = np.minimum.accumulate(np.where(~wide, idy, H)[::-1, :], axis=0)[::-1, :]
    vrun = dn - up - 1
    return wide & (vrun >= min_h * Z), vrun


def find_lines(page, fL, fR, y_top, y_bot, debug=None):
    """→ רשימת שורות: {x0, x1, top, base, xh} (נק' PDF), ממוינות מלמעלה למטה."""
    pad = 3
    clip = fitz.Rect(fL - pad, y_top - pad, fR + pad, y_bot + pad)
    ink = ink_mask(page, clip)
    gut, vrun = gutters(ink)
    # צפיפות דיו אופקית בחלון 24 נק' (נמדד): גג האותיות ~0.6–0.8, גוף ~0.15–0.25, בסיס ~0.35,
    # אזור הזנבות (ל למעלה, ק/ך/ן למטה) ~0.03–0.07, בין שורות 0
    dens = ndi.uniform_filter1d(ink.astype(np.float32), size=24 * Z, axis=1, mode="constant")
    core = (dens >= 0.11) & ~gut
    lab, n = ndi.label(core)
    lines = []
    gap_px = int(9.5 * Z)
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        h, w = (ys.stop - ys.start) / Z, (xs.stop - xs.start) / Z
        if w < 4 or not 2.0 <= h <= 20:
            continue
        m = lab[sl] == i
        # גבולות הליבה: השורות שבהן הרכיב תופס את רוב רוחבו (חסין לבליטות נקודתיות)
        rows = m.sum(axis=1)
        good = np.where(rows >= 0.5 * rows.max())[0]
        ya, yb = ys.start + good[0], ys.start + good[-1] + 1
        # הדיו בפועל בתוך פס השורה (הליבה "דולפת" מעט מעבר לקצה בגלל החלון)
        band = ink[ya:yb, xs.start:xs.stop].any(axis=0)
        cols = np.where(band)[0]
        if len(cols) == 0:
            continue
        # פיצול ברווחים לבנים ≥9.5 נק' (מרווח עמודות שלא זוהה כנהר, או רווח מילים חריג) —
        # החיבור חזרה נעשה אחר כך לפי סוג השורה ומיקום הרווח
        cuts = np.where(np.diff(cols) > gap_px)[0]
        segs = np.split(cols, cuts + 1)
        for sg in segs:
            xa, xb = xs.start + sg[0], xs.start + sg[-1] + 1
            ta, tb = ya, yb
            if len(segs) > 1 and xb - xa >= 60 * Z:
                # לפיסה רחבה: גבולות גוף האות שלה עצמה (שורת גמרא ושורת מפרש שנדבקו שונות בגובה)
                y0_, y1_ = max(0, ya - 3 * Z), min(ink.shape[0], yb + 3 * Z)
                frac = ink[y0_:y1_, xa:xb].mean(axis=1) >= 0.11
                runs, st_ = [], None
                for k, v in enumerate(np.append(frac, False)):
                    if v and st_ is None:
                        st_ = k
                    elif not v and st_ is not None:
                        runs.append((st_, k)); st_ = None
                if runs:
                    r0, r1 = max(runs, key=lambda r: min(r[1] + y0_, yb) - max(r[0] + y0_, ya))
                    if r1 - r0 >= 3.4 * Z:  # דפוס חיוור: רק ה"גג" עובר את הסף — נשארים עם פס הרכיב כולו
                        ta, tb = y0_ + r0, y0_ + r1
            lines.append({
                "x0": clip.x0 + xa / Z, "x1": clip.x0 + xb / Z,
                "top": clip.y0 + ta / Z, "base": clip.y0 + tb / Z, "xh": (tb - ta) / Z,
            })
    # בפיסה צרה (ליד קצה שורה/רווח רחב) צפיפות גוף האות יורדת מתחת לסף והליבה נקרעת ל"גג" ו"בסיס":
    # שני שברים דקים זה מעל זה (מרחק < גוף אות) מתאחדים חזרה לשורה אחת
    merged = True
    while merged:
        merged = False
        thin = [l for l in lines if l["xh"] < 3.4]
        for a_ in thin:
            for b_ in thin:
                if a_ is b_ or not (0 <= b_["top"] - a_["base"] <= 3.8):
                    continue
                ov = min(a_["x1"], b_["x1"]) - max(a_["x0"], b_["x0"])
                if ov >= 0.6 * min(a_["x1"] - a_["x0"], b_["x1"] - b_["x0"]) and b_["base"] - a_["top"] <= 9:
                    lines.remove(a_); lines.remove(b_)
                    lines.append({"x0": min(a_["x0"], b_["x0"]), "x1": max(a_["x1"], b_["x1"]),
                                  "top": a_["top"], "base": b_["base"], "xh": b_["base"] - a_["top"]})
                    merged = True
                    break
            if merged:
                break
    lines.sort(key=lambda l: (l["base"], -l["x1"]))
    if debug:
        from PIL import Image, ImageDraw
        rgb = np.full(ink.shape + (3,), 255, np.uint8)
        rgb[ink] = (0, 0, 0)
        rgb[gut] = (255, 235, 150)
        im = Image.fromarray(rgb); d = ImageDraw.Draw(im)
        for l in lines:
            col = (220, 0, 0) if l["xh"] >= debug.get("split", 5.0) else (0, 90, 220)
            d.rectangle([(l["x0"] - clip.x0) * Z, (l["top"] - clip.y0) * Z, (l["x1"] - clip.x0) * Z, (l["base"] - clip.y0) * Z], outline=col, width=2)
        im.save(debug["path"])
    def gutter_between(a, b):
        """גובה (בנק') הנהר הלבן הגבוה ביותר שעובר בין שתי פיסות שעל אותה שורה; 0 אם אין.
        נהר גבוה = מרווח עמודות אמיתי; נהר של 3–4 שורות יכול להיות רווחי מילים שהתיישרו במקרה."""
        l, r = (a, b) if a["x1"] <= b["x0"] else (b, a)
        ya, yb = max(a["top"], b["top"]), min(a["base"], b["base"])
        if yb <= ya:
            ya, yb = min(a["top"], b["top"]), max(a["base"], b["base"])
        ys_ = slice(int((ya - clip.y0) * Z), int((yb - clip.y0) * Z) + 1)
        xs_ = slice(int((l["x1"] - clip.x0) * Z), int((r["x0"] - clip.x0) * Z) + 1)
        g = gut[ys_, xs_]
        return float(vrun[ys_, xs_][g].max()) / Z if g.any() else 0.0
    return lines, gutter_between


if __name__ == "__main__":
    import sys, collections
    pdf, pg, fL, fR, yt, yb, out = sys.argv[1], int(sys.argv[2]), *map(float, sys.argv[3:7]), sys.argv[7]
    ls, _ = find_lines(fitz.open(pdf)[pg - 1], fL, fR, yt, yb, debug={"path": out})
    print(len(ls), "lines")
    print("x-heights:", sorted(collections.Counter(round(l["xh"] * 2) / 2 for l in ls).items()))
