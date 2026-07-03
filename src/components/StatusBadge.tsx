import type { BookStatus } from "@/lib/types";
import type { Translator } from "@/lib/i18n";

const STYLES: Record<BookStatus, string> = {
  available: "bg-emerald-100 text-emerald-700",
  reading: "bg-amber-100 text-amber-700",
};

export function StatusBadge({ status, t }: { status: BookStatus; t: Translator }) {
  return <span className={`chip ${STYLES[status]}`}>{t(`status.${status}`)}</span>;
}
