import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { setLocaleAction, logoutAction } from "@/app/actions";

interface TopBarProps {
  locale: Locale;
  appName: string;
  tagline: string;
  activeGroupName: string | null;
  user: { name: string } | null;
  unreadCount: number;
  labels: {
    switchLang: string;
    login: string;
    register: string;
    logout: string;
    notifications: string;
  };
}

export function TopBar({
  locale,
  appName,
  tagline,
  activeGroupName,
  user,
  unreadCount,
  labels,
}: TopBarProps) {
  const nextLocale = locale === "zh" ? "en" : "zh";
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <span className="truncate text-base font-semibold text-brand-700">
              {appName}
            </span>
          </div>
          <p className="truncate text-xs text-stone-500">
            {activeGroupName ?? tagline}
          </p>
        </Link>
        <div className="flex items-center gap-1">
          {user ? (
            <Link
              href="/notifications"
              aria-label={labels.notifications}
              className="relative px-2 py-1.5 text-lg leading-none"
            >
              🔔
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Link>
          ) : null}
          <form action={setLocaleAction}>
            <input type="hidden" name="locale" value={nextLocale} />
            <button type="submit" className="btn-ghost px-2.5 py-1.5 text-xs">
              {labels.switchLang}
            </button>
          </form>
          {user ? (
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost px-2.5 py-1.5 text-xs">
                {labels.logout}
              </button>
            </form>
          ) : (
            <>
              <Link href="/login" className="btn-ghost px-2.5 py-1.5 text-xs">
                {labels.login}
              </Link>
              <Link href="/register" className="btn-primary px-3 py-1.5 text-xs">
                {labels.register}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
