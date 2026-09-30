import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import type { Card } from "../features/study/types";

const today = () => new Date().toISOString().slice(0, 10);

/** Export questions to a Word document (RTL). */
export async function exportQuestionsDocx(cards: Card[], title: string): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      bidirectional: true,
      children: [new TextRun({ text: title, rightToLeft: true })],
    }),
  ];

  cards.forEach((card, i) => {
    children.push(
      new Paragraph({
        bidirectional: true,
        spacing: { before: 240 },
        children: [
          new TextRun({ text: `${i + 1}. ${card.question}`, bold: true, rightToLeft: true }),
          ...(card.masechta
            ? [new TextRun({ text: `  (${card.masechta}${card.daf ? ` · דף ${card.daf}` : ""})`, size: 18, color: "888888", rightToLeft: true })]
            : []),
        ],
      })
    );
    if (card.options.length > 1) {
      card.options.forEach((opt, j) => {
        const correct = card.correctIndices.includes(j);
        children.push(
          new Paragraph({
            bidirectional: true,
            indent: { start: 360 },
            children: [new TextRun({ text: `${correct ? "✓" : "○"} ${opt}`, bold: correct, rightToLeft: true })],
          })
        );
      });
    }
    if (card.answer) {
      children.push(
        new Paragraph({
          bidirectional: true,
          indent: { start: 360 },
          children: [new TextRun({ text: `תשובה: ${card.answer}`, italics: true, rightToLeft: true })],
        })
      );
    }
  });

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title}-${today()}.docx`);
}

/** Export questions to an Excel spreadsheet. */
export function exportQuestionsXlsx(cards: Card[], title: string): void {
  const rows = cards.map((c, i) => ({
    "#": i + 1,
    "שאלה": c.question,
    "תשובה": c.answer,
    "אפשרויות": c.options.join(" | "),
    "תשובות נכונות": c.correctIndices.map((x) => x + 1).join(","),
    "מסכת": c.masechta ?? "",
    "דף": c.daf ?? "",
    "חזרות": c.stats.totalReviews,
    "אחוז הצלחה": c.stats.totalReviews ? Math.round((c.stats.correct / c.stats.totalReviews) * 100) + "%" : "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 60 }, { wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "שאלות");
  XLSX.writeFile(wb, `${title}-${today()}.xlsx`);
}
