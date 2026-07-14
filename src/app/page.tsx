import Link from "next/link";
import { demoLoginAction } from "@/app/actions";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import {
  countBooksOwnedByUser,
  getBookFacets,
  getMembership,
  listBooks,
} from "@/lib/repo";
import type { BookStatus } from "@/lib/types";
import { BookCard } from "@/components/BookCard";
import { BookLocationsMap } from "@/components/BookLocationsMap";
import { CopyText } from "@/components/CopyText";

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

  if (!user) {
    const steps = [
      { icon: "📚", title: t("guest.step1Title"), body: t("guest.step1Body") },
      { icon: "🔍", title: t("guest.step2Title"), body: t("guest.step2Body") },
      { icon: "🤝", title: t("guest.step3Title"), body: t("guest.step3Body") },
    ];
    const features = [
      { icon: "🗺️", label: t("guest.featureMap") },
      { icon: "🔄", label: t("guest.featureModes") },
      { icon: "🪙", label: t("guest.featureCredit") },
      { icon: "💬", label: t("guest.featureCommunity") },
      { icon: "🤖", label: t("guest.featureAssistant") },
      { icon: "🌐", label: t("guest.featureBilingual") },
    ];
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="mt-6 text-5xl">📚</div>
        <h1 className="mt-4 text-2xl font-bold">{t("guest.title")}</h1>
        <p className="mt-3 max-w-md text-stone-600">{t("guest.body")}</p>

        <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link href="/register" className="btn-primary">
            {t("guest.registerCta")}
          </Link>
          <Link href="/login" className="btn-secondary">
            {t("guest.loginCta")}
          </Link>
        </div>

        <form action={demoLoginAction} className="mt-2">
          <button type="submit" className="btn-ghost text-brand-600">
            {t("guest.demoCta")} →
          </button>
        </form>
        {sp.demo === "error" ? (
          <p className="mt-2 max-w-md text-sm text-stone-500">{t("guest.demoError")}</p>
        ) : null}

        <div className="card mt-8 w-full p-5 text-left">
          <h2 className="text-lg font-semibold text-stone-800">
            {t("guest.howTitle")}
          </h2>
          <p className="mt-1 text-sm text-stone-500">{t("guest.howSubtitle")}</p>
          <ol className="mt-4 space-y-4">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-lg">
                  {step.icon}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-stone-800">
                    <span className="mr-1.5 text-brand-600">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm leading-6 text-stone-600">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="card mt-4 w-full p-5 text-left">
          <h2 className="text-lg font-semibold text-stone-800">
            {t("guest.featuresTitle")}
          </h2>
          <ul className="mt-3 grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {features.map((feature) => (
              <li
                key={feature.label}
                className="flex items-start gap-2 text-sm text-stone-700"
              >
                <span className="shrink-0 text-base leading-6">{feature.icon}</span>
                <span className="leading-6">{feature.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card mt-4 w-full max-w-md p-4 text-left">
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

  const hasFilters = Boolean(
    filters.search || filters.language || filters.age_range || filters.status
  );

  const books = await listBooks(activeGroup.id, filters);
  const facets = await getBookFacets(activeGroup.id, user.id);

  // Founders who haven't finished the setup guide get a persistent nudge back
  // into it — until the club is off the ground (books shared + a neighbor joined)
  // or they explicitly dismiss it.
  let showSetupNudge = false;
  if (activeGroup.role === "admin") {
    const membership = await getMembership(user.id, activeGroup.id);
    if (membership && !membership.onboarding_dismissed_at) {
      const founderBooks = await countBooksOwnedByUser(user.id, activeGroup.id);
      showSetupNudge = founderBooks < 3 || activeGroup.member_count < 2;
    }
  }

  return (
    <div>
      {showSetupNudge ? (
        <Link
          href={`/groups/${activeGroup.id}/setup`}
          className="mb-4 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-brand-900 transition hover:bg-brand-100"
        >
          <span className="text-2xl">🚀</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("setup.nudgeTitle")}</span>
            <span className="block text-xs text-brand-700">{t("setup.nudgeBody")}</span>
          </span>
          <span className="shrink-0 text-sm">→</span>
        </Link>
      ) : null}
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
          <BookLocationsMap
            books={books}
            viewerZip={user.home_zip}
            viewerId={user.id}
            t={t}
          />
        </div>

        <div className="min-w-0 lg:order-1">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold">{t("catalog.title")}</h1>
            <span className="text-sm text-stone-500">
              {t("catalog.count", { n: books.length })}
            </span>
          </div>

          {books.length === 0 ? (
            hasFilters ? (
              <div className="card p-8 text-center text-stone-500">
                {t("catalog.noResults")}
              </div>
            ) : (
              <div className="card space-y-4 p-6 text-center">
                <div>
                  <div className="text-3xl">📚</div>
                  <h2 className="mt-2 font-semibold text-stone-800">
                    {t("catalog.emptyTitle")}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {t("catalog.emptyBody")}
                  </p>
                </div>
                <div className="space-y-3 text-left">
                  <div className="rounded-xl border border-stone-200 p-3">
                    <Link href="/books/new" className="btn-primary w-full">
                      ➕ {t("catalog.emptyAdd")}
                    </Link>
                    <p className="mt-2 text-xs text-stone-500">
                      {t("catalog.emptyAddHint")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-stone-200 p-3">
                    <Link href="/groups" className="btn-secondary w-full">
                      👥 {t("catalog.emptyInvite")}
                    </Link>
                    <p className="mt-2 text-xs text-stone-500">
                      {t("catalog.emptyInviteHint")}
                    </p>
                  </div>
                </div>
              </div>
            )
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
