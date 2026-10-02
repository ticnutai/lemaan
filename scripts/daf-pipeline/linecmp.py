# השוואת שורות: לכל שורה בדפוס (OCR) — האם השורה שלנו מתחילה ומסתיימת באותה מילה
import sys, fitz, json, re, os
sys.path.insert(0, 'scripts/daf-pipeline')
import hb_pdf as H
from rapidfuzz import fuzz
amudim = sys.argv[1].split(',')
shas = H.load(H.ROOT + '/shas/Megillah.json.gz'); ws = H.load(H.ROOT + '/shas-ws/Megillah.json.gz'); keys = list(shas)
com = lambda k, c: next((x['segments'] for x in shas[k]['commentaries'] if x['key'] == c), [])
doc = fitz.open(os.environ.get('PDF', 'C:/Users/jj121/Downloads/מגילה.pdf'))
FIRST = int(os.environ.get('FIRST', '2'))
rec = []
orig = H.anchor
def spy(lines, ref, bounds=None, ext=None):
    out = orig(lines, ref, bounds, ext)
    rec.append((lines, out[0]))
    return out
H.anchor = spy
f = lambda t: H.fold(H.norm_token(re.sub('<[^>]+>', '', t).lstrip(H.DH)))
tot = {}
for k in amudim:
    rec.clear()
    refs = H.make_refs(shas, ws, keys, k)
    try:
        lay, rep = H.build_page(doc[keys.index(k) + FIRST - 1], k, refs)
    except Exception as e:
        print('FAILED', k, repr(e)[:60]); continue
    # רק הרשומה האחרונה לכל זרם נבחרה (בזרם עם כמה סדרי קריאה) — גמרא ראשונה, ואז לפי סדר
    streams = ['gemara'] + [s for s in ('rashi', 'tosafot') if s in rep]
    chosen = [rec[0]]
    i = 1
    for s in streams[1:]:
        # מועמדים לאותו זרם רצופים; בוחרים את זה עם הכיסוי הגבוה (כמו הקוד)
        cands = []
        while i < len(rec) and (not cands or len(rec[i][0]) == len(cands[0][0]) or True):
            cands.append(rec[i]); i += 1
            if i < len(rec) and sum(len(l) for l in rec[i][0]) != sum(len(l) for l in cands[0][0]): break
        chosen.append(max(cands, key=lambda c: sum(1 for t in c[1] if t)))
    for s, (lines, texts) in zip(streams, chosen):
        n = st_ = en = 0
        bad = []
        for ln, t in zip(lines, texts):
            o = [f(w['t']) for w in ln]; t = [f(x) for x in t]
            if len(o) < 3 or not t: continue
            # רק שורות שה-OCR שלהן קריא (רוב המילים מוכרות) — אחרת אין למה להשוות
            reftxt = set(t) | set(f(x) for x in refs[s][0])
            if sum(1 for x in o if any(fuzz.ratio(x, y) >= 75 for y in t)) < 0.6 * len(o): continue
            n += 1
            okS = fuzz.ratio(o[0], t[0]) >= 70 or fuzz.ratio(' '.join(o[:2]), ' '.join(t[:2])) >= 75
            okE = fuzz.ratio(o[-1], t[-1]) >= 70 or fuzz.ratio(' '.join(o[-2:]), ' '.join(t[-2:])) >= 75
            st_ += okS; en += okE
            if s == 'gemara' and not okE:
                row = [k, ' '.join(w['t'] for w in ln), ' '.join(re.sub('<[^>]+>', '', x) for x in texts[lines.index(ln)])]
                open(os.environ.get('DUMP', 'NUL'), 'a', encoding='utf-8').write('\t'.join(row) + '\n')
            if not (okS and okE) and len(bad) < 4: bad.append((' '.join(w['t'] for w in ln), ' '.join(texts[lines.index(ln)])))
        a = tot.setdefault(s, [0, 0, 0]); a[0] += n; a[1] += st_; a[2] += en
        if len(amudim) == 1:
            print(f'{s}: {n} שורות | התחלה זהה {st_}/{n} | סוף זהה {en}/{n}')
            for o, t in bad: print('   דפוס:', o[:70], '\n   שלנו:', re.sub('<[^>]+>','',t)[:70])
if len(amudim) > 1:
    for s, (n, a, b) in tot.items(): print(f'{s}: {n} שורות | התחלה זהה {a/n:.1%} | סוף זהה {b/n:.1%}')
