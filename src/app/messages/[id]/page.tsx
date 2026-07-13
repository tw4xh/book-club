import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { getConversation, getUserById, markConversationRead } from "@/lib/repo";
import { sendDmAction } from "@/app/actions";

export default async function DmThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser();

  if (!user) redirect(`/login?next=/messages/${id}`);
  if (id === user.id) redirect("/messages");

  const other = await getUserById(id);
  if (!other) notFound();

  const messages = await getConversation(user.id, other.id);
  // Opening the thread reads the other person's messages to me.
  await markConversationRead(user.id, other.id);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="flex items-center gap-2">
        <Link href="/messages" className="btn-ghost px-0 text-sm">
          ←
        </Link>
        <h1 className="text-lg font-semibold">{other.name}</h1>
      </div>

      <div className="mt-4 flex-1 space-y-2">
        {messages.length === 0 ? (
          <p className="card p-4 text-sm text-stone-400">{t("dm.threadEmpty")}</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === user.id;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] ${mine ? "text-right" : ""}`}>
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
        action={sendDmAction}
        className="sticky bottom-20 mt-3 flex gap-2 bg-stone-50/90 py-2 backdrop-blur"
      >
        <input type="hidden" name="to" value={other.id} />
        <input
          name="body"
          required
          autoComplete="off"
          placeholder={t("dm.placeholder")}
          className="input flex-1"
        />
        <button className="btn-primary whitespace-nowrap px-4">{t("dm.send")}</button>
      </form>
    </div>
  );
}
