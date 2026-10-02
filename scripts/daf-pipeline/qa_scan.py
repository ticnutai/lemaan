# -*- coding: utf-8 -*-
"""
בדיקת איכות מול הסריקה — בלי OCR: משווים את הדיו של הדף שלנו (צילום מסך מהאפליקציה)
לדיו של העמוד הסרוק, פיקסל מול פיקסל ברמת השורה.

לכל עמוד:
  match  — אחוז שטח הטקסט (אריחים של 24×24 נק') שבו השורות שלנו יושבות על שורות הדפוס
  corr   — מתאם כללי בין מפת הדיו שלנו למפת הדיו של הסריקה
  + תמונת שכבות: אדום = רק בדפוס, כחול = רק אצלנו, שחור = חופף

שימוש: python qa_scan.py <pdf> <Tractate> <עמוד-PDF-של-ב.> <2a,2b,...> <outDir> [--no-shot]
(דורש שרת פיתוח רץ על 5173)
"""
import sys, os, json, gzip, subprocess
import fitz, numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "public")
V_L, V_W, V_TOP = 121.0, 435.0, 33.0


def box_x(a, n):
    """החלקה אופקית (ממוצע נע ברוחב n) — כדי להשוות שורות ולא צורות אותיות."""
    c = np.cumsum(np.pad(a, ((0, 0), (n // 2 + 1, n // 2)), mode="edge"), axis=1)
    return (c[:, n:] - c[:, :-n]) / n


def compare(page, lay, shot_path, out_png=None):
    fL, fR, fTop = lay["src"]
    s = V_W / (fR - fL)
    bottom_u = max(sl["t"] + sl["h"] for sl in lay["slabs"])
    yB = fTop + (bottom_u - V_TOP) / s
    Wp, Hp = int(round(fR - fL)), int(round(yB - fTop))
    # סריקה: 4 פיקסלים לנקודה
    Z = 4
    pix = page.get_pixmap(matrix=fitz.Matrix(Z, Z), colorspace=fitz.csGRAY, clip=fitz.Rect(fL, fTop, fL + Wp, fTop + Hp))
    scan = (np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width) < 140).astype(np.float32)
    # שלנו: מהצילום — חיתוך לאותו אזור והבאה לאותה רזולוציה
    img = Image.open(shot_path).convert("L")
    ppu = img.width / lay["page"]["w"]  # פיקסלים ליחידת עמוד
    x0, y0 = V_L * ppu, V_TOP * ppu
    x1, y1 = (V_L + Wp * s) * ppu, (V_TOP + Hp * s) * ppu
    ours_img = img.crop((int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))))
    ours_img = ours_img.point(lambda v: 255 if v < 170 else 0).resize((scan.shape[1], scan.shape[0]), Image.BOX)
    ours = np.asarray(ours_img, dtype=np.float32) / 255
    # מפות דיו: תא = 1 נק' גובה (רבע שורה), מוחלק 10 נק' לרוחב
    def dens(a):
        h, w = a.shape[0] // Z, a.shape[1] // Z
        d = a[: h * Z, : w * Z].reshape(h, Z, w, Z).mean(axis=(1, 3))
        return box_x(d, 10)
    ds, do = dens(scan), dens(ours)
    corr = float(np.corrcoef(ds.ravel(), do.ravel())[0, 1])
    # אריחים: איפה השורות שלנו יושבות על שורות הדפוס
    T = 24
    good = total = 0
    bad_tiles = []
    for ty in range(0, ds.shape[0] - T + 1, T):
        for tx in range(0, ds.shape[1] - T + 1, T):
            a, b = ds[ty:ty + T, tx:tx + T].ravel(), do[ty:ty + T, tx:tx + T].ravel()
            if a.mean() < 0.02 and b.mean() < 0.02:
                continue  # ריק בשניהם
            total += 1
            # סובלנות של נקודה אחת למעלה/למטה (עשירית שורה): ההבדל בין הגופן לאותיות הדפוס, לא טעות מיקום
            c = 0.0
            for dy in (-1, 0, 1):
                if 0 <= ty + dy and ty + dy + T <= do.shape[0]:
                    b = do[ty + dy:ty + dy + T, tx:tx + T].ravel()
                    if a.std() > 1e-6 and b.std() > 1e-6:
                        c = max(c, float(np.corrcoef(a, b)[0, 1]))
            if c >= 0.5:
                good += 1
            else:
                bad_tiles.append((tx, ty))
    # היסט אנכי שיורי לכל זרם: קו הבסיס (תחתית גוף האותיות) של כל שורה אצלנו מול אותה שורה בדפוס.
    # נמדד באותה שיטה בשתי התמונות, ולכן לא תלוי בהבדלי עובי/צורה בין הגופן לדפוס.
    def baselines(a):
        prof = a.mean(axis=1)
        on = prof >= 0.3 * np.percentile(prof, 90)
        # גוף האות דליל בין ה"גג" ל"בסיס" — סוגרים פערים של עד 3 נק' כדי לקבל קו בסיס אחד לשורה
        last, gap = None, 3 * Z
        for k in np.where(on)[0]:
            if last is not None and k - last <= gap:
                on[last:k] = True
            last = k
        return [k for k in range(1, len(on)) if on[k - 1] and not on[k]]
    shifts = {}
    for name, test in (("gemara", lambda sl: sl["s"] == "gemara"), ("side", lambda sl: sl["s"] != "gemara")):
        d = []
        for sl in lay["slabs"]:
            if not test(sl) or len(sl.get("lines") or []) < 6:
                continue
            xa, xb = max(0, int((sl["l"] - V_L) / s * Z)), int((sl["l"] + sl["w"] - V_L) / s * Z)
            ya, yb = int((sl["t"] - V_TOP) / s * Z), int((sl["t"] + sl["h"] - V_TOP) / s * Z)
            ya, yb = max(0, ya - 4 * Z), min(scan.shape[0], yb + 4 * Z)
            bs, bo = baselines(scan[ya:yb, xa:xb]), baselines(ours[ya:yb, xa:xb])
            for y in bo:
                near = min(bs, key=lambda v: abs(v - y), default=None)
                if near is not None and abs(near - y) <= 4 * Z:
                    d.append((y - near) / Z)
        if d:
            shifts[name] = round(float(np.median(d)), 2)  # חיובי = שלנו נמוך מדי
    if out_png:
        rgb = np.full(scan.shape + (3,), 255, dtype=np.float32)
        rgb[..., 1] -= 255 * np.maximum(scan, ours); rgb[..., 2] -= 255 * scan; rgb[..., 0] -= 255 * ours
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((scan.shape[1] // 2, scan.shape[0] // 2), Image.LANCZOS).save(out_png)
    return {"match": round(good / max(1, total), 3), "corr": round(corr, 3), "tiles": total, "bad": len(bad_tiles), "shift": shifts}


def main():
    pdf, tractate, first, amudim, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4].split(","), sys.argv[5]
    os.makedirs(out, exist_ok=True)
    if "--no-shot" not in sys.argv:
        subprocess.run(["node", os.path.join(HERE, "shot.mjs"), tractate, out, ",".join(amudim)], check=True)
    lays = json.loads(gzip.decompress(open(f"{ROOT}/tzurat/print/{tractate.lower()}.json.gz", "rb").read()))
    keys = list(json.loads(gzip.decompress(open(f"{ROOT}/shas/{tractate}.json.gz", "rb").read()))["amudim"])
    doc = fitz.open(pdf)
    res = {}
    for a in amudim:
        r = compare(doc[first - 1 + keys.index(a)], lays[a], f"{out}/o-{a}.png", f"{out}/overlay-{a}.png")
        res[a] = r
        print(a, json.dumps(r), flush=True)
    return res


if __name__ == "__main__":
    main()
