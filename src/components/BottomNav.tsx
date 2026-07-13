"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  labels: {
    catalog: string;
    community: string;
    add: string;
    shelf: string;
    groups: string;
  };
  communityBadge?: number;
}

const ITEMS = [
  { href: "/", key: "catalog", icon: "📖" },
  { href: "/community", key: "community", icon: "🫂" },
  { href: "/books/new", key: "add", icon: "➕" },
  { href: "/shelf", key: "shelf", icon: "🧺" },
  { href: "/groups", key: "groups", icon: "👥" },
] as const;

// Other top-level routes that conceptually live under Community, so that tab
// stays highlighted while you're in them.
const COMMUNITY_PATHS = [
  "/community",
  "/assistant",
  "/requests",
  "/lists",
  "/chat",
  "/messages",
  "/contributors",
];

export function BottomNav({ labels, communityBadge = 0 }: BottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/community")
      return COMMUNITY_PATHS.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          const badge = item.key === "community" ? communityBadge : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                active ? "text-brand-600" : "text-stone-500"
              }`}
            >
              <span className="relative text-lg leading-none">
                {item.icon}
                {badge > 0 ? (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </span>
              <span>{labels[item.key as keyof BottomNavProps["labels"]]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
