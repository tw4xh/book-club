import Link from "next/link";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import { getBookFacets, listBooks } from "@/lib/repo";
import type { BookStatus } from "@/lib/types";
import { BookCard } from "@/components/BookCard";
import { BookLocationsMap } from "@/components/BookLocationsMap";
import { CopyText } from "@/components/CopyText";
import { demoLoginAction } from "@/app/actions";

type DonationMethod =
  | { type: "link"; label: string; href: string }
  | { type: "copy"; label: string; value: string };

// Public project donation link. Used unless overridden by env config.
const DEFAULT_PAYPAL_URL = "https://paypal.me/neighborbookshelf";

function donationMethods(t: ReturnType<typeof createTranslator>): DonationMethod[] {
  const methods: DonationMethod[] = [];
  if (process.env.DONATION_PAYPAL_EMAIL) {
    methods.push({
      type: "copy",
      label: t("donate.paypal"),
      value: process.env.DONATION_PAYPAL_EMAIL,
    });
  } else {
    methods.push({
      type: "link",
      label: t("donate.paypal"),
      href: process.env.DONATION_PAYPAL_URL || DEFAULT_PAYPAL_URL,
    });
  }
  if (process.env.DONATION_VENMO_ID) {
    methods.push({
      type: "copy",
      label: t("donate.venmo"),
      value: process.env.DONATION_VENMO_ID,
    });
  }
  if (process.env.DONATION_WECHAT_ID) {
    methods.push({
      type: "copy",
      label: t("donate.wechat"),
      value: process.env.DONATION_WECHAT_ID,
    });
  }
  return methods;
}

function DonationCard({
  methods,
  t,
  className = "",
}: {
  methods: DonationMethod[];
  t: ReturnType<typeof createTranslator>;
  className?: string;
}) {
  return (
    <div className={`card space-y-3 p-4 text-left ${className}`}>
      <div>
        <h2 className="text-base font-semibold text-stone-800">
          💝 {t("donate.title")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">{t("donate.body")}</p>
      </div>
      {methods.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {methods.map((method) =>
            method.type === "link" ? (
              <a
                key={method.label}
                href={method.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                {method.label}
              </a>
            ) : (
              <div
                key={method.label}
                className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs"
              >
                <span className="font-medium text-stone-700">
                  {method.label}: {method.value}
                </span>
                <CopyText
                  text={method.value}
                  label={t("common.copy")}
                  copiedLabel={t("common.copied")}
                />
              </div>
            )
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-500">
          {t("donate.notConfigured")}
        </p>
      )}
    </div>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, activeGroup } = await getSessionContext();
  const donations = donationMethods(t);
  const sp = await searchParams;
  const demoStatus = typeof sp.demo === "string" ? sp.demo : "";

  if (!user) {
    return (
      <div className="mt-8 flex flex-col items-center text-center">
        <div className="text-5xl">📚</div>
        <h1 className="mt-4 text-2xl font-bold">{t("guest.title")}</h1>
        <p className="mt-3 max-w-md text-stone-600">{t("guest.body")}</p>
        <div className="card mt-6 max-w-md p-4 text-left">
          <h2 className="text-base font-semibold text-stone-800">
            {t("guest.missionTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {t("guest.missionBody")}
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {t("guest.openSource")}{" "}
            <a
              href="https://github.com/tw4xh/book-club"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              {t("guest.github")}
            </a>
          </p>
        </div>
        <DonationCard methods={donations} t={t} className="mt-4 max-w-md" />
        {demoStatus === "missing" ? (
          <p className="mt-4 max-w-md rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {t("guest.demoMissing")}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/register" className="btn-primary">
            {t("guest.registerCta")}
          </Link>
          <form action={demoLoginAction}>
            <button className="btn-secondary w-full">{t("guest.demoCta")}</button>
          </form>
          <Link href="/login" className="btn-secondary">
            {t("guest.loginCta")}
          </Link>
        </div>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className="mt-8 text-center">
        <p className="text-stone-600">{t("groups.none")}</p>
        <Link href="/groups" className="btn-primary mt-4">
          {t("nav.groups")}
        </Link>
      </div>
    );
  }

  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const filters = {
    search: get("q") || undefined,
    language: get("language") || undefined,
    age_range: get("age") || undefined,
    viewerUserId: user.id,
    status: (["available", "reading"].includes(get("status"))
      ? (get("status") as BookStatus)
      : undefined) as BookStatus | undefined,
  };

  const books = await listBooks(activeGroup.id, filters);
  const facets = await getBookFacets(activeGroup.id, user.id);

  return (
    <div>
      <div className="card mb-4 space-y-2 p-3 text-sm text-stone-600">
        <p className="font-medium text-stone-800">{t("catalog.modeHelpTitle")}</p>
        <div className="space-y-1">
          <p>
            <span className="chip mode-chip--lend mr-1">↩️ {t("mode.lend")}</span>
            {t("catalog.modeHelpLend")}
          </p>
          <p className="pl-1 text-xs text-stone-500">{t("catalog.returnTimeHelp")}</p>
          <p>
            <span className="chip mode-chip--flow mr-1">🔄 {t("mode.flow")}</span>
            {t("catalog.modeHelpFlow")}
          </p>
        </div>
      </div>

      <DonationCard methods={donations} t={t} className="mb-4" />

      <form method="get" className="card mb-4 space-y-3 p-3">
        <input
          type="search"
          name="q"
          defaultValue={get("q")}
          placeholder={t("catalog.searchPlaceholder")}
          className="input"
        />
        <div className="grid grid-cols-2 gap-2">
          <select name="language" defaultValue={get("language")} className="input">
            <option value="">{t("catalog.filter.language")}</option>
            {facets.languages.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select name="age" defaultValue={get("age")} className="input">
            <option value="">{t("catalog.filter.age")}</option>
            {facets.ageRanges.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={get("status")} className="input">
            <option value="">{t("catalog.filter.status")}</option>
            <option value="available">{t("status.available")}</option>
            <option value="reading">{t("status.reading")}</option>
          </select>
        </div>
        <button type="submit" className="btn-secondary w-full">
          {t("common.search")}
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0 lg:order-2 lg:sticky lg:top-20">
          <BookLocationsMap books={books} viewerZip={user.home_zip} t={t} />
        </div>

        <div className="min-w-0 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold">{t("catalog.title")}</h1>
            <span className="text-sm text-stone-500">
              {t("catalog.count", { n: books.length })}
            </span>
          </div>

          {books.length === 0 ? (
            <div className="card p-8 text-center text-stone-500">
              {t("catalog.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {books.map((book) => (
                <BookCard key={book.id} book={book} t={t} viewerZip={user.home_zip} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
