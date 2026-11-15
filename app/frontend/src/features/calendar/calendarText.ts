import { MONTHS_LONG as MONTHS_LONG_EN, MONTHS_SHORT as MONTHS_SHORT_EN } from "../../lib/format";

/**
 * Language of the month names in the calendar (axis, month buttons, cell detail, screen-reader labels).
 *
 * English, like the rest of the app, the repo and the submission (the challenge requires English in every linked
 * material). Portuguese names stay below as a switch: set this to "pt-BR" to show them again.
 */
export const MONTH_LOCALE: "pt-BR" | "en" = "en";

const MONTHS_SHORT_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"] as const;
const MONTHS_LONG_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

const SHORT = { "pt-BR": MONTHS_SHORT_PT, en: MONTHS_SHORT_EN } as const;
const LONG = { "pt-BR": MONTHS_LONG_PT, en: MONTHS_LONG_EN } as const;

/** "Set" (or "Sep"): month 1..12. */
export function monthShort(month: number): string {
  return SHORT[MONTH_LOCALE][month - 1];
}

/** "Setembro" (or "September"): month 1..12. */
export function monthLong(month: number): string {
  return LONG[MONTH_LOCALE][month - 1];
}
