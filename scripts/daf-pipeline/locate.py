# -*- coding: utf-8 -*-
"""
שלב 2: איתור עמוד הסריקה של כל עמוד גמרא לפי חפיפת מילים עם הטקסט שלנו,
ובדיקת איכות ה-OCR לכל זרם (גמרא / רש"י / תוספות).
"""
import re, sys, json, gzip
from collections import Counter

NIKUD = re.compile(r"[֑-ׇ]")
TAGS = re.compile(r"<[^>]+>")
PUNCT = re.compile(r"[^א-ת\s]")

def norm_words(text):
    t = TAGS.sub(" ", text)
    t = NIKUD.sub("", t)
    t = PUNCT.sub(" ", t)
    return [w for w in t.split() if len(w) > 1]

def load_amud(masechet_file, key):
    d = json.load(gzip.open(masechet_file, "rt", encoding="utf-8"))
    a = d["amudim"][key]
    com = {c["key"]: c["segments"] for c in a["commentaries"]}
    return {"gemara": a["gemara"], "rashi": com.get("rashi", []), "tosafot": com.get("tosafot", [])}

def page_words(page):
    return [w["t"] for ln in page["lines"] for w in ln]

def overlap_score(ref_words, page_bag):
    """חלק מילות הייחוס (ייחודיות, אורך>=3) שמופיעות בעמוד הסריקה."""
    ref = set(w for w in ref_words if len(w) >= 3)
    if not ref:
        return 0.0
    hit = sum(1 for w in ref if w in page_bag)
    return hit / len(ref)

if __name__ == "__main__":
    pages_file, masechet_file = sys.argv[1], sys.argv[2]
    keys = sys.argv[3:]
    pages = json.load(gzip.open(pages_file, "rt", encoding="utf-8"))
    bags = [Counter(norm_words(" ".join(page_words(p)))) for p in pages]
    for key in keys:
        amud = load_amud(masechet_file, key)
        g = norm_words(" ".join(amud["gemara"]))
        scores = [(overlap_score(g, bags[i]), i) for i in range(len(pages))]
        scores.sort(reverse=True)
        best, idx = scores[0]
        print(f"{key}: scan page {idx} (gemara overlap {best:.2f}; runner-up {scores[1][0]:.2f} @ {scores[1][1]})")
        for stream in ("rashi", "tosafot"):
            ws = norm_words(" ".join(amud[stream]))
            print(f"   {stream}: overlap {overlap_score(ws, bags[idx]):.2f} ({len(ws)} words)")
