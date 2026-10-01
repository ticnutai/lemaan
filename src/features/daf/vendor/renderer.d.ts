export interface DafOptions {
  contentWidth?: string;
  mainWidth?: string;
  padding?: { vertical?: string; horizontal?: string };
  fontFamily?: { main?: string; inner?: string; outer?: string };
  direction?: "rtl" | "ltr";
  fontSize?: { main?: string; side?: string };
  lineHeight?: { main?: string; side?: string };
}
export interface DafRenderer {
  render(main: string, inner: string, outer: string, amud?: "a" | "b", linebreak?: string): void;
  amud: string;
}
export default function dafRenderer(el: string | HTMLElement, options?: DafOptions): DafRenderer;
