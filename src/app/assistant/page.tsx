import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { aiDailyLimit, answerAssistantQuestion } from "@/lib/assistant";
import { createAssistantRequestAction } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";
import type { BookWithPeople } from "@/lib/types";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const sp = await searchParams;
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/assistant");
  if (!activeGroup) redirect("/groups");

  const question = typeof sp.q === "string" ? sp.q : "";
  const response = question
    ? await answerAssistantQuestion({
        question,
        groupId: activeGroup.id,
        viewer: user,
        t,
      })
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("assistant.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("assistant.subtitle")}</p>
      </div>

      <form method="get" className="card space-y-3 p-4">
        <label className="label" htmlFor="q">
          {t("assistant.askLabel")}
        </label>
        <textarea
          id="q"
          name="q"
          rows={3}
          defaultValue={question}
          placeholder={t("assistant.placeholder")}
          className="input"
        />
        <button className="btn-primary w-full">{t("assistant.askSubmit")}</button>
        <p className="text-xs leading-5 text-stone-400">
          {t("assistant.modelHint", { n: aiDailyLimit() })}{" "}
          <Link href="/privacy" className="text-brand-500 underline">
            {t("assistant.privacyLink")}
          </Link>
        </p>
      </form>

      {response?.aiExhausted ? (
        <div className="card border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {t("assistant.quotaNotice", { n: aiDailyLimit() })}
        </div>
      ) : null}

      {!response ? (
        <div className="card space-y-2 p-4 text-sm text-stone-600">
          <p className="font-medium text-stone-800">{t("assistant.examplesTitle")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("assistant.exampleFind")}</li>
            <li>{t("assistant.exampleList")}</li>
            <li>{t("assistant.exampleWant")}</li>
            <li>{t("assistant.exampleRecommend")}</li>
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{t("assistant.answerTitle")}</h2>
              <span className="chip bg-stone-100 text-stone-500">
                {response.usedAi ? t("assistant.aiUsed") : t("assistant.localUsed")}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">
              {response.answer}
            </p>
          </div>

          {response.matches.length > 0 ? (
            <div className="space-y-3">
              {response.matches.map((book) => (
                <AssistantBookCard key={book.id} book={book} t={t} />
              ))}
            </div>
          ) : null}

          {response.canCreateRequest && response.wantedTitle ? (
            <form action={createAssistantRequestAction} className="card space-y-3 p-4">
              <input type="hidden" name="group_id" value={activeGroup.id} />
              <input type="hidden" name="title" value={response.wantedTitle} />
              <input type="hidden" name="question" value={question} />
              <p className="text-sm text-stone-600">
                {t("assistant.createRequestHint", { title: response.wantedTitle })}
              </p>
              <button className="btn-secondary w-full">
                {t("assistant.createRequest")}
              </button>
            </form>
          ) : null}
        </div>
      )}
    </div>
  );
}

function AssistantBookCard({
  book,
  t,
}: {
  book: BookWithPeople;
  t: ReturnType<typeof createTranslator>;
}) {
  return (
    <Link href={`/books/${book.id}`} className="card flex gap-3 p-3">
      <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-stone-100">
        {book.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.cover_image_url}
            alt={book.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl">
            📕
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium leading-snug">{book.title}</h3>
          <StatusBadge status={book.status} t={t} />
        </div>
        {book.author ? (
          <p className="mt-0.5 truncate text-sm text-stone-500">{book.author}</p>
        ) : null}
        <p className="mt-2 text-xs leading-5 text-stone-500">
          {t("book.owner")}:{" "}
          <span className="font-medium text-brand-700">{book.owner_name}</span>
          {" · "}
          {t("book.holder")}:{" "}
          <span className="font-medium text-emerald-700">{book.holder_name}</span>
          {book.location_zip ? ` · ZIP ${book.location_zip}` : ""}
        </p>
      </div>
    </Link>
  );
}
