import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator, getLocale, type Translator } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getHeldBooks, getOwnedBooks } from "@/lib/repo";
import {
  returnToOwnerAction,
  setStatusAction,
  transferOwnedBooksAction,
  withdrawOwnedBooksAction,
} from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import type { BookWithPeople } from "@/lib/types";

export default async function ShelfPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const sp = await searchParams;
  const { user, groups, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/shelf");
  if (!activeGroup) redirect("/groups");

  const held = await getHeldBooks(user.id, activeGroup.id);
  const owned = await getOwnedBooks(user.id, activeGroup.id);
  const targetGroups = groups.filter((group) => group.id !== activeGroup.id);
  const withdrawnRaw = typeof sp.withdrawn === "string" ? sp.withdrawn : null;
  const withdrawnCount = withdrawnRaw ? Number.parseInt(withdrawnRaw, 10) : null;
  const transferredRaw = typeof sp.transferred === "string" ? sp.transferred : null;
  const transferredCount = transferredRaw ? Number.parseInt(transferredRaw, 10) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("shelf.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("shelf.subtitle")}</p>
      </div>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
          {t("shelf.held")}
          <span className="chip bg-stone-100 text-stone-500">{held.length}</span>
        </h2>
        {held.length === 0 ? (
          <p className="card p-4 text-sm text-stone-400">{t("shelf.heldEmpty")}</p>
        ) : (
          <div className="space-y-3">
            {held.map((book) => (
              <HeldRow key={book.id} book={book} t={t} userId={user.id} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
          {t("shelf.owned")}
          <span className="chip bg-stone-100 text-stone-500">{owned.length}</span>
        </h2>
        {withdrawnCount != null ? (
          <p
            className={`mb-3 rounded-xl px-3 py-2 text-sm ${
              withdrawnCount > 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {withdrawnCount > 0
              ? t("shelf.withdrawSuccess", { n: withdrawnCount })
              : t("shelf.withdrawNone")}
          </p>
        ) : null}
        {transferredCount != null ? (
          <p
            className={`mb-3 rounded-xl px-3 py-2 text-sm ${
              transferredCount > 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {transferredCount > 0
              ? t("shelf.transferSuccess", { n: transferredCount })
              : t("shelf.transferNone")}
          </p>
        ) : null}
        {owned.length === 0 ? (
          <div className="card p-4 text-center">
            <p className="text-sm text-stone-400">{t("shelf.ownedEmpty")}</p>
            <Link href="/books/new" className="btn-primary mt-3">
              {t("nav.add")}
            </Link>
          </div>
        ) : (
          <form action={withdrawOwnedBooksAction} className="space-y-3">
            <input type="hidden" name="group_id" value={activeGroup.id} />
            <div className="rounded-xl bg-stone-50 px-3 py-2 text-xs leading-5 text-stone-500">
              {t("shelf.withdrawHint")}
            </div>
            {owned.map((book) => (
              <OwnedRow key={book.id} book={book} t={t} />
            ))}
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <label className="label" htmlFor="target_group_id">
                {t("shelf.transferTarget")}
              </label>
              <select
                id="target_group_id"
                name="target_group_id"
                className="input"
                disabled={targetGroups.length === 0}
              >
                {targetGroups.length === 0 ? (
                  <option value="">{t("shelf.transferNoTarget")}</option>
                ) : (
                  targetGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))
                )}
              </select>
              <p className="mt-1 text-xs leading-5 text-stone-500">
                {t("shelf.transferHint")}
              </p>
            </div>
            <button
              formAction={transferOwnedBooksAction}
              disabled={targetGroups.length === 0}
              className="btn-secondary w-full disabled:opacity-50"
            >
              {t("shelf.transferSubmit")}
            </button>
            <button className="btn-secondary w-full border-red-200 text-red-700 hover:bg-red-50">
              {t("shelf.withdrawSubmit")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function Cover({ book }: { book: BookWithPeople }) {
  return (
    <Link
      href={`/books/${book.id}`}
      className="h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-stone-100"
    >
      {book.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.cover_image_url}
          alt={book.title}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xl">📕</div>
      )}
    </Link>
  );
}

function HeldRow({
  book,
  t,
  userId,
}: {
  book: BookWithPeople;
  t: Translator;
  userId: string;
}) {
  const reading = book.status === "reading";
  const mustReturn = book.share_mode === "lend" && book.owner_user_id !== userId;
  return (
    <div className="card p-3">
      <div className="flex gap-3">
        <Cover book={book} />
        <div className="min-w-0 flex-1">
          <Link href={`/books/${book.id}`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 font-medium leading-snug">{book.title}</h3>
              <StatusBadge status={book.status} t={t} />
            </div>
            {book.author ? (
              <p className="mt-0.5 truncate text-sm text-stone-500">{book.author}</p>
            ) : null}
          </Link>
          {mustReturn ? (
            <form action={returnToOwnerAction} className="mt-2">
              <input type="hidden" name="book_id" value={book.id} />
              <button className="btn-secondary px-3 py-1.5 text-xs">
                ↩️ {t("book.returnToOwner")}
              </button>
            </form>
          ) : (
            <form action={setStatusAction} className="mt-2">
              <input type="hidden" name="book_id" value={book.id} />
              <input
                type="hidden"
                name="status"
                value={reading ? "available" : "reading"}
              />
              <button className="btn-secondary px-3 py-1.5 text-xs">
                {reading ? t("book.markPassOn") : t("book.markReading")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function OwnedRow({ book, t }: { book: BookWithPeople; t: Translator }) {
  const checkboxId = `withdraw_${book.id}`;
  return (
    <div className="card flex gap-3 p-3">
      <input
        id={checkboxId}
        type="checkbox"
        name="book_id"
        value={book.id}
        className="mt-8 h-4 w-4 flex-shrink-0 rounded border-stone-300 text-brand-600"
        aria-label={t("shelf.withdrawSelect", { title: book.title })}
      />
      <Cover book={book} />
      <Link href={`/books/${book.id}`} className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium leading-snug">{book.title}</h3>
          <StatusBadge status={book.status} t={t} />
        </div>
        {book.author ? (
          <p className="mt-0.5 truncate text-sm text-stone-500">{book.author}</p>
        ) : null}
        <p className="mt-2 text-xs text-stone-500">
          {t("book.holder")}: {book.holder_name}
        </p>
        {book.share_mode === "lend" && book.visible_to_others === 0 ? (
          <span className="chip mt-2 bg-stone-100 text-stone-600">
            {t("book.hiddenBadge")}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
