import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getBookList, getBookListItems, getMembership } from "@/lib/repo";
import { addListItemAction } from "@/app/actions";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user } = await getSessionContext();

  if (!user) redirect(`/login?next=/lists/${id}`);

  const list = await getBookList(id);
  if (!list) notFound();
  if (!(await getMembership(user.id, list.group_id))) redirect("/lists");

  const items = await getBookListItems(id);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href="/lists" className="btn-ghost px-0 text-sm">
        ← {t("common.back")}
      </Link>

      <div>
        <h1 className="text-xl font-bold leading-snug">📚 {list.title}</h1>
        {list.description ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
            {list.description}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-stone-400">
          {t("list.by", { name: list.author_name })}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("list.itemsEmpty")}</p>
      ) : (
        <ol className="space-y-2">
          {items.map((it, i) => (
            <li key={it.id} className="card p-3">
              <div className="flex gap-3">
                <span className="text-sm font-semibold text-stone-400">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="font-medium leading-snug">{it.title}</h3>
                  {it.author ? (
                    <p className="text-sm text-stone-500">{it.author}</p>
                  ) : null}
                  {it.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                      {it.note}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form action={addListItemAction} className="card space-y-3 p-4">
        <h2 className="font-medium">{t("list.addItem")}</h2>
        <input type="hidden" name="list_id" value={list.id} />
        <input
          name="title"
          required
          placeholder={t("list.itemTitle")}
          className="input"
        />
        <input name="author" placeholder={t("list.itemAuthor")} className="input" />
        <textarea
          name="note"
          rows={2}
          placeholder={t("list.itemNote")}
          className="input"
        />
        <button className="btn-secondary w-full">{t("list.itemSubmit")}</button>
      </form>
    </div>
  );
}
