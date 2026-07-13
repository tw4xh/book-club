import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { getNotifications, markNotificationsRead } from "@/lib/repo";

export default async function NotificationsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser();

  if (!user) redirect("/login?next=/notifications");

  const items = await getNotifications(user.id);
  // Opening this page counts as reading; clear the unread badge.
  await markNotificationsRead(user.id);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("notif.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("notif.subtitle")}</p>
      </div>

      {items.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("notif.empty")}</p>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const unread = !n.read_at;
            const groupName = n.group_name ?? "";
            return (
              <div
                key={n.id}
                className={`card p-4 ${unread ? "ring-2 ring-brand-100" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium text-stone-800">
                    {n.type === "policy_changed"
                      ? t("notif.policyChanged", { group: groupName })
                      : groupName}
                  </h2>
                  {unread ? (
                    <span className="chip bg-red-100 text-red-600">
                      {t("notif.new")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-stone-400">{fmt(n.created_at)}</p>

                {n.type === "policy_changed" ? (
                  <div className="mt-2">
                    <p className="text-sm text-stone-600">
                      {t("notif.policyChangedBody")}
                    </p>
                    {n.body ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
                        {n.body}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <Link href="/groups" className="btn-secondary mt-3 px-3 py-1.5 text-xs">
                  {t("notif.viewPolicy")}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
