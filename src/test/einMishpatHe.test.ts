// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { gematriya as gim } from "@hebcal/core";
import { translateRef } from "../features/daf/einMishpat";

describe("עין משפט בעברית", () => {
  it("מספרים באותיות עם גרש וגרשיים", () => {
    expect(gim(3)).toBe("ג׳");
    expect(gim(11)).toBe("י״א");
    expect(gim(15)).toBe("ט״ו");
    expect(gim(16)).toBe("ט״ז");
    expect(gim(498)).toBe("תצ״ח");
  });

  it("הדוגמאות שהאתר 'למען' בדק", () => {
    expect(translateRef("Mishneh Torah", "Mishneh Torah, Marriage 11:3-4")).toBe("הלכות אישות פרק י״א הלכה ג׳–ד׳");
    expect(translateRef("Shulchan Arukh", "Shulchan Arukh, Orach Chayim 498:18-499")).toBe("אורח חיים סימן תצ״ח סעיף י״ח עד סימן תצ״ט");
    expect(translateRef("Sefer Mitzvot Gadol", "Sefer Mitzvot Gadol, Positive Commandments 43")).toBe("עשין מ״ג");
    expect(translateRef("Tur", "Tur, Even HaEzer 26")).toBe("אבן העזר סימן כ״ו");
  });

  it("אף הפניה בקובצי עין משפט לא נשארת באנגלית", () => {
    const dir = path.resolve(__dirname, "../../public/ein-mishpat");
    let total = 0;
    const english: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json.gz"))) {
      const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString("utf8")) as
        Record<string, Record<string, string[]>>;
      for (const page of Object.values(data)) {
        for (const [book, refs] of Object.entries(page)) {
          for (const ref of refs) {
            total++;
            const he = translateRef(book, ref);
            if (/[A-Za-z]/.test(he) && english.length < 10) english.push(`${ref} → ${he}`);
          }
        }
      }
    }
    expect(total).toBe(53190);
    expect(english).toEqual([]);
  });
});
