import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { dismissOnboardingAction } from "@/app/actions";
import { CopyInvite } from "@/components/CopyInvite";
import { getCurrentUser } from "@/lib/auth";
import { createTranslator, getLocale } from "@/lib/i18n";
import {
  countBooksOwnedByUser,
  getGroupById,
  getGroupMemberIds,
  getMembership,
} from "@/lib/repo";

const BOOK_GOAL = 3;

async function inviteUrl(code: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  // Fall back to a relative path if the host header is somehow missing; the QR
  // still encodes something usable and the copy button rebuilds it client-side.
  if (!host) return `/join/${code}`;
  return `${proto}://${host}/join/${code}`;
}

function StepBadge({ done, n }: { done: boolean; n: number }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
        done ? "bg-emerald-100 text-emerald-700" : "bg-brand-50 text-brand-600"
      }`}
    >
      {done ? "✓" : n}
    </span>
  );
}

export default async function ClubSetupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = createTranslator(locale);

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/groups/${id}/setup`);

  const membership = await getMembership(user.id, id);
  if (!membership || membership.role !== "admin") redirect("/groups");

  const group = await getGroupById(id);
  if (!group) redirect("/groups");

  const [bookCount, memberIds] = await Promise.all([
    countBooksOwnedByUser(user.id, id),
    getGroupMemberIds(id),
  ]);
  const memberCount = memberIds.length;

  const booksDone = bookCount >= BOOK_GOAL;
  const inviteDone = memberCount > 1;
  const completed = (booksDone ? 1 : 0) + (inviteDone ? 1 : 0);

  const url = await inviteUrl(group.invite_code);
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 240,
    margin: 1,
    color: { dark: "#1c1917", light: "#ffffff" },
  });

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="text-center">
        <div className="text-4xl">🎉</div>
        <h1 className="mt-2 text-xl font-bold text-stone-800">{t("setup.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {t("setup.subtitle", { group: group.name })}
        </p>
        <p className="mt-3 text-xs font-medium text-brand-600">
          {t("setup.progress", { done: completed, total: 2 })}
        </p>
      </div>

      {/* Step 1: add your first books */}
      <div className="card space-y-3 p-5">
        <div className="flex items-start gap-3">
          <StepBadge done={booksDone} n={1} />
          <div className="min-w-0">
            <h2 className="font-semibold text-stone-800">{t("setup.step1Title")}</h2>
            <p className="mt-0.5 text-sm text-stone-500">{t("setup.step1Body")}</p>
          </div>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-stone-700">{t("setup.booksAdded")}</span>
            <span className={booksDone ? "text-emerald-600" : "text-stone-500"}>
              {bookCount} / {BOOK_GOAL}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${Math.min(100, (bookCount / BOOK_GOAL) * 100)}%` }}
            />
          </div>
        </div>
        <Link href="/books/new" className="btn-primary w-full">
          ➕ {t("setup.addBook")}
        </Link>
        <p className="text-xs text-stone-500">{t("setup.addBookHint")}</p>
      </div>

      {/* Step 2: invite neighbors (QR + link) */}
      <div className="card space-y-3 p-5">
        <div className="flex items-start gap-3">
          <StepBadge done={inviteDone} n={2} />
          <div className="min-w-0">
            <h2 className="font-semibold text-stone-800">{t("setup.step2Title")}</h2>
            <p className="mt-0.5 text-sm text-stone-500">{t("setup.step2Body")}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl bg-stone-50 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt={t("setup.qrAlt")}
            width={200}
            height={200}
            className="rounded-lg bg-white p-2 shadow-sm"
          />
          <p className="text-center text-xs text-stone-500">{t("setup.qrHint")}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">{t("groups.invite")}:</span>
            <span className="font-mono text-sm font-semibold text-stone-800">
              {group.invite_code}
            </span>
          </div>
          <CopyInvite code={group.invite_code} label={t("groups.copyInvite")} />
        </div>
        <p className="text-xs text-stone-500">
          {inviteDone
            ? t("setup.inviteJoined", { n: memberCount - 1 })
            : t("setup.inviteWaiting")}
        </p>
      </div>

      {/* Step 3: done */}
      <div className="card space-y-3 p-5">
        <div className="flex items-start gap-3">
          <StepBadge done={completed === 2} n={3} />
          <div className="min-w-0">
            <h2 className="font-semibold text-stone-800">{t("setup.step3Title")}</h2>
            <p className="mt-0.5 text-sm text-stone-500">{t("setup.step3Body")}</p>
          </div>
        </div>
        <form action={dismissOnboardingAction}>
          <input type="hidden" name="group_id" value={group.id} />
          <button type="submit" className="btn-primary w-full">
            {t("setup.finish")}
          </button>
        </form>
        <Link
          href="/"
          className="block text-center text-xs text-stone-400 hover:text-stone-600"
        >
          {t("setup.remindLater")}
        </Link>
      </div>
    </div>
  );
}
