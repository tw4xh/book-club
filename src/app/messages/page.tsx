import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getConversations, getGroupMembers } from "@/lib/repo";

export default async function MessagesPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/messages");

  const conversations = await getConversations(user.id);
  const talkedTo = new Set(conversations.map((c) => c.user_id));
  const members = activeGroup
    ? (await getGroupMembers(activeGroup.id)).filter(
        (m) => m.id !== user.id && !talkedTo.has(m.id)
      )
    : [];

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{t("dm.title")}</h1>

      {conversations.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("dm.empty")}</p>
      ) : (
        <div className="space-y-2">
          {conversations.map((c) => (
            <Link
              key={c.user_id}
              href={`/messages/${c.user_id}`}
              className="card flex items-center gap-3 p-3"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                {c.user_name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.user_name}</span>
                  <span className="flex-shrink-0 text-xs text-stone-400">
                    {fmt(c.last_at)}
                  </span>
                </div>
                <p className="truncate text-sm text-stone-500">{c.last_body}</p>
              </div>
              {c.unread > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {c.unread}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}

      {members.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-700">
            {t("dm.members")}
          </h2>
          <div className="space-y-2">
            {members.map((m) => (
              <Link
                key={m.id}
                href={`/messages/${m.id}`}
                className="card flex items-center gap-3 p-3"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                  {m.name.slice(0, 1)}
                </div>
                <span className="font-medium">{m.name}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
