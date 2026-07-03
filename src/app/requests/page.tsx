import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { listBookRequests } from "@/lib/repo";
import {
  createRequestAction,
  setRequestStatusAction,
  toggleInterestAction,
} from "@/app/actions";

export default async function RequestsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/requests");
  if (!activeGroup) redirect("/groups");

  const requests = listBookRequests(activeGroup.id, user.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("req.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("req.subtitle")}</p>
      </div>

      <form action={createRequestAction} className="card space-y-3 p-4">
        <h2 className="font-medium">{t("req.add")}</h2>
        <input type="hidden" name="group_id" value={activeGroup.id} />
        <input
          name="title"
          required
          placeholder={t("req.formTitle")}
          className="input"
        />
        <input name="author" placeholder={t("req.formAuthor")} className="input" />
        <textarea
          name="note"
          rows={2}
          placeholder={t("req.formNote")}
          className="input"
        />
        <button className="btn-primary w-full">{t("req.submit")}</button>
      </form>

      {requests.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("req.empty")}</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const fulfilled = r.status === "fulfilled";
            const mine = r.requester_user_id === user.id;
            return (
              <div key={r.id} className={`card p-4 ${fulfilled ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium leading-snug">{r.title}</h3>
                    {r.author ? (
                      <p className="text-sm text-stone-500">{r.author}</p>
                    ) : null}
                  </div>
                  <span
                    className={`chip ${
                      fulfilled
                        ? "bg-stone-200 text-stone-600"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {fulfilled ? t("req.fulfilled") : t("req.open")}
                  </span>
                </div>

                {r.note ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">
                    {r.note}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-stone-400">
                  {t("req.by", { name: r.requester_name })}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={toggleInterestAction}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="kind" value="want" />
                    <button
                      className={`px-3 py-1.5 text-xs ${
                        r.viewer_want ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      🙋 {r.viewer_want ? t("req.iWant") : t("req.alsoWant")} ·{" "}
                      {r.want_count}
                    </button>
                  </form>
                  <form action={toggleInterestAction}>
                    <input type="hidden" name="request_id" value={r.id} />
                    <input type="hidden" name="kind" value="buy" />
                    <button
                      className={`px-3 py-1.5 text-xs ${
                        r.viewer_buy ? "btn-primary" : "btn-secondary"
                      }`}
                    >
                      🛒 {r.viewer_buy ? t("req.buying") : t("req.iBuy")} ·{" "}
                      {r.buy_count}
                    </button>
                  </form>
                  {mine ? (
                    <form action={setRequestStatusAction}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={fulfilled ? "open" : "fulfilled"}
                      />
                      <button className="btn-ghost px-2 py-1.5 text-xs">
                        {fulfilled ? t("req.reopen") : t("req.markFulfilled")}
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
