import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { importBooksFromSheetAction } from "@/app/actions";
import { AddBookForm } from "@/components/AddBookForm";

export default async function NewBookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();
  const sp = await searchParams;
  const importStatus = typeof sp.import === "string" ? sp.import : "";
  const importedCount = typeof sp.count === "string" ? sp.count : "0";
  const skippedCount = typeof sp.skipped === "string" ? sp.skipped : "0";

  if (!user) redirect("/login?next=/books/new");
  if (!activeGroup) redirect("/groups");

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold">{t("add.title")}</h1>
        <p className="mt-2 text-sm text-stone-600">{t("add.subtitle")}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="lg:order-2 lg:sticky lg:top-24">
          <form action={importBooksFromSheetAction} className="card space-y-3 p-4">
            <input type="hidden" name="group_id" value={activeGroup.id} />
            <div>
              <h2 className="text-base font-semibold">{t("import.title")}</h2>
              <p className="mt-1 text-sm text-stone-500">{t("import.hint")}</p>
            </div>
            {importStatus === "success" ? (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {t("import.success", { count: importedCount, skipped: skippedCount })}
              </p>
            ) : importStatus ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {t(`import.error.${importStatus}`)}
              </p>
            ) : null}
            <label className="label" htmlFor="sheet_url">
              {t("import.urlLabel")}
            </label>
            <input
              id="sheet_url"
              name="sheet_url"
              type="url"
              required
              placeholder={t("import.urlPlaceholder")}
              className="input"
            />
            <p className="text-xs text-stone-400">{t("import.columns")}</p>
            <button className="btn-secondary w-full">{t("import.submit")}</button>
          </form>
        </div>

        <div className="min-w-0 lg:order-1">
          <AddBookForm
            groupId={activeGroup.id}
            defaultZip={user.home_zip ?? ""}
            defaultLanguage={locale === "zh" ? "中文" : ""}
            labels={{
              isbnTitle: t("add.isbn.title"),
              isbnHint: t("add.isbn.hint"),
              isbnPlaceholder: t("add.isbn.placeholder"),
              scan: t("add.scan"),
              lookup: t("add.lookup"),
              looking: t("add.looking"),
              found: t("add.found"),
              notFound: t("add.notFound"),
              scanning: t("scan.scanning"),
              close: t("scan.close"),
              noCamera: t("scan.noCamera"),
              manualToggle: t("add.coverReplace"),
              modeTitle: t("add.mode.title"),
              modeFlow: t("add.mode.flow"),
              modeFlowDesc: t("add.mode.flowDesc"),
              modeLend: t("add.mode.lend"),
              modeLendDesc: t("add.mode.lendDesc"),
              depositLabel: t("add.field.deposit"),
              depositPlaceholder: t("add.field.depositPlaceholder"),
              depositHint: t("add.field.depositHint"),
              visibilityLabel: t("add.visibility.label"),
              visibilityHint: t("add.visibility.hint"),
              fieldTitle: t("add.field.title"),
              fieldAuthor: t("add.field.author"),
              fieldCover: t("add.field.cover"),
              fieldCoverReplace: t("add.coverReplace"),
              fieldLanguage: t("add.field.language"),
              fieldAge: t("add.field.age"),
              agePlaceholder: t("add.field.agePlaceholder"),
              fieldCategory: t("add.field.category"),
              categoryPlaceholder: t("add.field.categoryPlaceholder"),
              fieldCondition: t("add.field.condition"),
              conditionPlaceholder: t("add.field.conditionPlaceholder"),
              fieldZip: t("add.field.zip"),
              zipPlaceholder: t("login.zipPlaceholder"),
              fieldNotes: t("add.field.notes"),
              optional: t("common.optional"),
              submit: t("add.submit"),
            }}
          />
        </div>
      </div>
    </div>
  );
}
