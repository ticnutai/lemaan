# -*- coding: utf-8 -*-
"""
שרת מקומי לכלי הסקירה: מגיש את דף הסקירה ואת התמונות, ושומר את הסימונים שלך לקובץ
(~/lemaan-data/review/<מסכת>/notes.json) — משם אני קורא אותם.

שימוש: python review_server.py [port=8790]  →  http://localhost:8790
"""
import sys, os, json, http.server, urllib.parse, subprocess, threading

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.expanduser("~"), "lemaan-data", "review")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
OVR = os.path.join(HERE, "overrides")  # תיקונים ידניים קבועים — חלק מהריפו, חלים בכל בנייה
_lock = threading.Lock()


def safe(name):
    return "".join(c for c in name if c.isalnum() or c in "_-")


def tractate_data(slug):
    p = os.path.join(ROOT, safe(slug), "data.json")
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _notes_path(self, qs):
        t = urllib.parse.parse_qs(qs).get("tractate", [""])[0]
        t = "".join(c for c in t if c.isalnum() or c in "_-")
        return os.path.join(ROOT, t, "notes.json") if t else None

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path in ("/", "/index.html"):
            body = open(os.path.join(HERE, "review_viewer.html"), "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if u.path == "/api/tractates":
            ts = sorted(d for d in os.listdir(ROOT) if os.path.exists(os.path.join(ROOT, d, "data.json")))
            return self._json(ts)
        if u.path == "/api/notes":
            p = self._notes_path(u.query)
            return self._json(json.load(open(p, encoding="utf-8")) if p and os.path.exists(p) else {})
        if u.path == "/api/overrides":
            d = tractate_data(urllib.parse.parse_qs(u.query).get("tractate", [""])[0])
            p = os.path.join(OVR, safe(d["tractate"]) + ".json") if d else None
            return self._json(json.load(open(p, encoding="utf-8")) if p and os.path.exists(p) else {})
        return super().do_GET()

    def end_headers(self):
        if self.path.endswith(".json"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == "/api/override":
            return self.override(u)
        if u.path == "/api/rebuild":
            return self.rebuild(u)
        if u.path != "/api/notes":
            return self._json({"error": "not found"}, 404)
        p = self._notes_path(u.query)
        if not p:
            return self._json({"error": "tractate"}, 400)
        n = int(self.headers.get("Content-Length", 0))
        notes = json.loads(self.rfile.read(n).decode("utf-8"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(notes, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return self._json({"ok": True, "saved": sum(len(v) for v in notes.values())})


    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}")

    def override(self, u):
        """תיקון שורה: {tractate, amud, s, k, kind: "end"|"start", word} — בלי word: מחיקת התיקון."""
        b = self._body()
        d = tractate_data(b.get("tractate", ""))
        kind = b.get("kind")
        if (not d or not b.get("amud") or b.get("s") not in ("gemara", "rashi", "tosafot")
                or not isinstance(b.get("k"), int) or kind not in ("end", "start")):
            return self._json({"error": "bad request"}, 400)
        os.makedirs(OVR, exist_ok=True)
        p = os.path.join(OVR, safe(d["tractate"]) + ".json")
        with _lock:
            o = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
            lst = [x for x in o.get(b["amud"], []) if not (x["s"] == b["s"] and x["k"] == b["k"] and kind in x)]
            word = str(b.get("word") or "").strip()
            if word:
                lst.append({"s": b["s"], "k": b["k"], kind: word})
            if lst:
                o[b["amud"]] = lst
            else:
                o.pop(b["amud"], None)
            json.dump(dict(sorted(o.items())), open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        return self._json({"ok": True, "overrides": o.get(b["amud"], [])})

    def rebuild(self, u):
        """בנייה מחדש של עמוד אחד (review.py) — כדי לראות מיד את התיקון."""
        b = self._body()
        d = tractate_data(b.get("tractate", ""))
        if not d or not d.get("pdf") or not b.get("amud"):
            return self._json({"error": "no pdf path in data.json — rebuild once from the command line"}, 400)
        r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(HERE, "review.py"), d["pdf"], d["tractate"], b["amud"]],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600)
        tail = (r.stdout + r.stderr).strip().splitlines()[-6:]
        return self._json({"ok": r.returncode == 0, "log": tail}, 200 if r.returncode == 0 else 500)


if __name__ == "__main__":
    os.makedirs(ROOT, exist_ok=True)
    print(f"review: http://localhost:{PORT}  (data: {ROOT})", flush=True)
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
