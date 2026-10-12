// "עין משפט" — מה נפסק להלכה מכל עמוד: רמב"ם, סמ"ג, טור ושולחן ערוך.
// הנתונים: public/ein-mishpat/<מסכת>.json.gz (מקור משותף עם אתר הגמרא; ייצוא של קישורי ספריא).
// ההפניות במקור באנגלית — כאן הן מתורגמות לעברית, עם מספרים באותיות.
import { gematriya } from "@hebcal/core";
import { fetchGzJson } from "../../lib/gzJson";

/** קובץ של מסכת: עמוד ("2a") ← ספר ← רשימת הפניות. */
type EinMishpatFile = Record<string, Record<string, string[]>>;

export interface EinMishpatGroup {
  book: string; // שם הספר בעברית
  refs: string[]; // ההפניות בעברית
}

// ---------- שמות הספרים, בסדר ההצגה ----------
const BOOK_HE: Record<string, string> = {
  "Mishneh Torah": 'רמב"ם',
  "Sefer Mitzvot Gadol": 'סמ"ג',
  Tur: "טור",
  "Shulchan Arukh": "שולחן ערוך",
};
const BOOK_ORDER = ["Mishneh Torah", "Sefer Mitzvot Gadol", "Tur", "Shulchan Arukh"];

// ---------- הלכות הרמב"ם (שמות ספריא ← שם ההלכות) ----------
const MT_HE: Record<string, string> = {
  Sabbath: "שבת",
  "Forbidden Intercourse": "איסורי ביאה",
  Marriage: "אישות",
  "Sacrificial Procedure": "מעשה הקרבנות",
  "Sacrifices Rendered Unfit": "פסולי המוקדשין",
  "Forbidden Foods": "מאכלות אסורות",
  Divorce: "גירושין",
  Sales: "מכירה",
  "Creditor and Debtor": "מלוה ולוה",
  "Robbery and Lost Property": "גזילה ואבידה",
  "The Sanhedrin and the Penalties within Their Jurisdiction": "סנהדרין והעונשין המסורין להם",
  "Heave Offerings": "תרומות",
  "Damages to Property": "נזקי ממון",
  "Ritual Slaughter": "שחיטה",
  Vows: "נדרים",
  "Other Sources of Defilement": "שאר אבות הטומאות",
  "Prayer and the Priestly Blessing": "תפילה וברכת כהנים",
  "Offerings for Unintentional Transgressions": "שגגות",
  "Rest on a Holiday": "שביתת יום טוב",
  "Levirate Marriage and Release": "יבום וחליצה",
  Nazariteship: "נזירות",
  "Foreign Worship and Customs of the Nations": "עבודה זרה וחוקות הגויים",
  Mourning: "אבל",
  Oaths: "שבועות",
  Blessings: "ברכות",
  "Admission into the Sanctuary": "ביאת המקדש",
  "Appraisals and Devoted Property": "ערכין וחרמין",
  "Ownerless Property and Gifts": "זכייה ומתנה",
  "Daily Offerings and Additional Offerings": "תמידין ומוספין",
  "Murderer and the Preservation of Life": "רוצח ושמירת נפש",
  "Paschal Offering": "קרבן פסח",
  "Shofar, Sukkah and Lulav": "שופר וסוכה ולולב",
  "Things Forbidden on the Altar": "איסורי מזבח",
  "Plaintiff and Defendant": "טוען ונטען",
  "First Fruits and other Gifts to Priests Outside the Sanctuary": "ביכורים ושאר מתנות כהונה שבגבולין",
  Testimony: "עדות",
  "Sabbatical Year and the Jubilee": "שמיטה ויובל",
  Trespass: "מעילה",
  "Vessels of the Sanctuary and Those Who Serve Therein": "כלי המקדש והעובדים בו",
  Eruvin: "עירובין",
  "Tefillin, Mezuzah and the Torah Scroll": "תפילין ומזוזה וספר תורה",
  Slaves: "עבדים",
  Hiring: "שכירות",
  Firstlings: "בכורות",
  "Those Who Defile Bed or Seat": "מטמאי משכב ומושב",
  "Defilement by a Corpse": "טומאת מת",
  Theft: "גניבה",
  "One Who Injures a Person or Property": "חובל ומזיק",
  "Defilement of Foods": "טומאת אוכלין",
  "Leavened and Unleavened Bread": "חמץ ומצה",
  "The Chosen Temple": "בית הבחירה",
  Neighbors: "שכנים",
  Vessels: "כלים",
  "Second Tithes and Fourth Year's Fruit": "מעשר שני ונטע רבעי",
  "Torah Study": "תלמוד תורה",
  Inheritances: "נחלות",
  "Service on the Day of Atonement": "עבודת יום הכפורים",
  "Kings and Wars": "מלכים ומלחמותיהם",
  "Woman Suspected of Infidelity": "סוטה",
  "Gifts to the Poor": "מתנות עניים",
  "Defilement by Leprosy": "טומאת צרעת",
  Tithes: "מעשרות",
  "Red Heifer": "פרה אדומה",
  Fasts: "תעניות",
  Substitution: "תמורה",
  "Immersion Pools": "מקואות",
  "Reading the Shema": "קריאת שמע",
  "Diverse Species": "כלאים",
  "Offerings for Those with Incomplete Atonement": "מחוסרי כפרה",
  "Human Dispositions": "דעות",
  Rebels: "ממרים",
  "Scroll of Esther and Hanukkah": "מגילה וחנוכה",
  Repentance: "תשובה",
  "Festival Offering": "חגיגה",
  "Sanctification of the New Month": "קידוש החודש",
  "Borrowing and Deposit": "שאלה ופקדון",
  Fringes: "ציצית",
  "Virgin Maiden": "נערה בתולה",
  "Sheqel Dues": "שקלים",
  "Agents and Partners": "שלוחין ושותפין",
  Circumcision: "מילה",
  "Rest on the Tenth of Tishrei": "שביתת עשור",
  "Foundations of the Torah": "יסודי התורה",
};

// ---------- חלקי הטור והשולחן ערוך ----------
const PART_HE: Record<string, string> = {
  "Orach Chayim": "אורח חיים",
  "Yoreh De'ah": "יורה דעה",
  "Even HaEzer": "אבן העזר",
  "Choshen Mishpat": "חושן משפט",
  "Even HaEzer, Seder HaGet": "אבן העזר, סדר הגט",
  "Even HaEzer, Seder Halitzah": "אבן העזר, סדר חליצה",
};

// ---------- סמ"ג ----------
const SMAG_HE: Record<string, string> = {
  "Positive Commandments": "עשין",
  "Negative Commandments": "לאוין",
  "Rabbinic Commandments, Laws of Mourning": "עשין דרבנן, הלכות אבלות",
  "Rabbinic Commandments, Laws of Eruvin": "עשין דרבנן, הלכות עירובין",
  "Rabbinic Commandments, Laws of Tisha B'Av": "עשין דרבנן, הלכות תשעה באב",
  "Rabbinic Commandments, Laws of Megillah": "עשין דרבנן, הלכות מגילה",
  "Rabbinic Commandments, Laws of Chanukah": "עשין דרבנן, הלכות חנוכה",
};

// ---------- מקורות נדירים (הפניה שלמה, בלי שם ספר מוכר) ----------
const OTHER_HE: Record<string, string> = {
  Psalms: "תהלים",
  "Rashi on Genesis": 'רש"י על בראשית',
  "Beur HaGra on Shulchan Arukh, Choshen Mishpat": 'ביאור הגר"א על שולחן ערוך, חושן משפט',
  "Birkat Hamazon, Hatov Vehametiv": "ברכת המזון, ברכת הטוב והמטיב",
  "Tractate Semachot": "מסכת שמחות",
  "Mishnah Peah": "משנה פאה",
  "Beit Yosef, Even HaEzer": "בית יוסף, אבן העזר",
  "Jerusalem Talmud Sotah": "ירושלמי סוטה",
  "Mishneh Torah, Positive Mitzvot": "מניין המצוות — מצוות עשה",
  "Mishneh Torah, Transmission of the Oral Law": "הקדמה (מסירת תורה שבעל פה)",
};

const num = (s: string) => gematriya(parseInt(s, 10));

/** פירוק "<שם> 12:3" ← ["<שם>", ["12","3"]]; טווח "12:3-4" ← סוף הטווח נשמר בנפרד. */
function split(ref: string): [string, string[], string | null] {
  const m = ref.match(/^(.*?)[\s,]+([\d:]+)(?:[-–]([\d:]+))?$/);
  return m ? [m[1].trim(), m[2].split(":"), m[3] ?? null] : [ref.trim(), [], null];
}

/**
 * סוף טווח: "11:3-4" ← הלכות ג׳–ד׳ באותו פרק; "498:18-499" ← עד סימן תצ"ט (מספר קרוב לפרק עצמו);
 * "3:2-4:5" ← עד פרק ד׳ הלכה ה׳.
 */
function rangeEnd(nums: string[], end: string | null, chapter: string, item: string): string {
  if (!end) return "";
  const e = end.split(":");
  if (e.length > 1) return ` עד ${chapter} ${num(e[0])} ${item} ${num(e[1])}`;
  const a = parseInt(nums[0], 10), c = parseInt(e[0], 10);
  if (nums.length > 1 && c > a && c - a <= 5 && c > parseInt(nums[1], 10)) return ` עד ${chapter} ${num(e[0])}`;
  return `–${num(e[0])}`;
}

/** הפניה אחת בעברית (בלי שם הספר, שמוצג ככותרת הקבוצה). */
export function translateRef(book: string, ref: string): string {
  const [name, nums, end] = split(ref);
  const rest = name.startsWith(book + ",") ? name.slice(book.length + 1).trim() : name;
  const tail = (chapter: string, item: string) => rangeEnd(nums, end, chapter, item);
  if (OTHER_HE[name]) return [OTHER_HE[name], ...nums.map(num)].join(" ") + tail("", "");
  if (book === "Mishneh Torah" && MT_HE[rest]) {
    const [a, b] = nums;
    return `הלכות ${MT_HE[rest]}${a ? ` פרק ${num(a)}` : ""}${b ? ` הלכה ${num(b)}` : ""}${tail("פרק", "הלכה")}`;
  }
  if ((book === "Shulchan Arukh" || book === "Tur") && PART_HE[rest]) {
    const [a, b] = nums;
    return `${PART_HE[rest]}${a ? ` סימן ${num(a)}` : ""}${b ? ` סעיף ${num(b)}` : ""}${tail("סימן", "סעיף")}`;
  }
  if (book === "Sefer Mitzvot Gadol" && SMAG_HE[rest]) return [SMAG_HE[rest], ...nums.map(num)].join(" ") + tail("", "");
  // לא מוכר — לפחות המספרים בעברית
  return [rest, ...nums.map(num)].join(" ") + tail("", "");
}

const cache = new Map<string, Promise<EinMishpatFile | null>>();
function load(masechet: string): Promise<EinMishpatFile | null> {
  if (!cache.has(masechet)) {
    cache.set(
      masechet,
      fetchGzJson<EinMishpatFile>(`${import.meta.env.BASE_URL}ein-mishpat/${masechet}.json.gz`).catch(() => null)
    );
  }
  return cache.get(masechet)!;
}

/** ההפניות לעמוד, מקובצות לפי ספר ובסדר: רמב"ם, סמ"ג, טור, שולחן ערוך, ואחר כך השאר. */
export async function einMishpatFor(masechet: string, amudKey: string): Promise<EinMishpatGroup[]> {
  const page = (await load(masechet))?.[amudKey];
  if (!page) return [];
  const books = Object.keys(page).sort((a, b) => {
    const ia = BOOK_ORDER.indexOf(a), ib = BOOK_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const groups: EinMishpatGroup[] = [];
  const other: string[] = [];
  for (const b of books) {
    const refs = [...new Set(page[b].map((r) => translateRef(b, r)))];
    if (BOOK_HE[b]) groups.push({ book: BOOK_HE[b], refs });
    else other.push(...refs);
  }
  if (other.length) groups.push({ book: "מקורות נוספים", refs: other });
  return groups;
}
