import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getCreditBalance, getGroupLeaderboard, getUserContribution } from "@/lib/repo";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function ContributorsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/contributors");
  if (!activeGroup) redirect("/groups");

  const board = await getGroupLeaderboard(activeGroup.id);
  const mine = await getUserContribution(user.id, activeGroup.id);
  const myCredit = await getCreditBalance(user.id, activeGroup.id);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("board.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("board.subtitle")}</p>
      </div>

      <div className="card bg-brand-50 p-4">
        <p className="text-xs font-semibold text-brand-700">{t("board.myStanding")}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-base font-semibold">{t(`level.${mine.level}`)}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-sm font-semibold text-brand-700">
            🪙 {t("credit.balance")}: {myCredit}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          {t("board.shared", { count: mine.shared })} ·{" "}
          {t("board.lent", { count: mine.lent })} ·{" "}
          {t("board.score", { score: mine.score })}
        </p>
        <p className="mt-2 text-xs text-stone-400">{t("credit.how")}</p>
      </div>

      {board.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("board.empty")}</p>
      ) : (
        <div className="space-y-2">
          {board.map((e, i) => {
            const me = e.user_id === user.id;
            return (
              <div
                key={e.user_id}
                className={`card flex items-center gap-3 p-3 ${
                  me ? "ring-2 ring-brand-200" : ""
                }`}
              >
                <span className="w-6 flex-shrink-0 text-center text-lg">
                  {MEDALS[i] ?? <span className="text-sm text-stone-400">{i + 1}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {e.name}
                    {me ? (
                      <span className="ml-1 text-xs text-brand-600">
                        {t("board.you")}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-stone-500">
                    {t(`level.${e.level}`)} · {t("board.shared", { count: e.shared })} ·{" "}
                    {t("board.lent", { count: e.lent })}
                  </p>
                </div>
                <span className="flex-shrink-0 text-right text-sm font-semibold text-brand-700">
                  🪙 {e.balance}
                  <span className="block text-xs font-normal text-stone-400">
                    {t("board.score", { score: e.score })}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-stone-400">{t("board.howScore")}</p>
    </div>
  );
}
