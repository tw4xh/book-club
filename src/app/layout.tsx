import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { getLocale, createTranslator } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import {
  getCreditBalance,
  getUnreadDmCount,
  getUnreadNotificationCount,
} from "@/lib/repo";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "邻里书屋 Neighbor Book Club",
  description: "和身边的朋友一起分享中文书 · Share books with the friends around you",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "邻里书屋",
  },
};

export const viewport: Viewport = {
  themeColor: "#e11d48",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, groups, activeGroup } = await getSessionContext();
  const unreadCount = user ? await getUnreadNotificationCount(user.id) : 0;
  const dmUnread = user ? await getUnreadDmCount(user.id) : 0;
  const creditBalance =
    user && activeGroup ? await getCreditBalance(user.id, activeGroup.id) : null;

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
          <TopBar
            locale={locale}
            appName={t("app.name")}
            tagline={t("app.tagline")}
            activeGroupId={activeGroup?.id ?? null}
            groups={groups.map((group) => ({ id: group.id, name: group.name }))}
            user={user ? { name: user.name } : null}
            unreadCount={unreadCount}
            creditBalance={creditBalance}
            labels={{
              switchLang: t("lang.switch"),
              login: t("nav.login"),
              register: t("nav.register"),
              logout: t("nav.logout"),
              notifications: t("nav.notifications"),
              switchGroup: t("groups.switchShort"),
              credit: t("credit.label"),
              creditHow: t("credit.how"),
            }}
          />
          <main className="flex-1 px-4 pt-4 sm:px-6 lg:px-8">{children}</main>
          <footer className="px-4 pb-28 pt-6 text-center text-xs text-stone-400 sm:px-6 lg:px-8">
            <Link href="/privacy" className="hover:text-stone-600">
              {t("nav.privacy")}
            </Link>
          </footer>
          {user ? (
            <BottomNav
              communityBadge={dmUnread}
              labels={{
                catalog: t("nav.catalog"),
                community: t("nav.community"),
                add: t("nav.add"),
                shelf: t("nav.shelf"),
                groups: t("nav.groups"),
              }}
            />
          ) : null}
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
