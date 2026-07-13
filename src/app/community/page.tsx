import Link from "next/link";
import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getUnreadDmCount } from "@/lib/repo";

export default async function CommunityPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/community");
  if (!activeGroup) redirect("/groups");

  const dmUnread = await getUnreadDmCount(user.id);

  const tiles = [
    { href: "/assistant", icon: "🤖", key: "assistant", badge: 0 },
    { href: "/requests", icon: "🙋", key: "requests", badge: 0 },
    { href: "/lists", icon: "📚", key: "lists", badge: 0 },
    { href: "/contributors", icon: "🏆", key: "board", badge: 0 },
    { href: "/chat", icon: "💬", key: "chat", badge: 0 },
    { href: "/messages", icon: "✉️", key: "dm", badge: dmUnread },
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">{t("community.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("community.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="card relative flex flex-col gap-1 p-4"
          >
            {tile.badge > 0 ? (
              <span className="absolute right-3 top-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {tile.badge}
              </span>
            ) : null}
            <span className="text-2xl">{tile.icon}</span>
            <span className="font-medium">{t(`community.${tile.key}`)}</span>
            <span className="text-xs text-stone-500">
              {t(`community.${tile.key}Desc`)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
