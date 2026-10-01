# -*- coding: utf-8 -*-
"""השוואה לתשובון (ברכות): כמה משורות הגמרא של הדפוס שוחזרו במדויק."""
import json, sys, re
from rapidfuzz import fuzz
NIK = re.compile(r"[֑-ׇ]")
def norm(t): return re.sub(r"[^א-ת ]", "", NIK.sub("", t)).split()
ours = json.load(open(sys.argv[1], encoding='utf-8'))
truth = json.load(open(sys.argv[2], encoding='utf-8'))
for key in ours:
    if key not in truth: continue
    tl = [norm(l['t']) for s in truth[key]['slabs'] if s['s']=='gemara' for l in s['lines']]
    ol = [norm(l['text']) for l in ours[key]['lines'] if l['s']=='gemara']
    exact = sum(1 for t in tl if t in ol)
    near = sum(1 for t in tl if any(fuzz.ratio(' '.join(t), ' '.join(o)) >= 90 for o in ol))
    print(f"{key}: truth {len(tl)} lines | ours {len(ol)} | exact {exact} ({exact/len(tl):.0%}) | >=90% similar {near} ({near/len(tl):.0%})")
