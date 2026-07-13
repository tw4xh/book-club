import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getBookById, getMembership } from "@/lib/repo";
import { EditBookForm } from "@/components/EditBookForm";

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user } = await getSessionContext();

  if (!user) redirect(`/login?next=/books/${id}/edit`);

  const book = await getBookById(id);
  if (!book) notFound();
  if (!(await getMembership(user.id, book.group_id))) redirect("/");
  // Only the owner may edit a book's descriptive fields.
  if (book.owner_user_id !== user.id) redirect(`/books/${id}`);

  return (
    <div className="max-w-2xl">
      <Link
        href={`/books/${id}`}
        className="text-sm text-stone-500 hover:text-stone-700"
      >
        ← {book.title}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{t("edit.title")}</h1>
      <p className="mt-2 text-sm text-stone-600">{t("edit.subtitle")}</p>

      <div className="mt-6">
        <EditBookForm
          book={{
            id: book.id,
            isbn: book.isbn,
            title: book.title,
            author: book.author,
            language: book.language,
            condition: book.condition,
            notes: book.notes,
            deposit: book.deposit,
            share_mode: book.share_mode === "lend" ? "lend" : "flow",
            visible_to_others: book.visible_to_others,
            cover_image_url: book.cover_image_url,
          }}
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
            submit: t("edit.submit"),
            editHint: t("edit.hint"),
            isbnLabel: t("edit.isbnLabel"),
          }}
        />
      </div>
    </div>
  );
}
