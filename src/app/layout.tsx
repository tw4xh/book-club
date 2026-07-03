import type { Metadata, Viewport } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { getLocale, createTranslator } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getUnreadDmCount, getUnreadNotificationCount } from "@/lib/repo";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "邻里书屋 Neighbor Bookshelf",
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
  const { user, activeGroup } = await getSessionContext();
  const unreadCount = user ? getUnreadNotificationCount(user.id) : 0;
  const dmUnread = user ? getUnreadDmCount(user.id) : 0;

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>
        <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
          <TopBar
            locale={locale}
            appName={t("app.name")}
            tagline={t("app.tagline")}
            activeGroupName={activeGroup?.name ?? null}
            user={user ? { name: user.name } : null}
            unreadCount={unreadCount}
            labels={{
              switchLang: t("lang.switch"),
              login: t("nav.login"),
              register: t("nav.register"),
              logout: t("nav.logout"),
              notifications: t("nav.notifications"),
            }}
          />
          <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
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
