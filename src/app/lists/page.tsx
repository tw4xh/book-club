import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { listBookLists } from "@/lib/repo";
import { createListAction } from "@/app/actions";

export default async function ListsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/lists");
  if (!activeGroup) redirect("/groups");

  const lists = listBookLists(activeGroup.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("list.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("list.subtitle")}</p>
      </div>

      <form action={createListAction} className="card space-y-3 p-4">
        <h2 className="font-medium">{t("list.add")}</h2>
        <input type="hidden" name="group_id" value={activeGroup.id} />
        <input
          name="title"
          required
          placeholder={t("list.formTitle")}
          className="input"
        />
        <textarea
          name="description"
          rows={2}
          placeholder={t("list.formDesc")}
          className="input"
        />
        <button className="btn-primary w-full">{t("list.submit")}</button>
      </form>

      {lists.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("list.empty")}</p>
      ) : (
        <div className="space-y-3">
          {lists.map((l) => (
            <Link key={l.id} href={`/lists/${l.id}`} className="card block p-4">
              <h3 className="font-medium leading-snug">📚 {l.title}</h3>
              {l.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-stone-600">
                  {l.description}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-stone-400">
                {t("list.items", { count: l.item_count })} ·{" "}
                {t("list.by", { name: l.author_name })}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
