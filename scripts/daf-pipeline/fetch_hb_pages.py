# -*- coding: utf-8 -*-
"""
סריקה חלופית ממאגר היברובוקס, עמוד-עמוד, למסכת שהסריקה שלה באוצריא לא שמישה.
נידה: בסריקה של אוצריא קנה המידה משתנה מעמוד לעמוד ושכבת הטקסט נותנת גדלי גופן שגויים.
בהיברובוקס כל עמוד הוא קובץ נפרד, ו-n=1 הוא ב. (n = מספר העמוד במסכת).
שכבת הטקסט שם בקידוד ישן — hb_pdf.page_words מפענח אותה.

שימוש:  python fetch_hb_pages.py Niddah 36099 <out.pdf>
אחר כך: python run_tractate.py Niddah --pdf <out.pdf>
"""
import sys, os, time, urllib.request
import fitz
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run_tractate as RT

URL = "https://beta.hebrewbooks.org/pagefeed/hebrewbooks_org_{book}_{n}.pdf"


def main():
    slug, book, out = sys.argv[1], sys.argv[2], sys.argv[3]
    n_amudim = RT.meta_of(slug)["amud_count"]
    cache = os.path.join(os.path.dirname(os.path.abspath(out)), f"hb-{book}")
    os.makedirs(cache, exist_ok=True)
    doc = fitz.open()
    for n in range(1, n_amudim + 1):
        p = os.path.join(cache, f"p{n}.pdf")
        if not (os.path.exists(p) and open(p, "rb").read(5) == b"%PDF-"):
            req = urllib.request.Request(URL.format(book=book, n=n), headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=120).read()
            if not data.startswith(b"%PDF-"):
                raise SystemExit(f"page {n}: not a PDF")
            open(p, "wb").write(data)
            time.sleep(1)  # בנימוס כלפי האתר
        doc.insert_pdf(fitz.open(p))
    doc.save(out, garbage=3, deflate=True)
    print(f"{slug}: {len(doc)} pages → {out}")


if __name__ == "__main__":
    main()
