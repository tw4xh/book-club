import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getGroupMessages } from "@/lib/repo";
import { postGroupMessageAction } from "@/app/actions";

export default async function ChatPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/chat");
  if (!activeGroup) redirect("/groups");

  const messages = getGroupMessages(activeGroup.id);
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div>
        <h1 className="text-lg font-semibold">{t("chat.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{activeGroup.name}</p>
      </div>

      <div className="mt-4 flex-1 space-y-2">
        {messages.length === 0 ? (
          <p className="card p-4 text-sm text-stone-400">{t("chat.empty")}</p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === user.id;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] ${mine ? "text-right" : ""}`}>
                  {!mine ? (
                    <p className="mb-0.5 text-xs text-stone-400">{m.user_name}</p>
                  ) : null}
                  <div
                    className={`inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? "bg-brand-500 text-white"
                        : "bg-white text-stone-800 ring-1 ring-stone-200"
                    }`}
                  >
                    {m.body}
                  </div>
                  <p className="mt-0.5 text-[10px] text-stone-300">
                    {fmt(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form
        action={postGroupMessageAction}
        className="sticky bottom-20 mt-3 flex gap-2 bg-stone-50/90 py-2 backdrop-blur"
      >
        <input type="hidden" name="group_id" value={activeGroup.id} />
        <input
          name="body"
          required
          autoComplete="off"
          placeholder={t("chat.placeholder")}
          className="input flex-1"
        />
        <button className="btn-primary whitespace-nowrap px-4">{t("chat.send")}</button>
      </form>
    </div>
  );
}
