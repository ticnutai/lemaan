# בונה חבילת שאלות "שולחן ערוך אורח חיים – הלכות שבת" מתוך קובץ החילוץ (sk_all.json).
# הפלט: public/data/packs/sa-oc-shabbat.json — קטגוריות (טור › אורח חיים › הלכות שבת › סימן › סעיף) ושאלות.
# המזהים קבועים (uuid5 לפי סימן/סעיף/מספר) — הרצה חוזרת מחליפה את אותן שאלות ולא מוסיפה כפולות.
import json
import sys
import uuid

extract_path, library_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
items = json.load(open(extract_path, encoding="utf-8"))
seed = json.load(open(library_path, encoding="utf-8"))["seed"]
cats = seed["categories"]
by_id = {c["id"]: c for c in cats}
kids = lambda pid: [c for c in cats if c["parentId"] == pid]

VAL = dict(zip("אבגדהוזחטיכלמנסעפצקרשת", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400]))
gem = lambda s: sum(VAL.get(ch, 0) for ch in s)

tur = next(c for c in cats if c["parentId"] is None and c["name"] == "טור")
oc = next(c for c in kids(tur["id"]) if c["name"] == "אורח חיים")
siman_by_num = {}
for hal in kids(oc["id"]):
    for s in kids(hal["id"]):
        siman_by_num.setdefault(gem(s["name"].replace("סימן", "")), s)

NS = uuid.UUID("5b8a3c1e-6d2f-4e7a-9c1b-2f3e4d5a6b7c")
uid = lambda key: str(uuid.uuid5(NS, key))

out_cats = {}


def keep(c):
    while c and c["id"] not in out_cats:
        out_cats[c["id"]] = {"id": c["id"], "name": c["name"], "parentId": c["parentId"], "sortOrder": c.get("sortOrder", 0)}
        c = by_id.get(c["parentId"]) if c["parentId"] else None


cards = []
counter = {}
for it in items:
    n = gem(it["siman"])
    siman = siman_by_num[n]
    keep(siman)
    seif = it["seif"]
    seif_id = uid(f"seif:{n}:{seif}")
    siman_label = siman["name"].replace("סימן ", "")
    if seif_id not in out_cats:
        out_cats[seif_id] = {"id": seif_id, "name": f"סימן {siman_label} · סעיף {seif}׳", "parentId": siman["id"], "sortOrder": gem(seif)}
    k = counter[(n, seif)] = counter.get((n, seif), 0) + 1
    cards.append({
        "id": uid(f"card:{n}:{seif}:{k}"),
        "type": "flashcard",
        "question": it["question"].strip(),
        "answer": it["answer"].strip(),
        "categoryId": seif_id,
        "tags": ["source:pesach-eliyahu"],
    })

# סדר הסימנים לפי המספר (במאגר הם לא ממוינים)
for c in out_cats.values():
    if c["parentId"] in {h["id"] for h in kids(oc["id"])}:
        c["sortOrder"] = gem(c["name"].replace("סימן", ""))

pack = {
    "id": "sa-oc-shabbat",
    "version": 1,
    "title": "שולחן ערוך אורח חיים – הלכות שבת (פתח אליהו)",
    "categories": list(out_cats.values()),
    "cards": cards,
}
json.dump(pack, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(pack["categories"]), len(cards))
