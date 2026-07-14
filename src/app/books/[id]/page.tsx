import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createTranslator, getLocale, type Translator } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import {
  BORROW_COST,
  getBookById,
  getBookHoldings,
  getBookReviews,
  getBookReviewSummary,
  getCreditBalance,
  getMembership,
  getUserById,
  getUserRating,
  isCreditModeOn,
} from "@/lib/repo";
import { directionsUrl, driveBetween } from "@/lib/geo";
import { StatusBadge } from "@/components/StatusBadge";
import { LocationMap } from "@/components/LocationMap";
import { CopyText } from "@/components/CopyText";
import type { BookHolding, UserRating } from "@/lib/types";
import {
  addBookReviewAction,
  claimBookAction,
  rateBorrowerAction,
  returnToOwnerAction,
  setBookVisibilityAction,
  setStatusAction,
} from "@/app/actions";

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user } = await getSessionContext();

  if (!user) redirect(`/login?next=/books/${id}`);

  const book = await getBookById(id);
  if (!book) notFound();
  if (!(await getMembership(user.id, book.group_id))) redirect("/");

  const isHolder = book.current_holder_user_id === user.id;
  const isOwner = book.owner_user_id === user.id;
  const isLend = book.share_mode === "lend";
  const isHiddenLend = isLend && book.visible_to_others === 0;
  if (isHiddenLend && !isOwner && !isHolder) notFound();
  const reading = book.status === "reading";

  const holdings = await getBookHoldings(book.id);
  const holderRating = await getUserRating(book.current_holder_user_id);
  const ownerRating = await getUserRating(book.owner_user_id);
  const reviews = await getBookReviews(book.id);
  const reviewSummary = await getBookReviewSummary(book.id);
  const owner = await getUserById(book.owner_user_id);
  const ownerPay = owner
    ? {
        paypal: payDisplay(owner.pay_paypal),
        venmo: payLink(owner.pay_venmo),
        wechat: owner.pay_wechat,
      }
    : { paypal: null, venmo: null, wechat: null };
  const ownerHasPay =
    !isOwner && Boolean(ownerPay.paypal || ownerPay.venmo || ownerPay.wechat);
  const creditOn = await isCreditModeOn(book.group_id);
  const myCredit = await getCreditBalance(user.id, book.group_id);
  const borrowCost = BORROW_COST;
  const canBorrowBook = !creditOn || myCredit >= borrowCost;
  const needCreditError = sp.error === "needcredit";
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const locationLabel = book.location_zip;
  const drive = driveBetween(user.home_zip, book.location_zip);
  const directions = directionsUrl(user.home_zip, book.location_zip);

  return (
    <div className="mx-auto max-w-md">
      <Link href="/" className="btn-ghost mb-3 px-0 text-sm">
        ← {t("common.back")}
      </Link>

      <div className="card overflow-hidden">
        <div className="flex gap-4 p-4">
          <div className="h-40 w-28 flex-shrink-0 overflow-hidden rounded-xl bg-stone-100">
            {book.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.cover_image_url}
                alt={book.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl">
                📕
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={book.status} t={t} />
              <span
                className={`chip ${isLend ? "mode-chip--lend" : "mode-chip--flow"}`}
              >
                {isLend ? "↩️" : "🔄"} {t(`mode.${book.share_mode}`)}
              </span>
              {isHiddenLend ? (
                <span className="chip bg-stone-100 text-stone-600">
                  {t("book.hiddenBadge")}
                </span>
              ) : null}
            </div>
            <h1 className="text-xl font-bold leading-snug">{book.title}</h1>
            {book.author ? <p className="mt-1 text-stone-500">{book.author}</p> : null}
            <p className="mt-2 text-xs text-stone-400">
              {t("book.addedByOrigin", { name: book.owner_name })}
            </p>
            {isOwner ? (
              <Link
                href={`/books/${book.id}/edit`}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
              >
                ✏️ {t("book.edit")}
              </Link>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-px border-t border-stone-100 bg-stone-100 text-sm">
          <Row
            label={t("book.holder")}
            value={isHolder ? t("common.you") : book.holder_name}
          />
          {locationLabel ? (
            <Row label={t("book.location")} value={`📍 ${locationLabel}`} />
          ) : null}
          {drive ? (
            <Row
              label={t("book.distance")}
              value={`${t("book.miles", { mi: drive.miles })} · 🚗 ${t(
                "book.driveApprox",
                { min: drive.minutes }
              )}`}
            />
          ) : null}
          {book.language ? (
            <Row label={t("book.language")} value={book.language} />
          ) : null}
          {book.age_range ? <Row label={t("book.age")} value={book.age_range} /> : null}
          {book.category ? (
            <Row label={t("book.category")} value={book.category} />
          ) : null}
          {book.condition ? (
            <Row label={t("book.condition")} value={book.condition} />
          ) : null}
          {isLend && book.deposit ? (
            <Row label={t("book.deposit")} value={`💰 ${book.deposit}`} />
          ) : null}
          {book.notes ? <Row label={t("book.notes")} value={book.notes} /> : null}
        </dl>
      </div>

      {book.location_zip ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-700">{t("book.map")}</h2>
            {directions ? (
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                🧭 {t("book.directions")}
              </a>
            ) : null}
          </div>
          <LocationMap zip={book.location_zip} title={book.title} />
          {!user.home_zip ? (
            <p className="text-xs text-stone-400">{t("book.setZipHint")}</p>
          ) : null}
        </div>
      ) : null}

      {isOwner && isLend ? (
        <div className="card mt-4 space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold">{t("book.visibilityTitle")}</h2>
            <p className="mt-0.5 text-sm text-stone-500">
              {isHiddenLend ? t("book.visibilityHidden") : t("book.visibilityShown")}
            </p>
          </div>
          <form action={setBookVisibilityAction}>
            <input type="hidden" name="book_id" value={book.id} />
            <label className="flex items-start gap-2 rounded-xl bg-stone-50 p-3">
              <input
                type="checkbox"
                name="visible_to_others"
                defaultChecked={!isHiddenLend}
                className="mt-1"
              />
              <span className="text-sm text-stone-700">
                {t("book.visibilityCheckbox")}
              </span>
            </label>
            <button className="btn-secondary mt-3 w-full">
              {t("book.visibilitySave")}
            </button>
          </form>
        </div>
      ) : null}

      {isHolder && isLend && !isOwner ? (
        // Lend mode, you borrowed it: return it to the owner.
        <div className="card mt-4 space-y-3 p-4">
          <h2 className="text-base font-semibold">{t("book.returnTitle")}</h2>
          <p className="text-sm text-stone-600">
            {t("book.returnBody", { name: book.owner_name })}
          </p>
          {book.deposit ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              💰 {t("book.depositNote", { amount: book.deposit })}
            </p>
          ) : null}
          <PersonContact
            label={t("book.originalOwner")}
            name={book.owner_name}
            wechat={book.owner_wechat}
            contact={book.owner_contact}
            contactable={book.owner_contactable !== 0}
            rating={ownerRating}
            t={t}
          />
          <form action={returnToOwnerAction}>
            <input type="hidden" name="book_id" value={book.id} />
            <button className="btn-primary w-full">↩️ {t("book.returnToOwner")}</button>
          </form>
        </div>
      ) : isHolder ? (
        // You hold it (flow holder, or lend book at home with its owner).
        <div className="card mt-4 space-y-3 p-4">
          <h2 className="text-sm font-semibold text-stone-700">
            {t("book.holderStatus")}
          </h2>
          <p className="text-xs text-stone-500">{t("book.holderHint")}</p>
          <form action={setStatusAction}>
            <input type="hidden" name="book_id" value={book.id} />
            <input
              type="hidden"
              name="status"
              value={reading ? "available" : "reading"}
            />
            <button className="btn-secondary w-full">
              {reading ? t("book.markPassOn") : t("book.markReading")}
            </button>
          </form>
        </div>
      ) : (
        // Someone else has it: contact them to get it.
        <div className="card mt-4 space-y-3 p-4">
          <h2 className="text-base font-semibold">{t("book.contactTitle")}</h2>
          <p className="text-sm text-stone-600">
            {isLend ? t("book.lendContactBody") : t("book.contactBody")}
          </p>
          {isLend && book.deposit ? (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              💰 {t("book.depositNote", { amount: book.deposit })}
            </p>
          ) : null}
          <PersonContact
            label={t("book.getFrom")}
            name={book.holder_name}
            wechat={book.holder_wechat}
            contact={book.holder_contact}
            contactable={book.holder_contactable !== 0}
            rating={holderRating}
            t={t}
          />
          {book.owner_user_id !== book.current_holder_user_id ? (
            <PersonContact
              label={t("book.originalOwner")}
              name={book.owner_name}
              wechat={book.owner_wechat}
              contact={book.owner_contact}
              contactable={book.owner_contactable !== 0}
              rating={ownerRating}
              t={t}
            />
          ) : null}
          <div className="border-t border-stone-100 pt-3">
            {canBorrowBook ? (
              <>
                <p className="mb-2 text-xs text-stone-500">{t("book.flowNote")}</p>
                {creditOn ? (
                  <p className="mb-2 text-xs font-medium text-brand-700">
                    🪙{" "}
                    {t(
                      book.share_mode === "flow"
                        ? "credit.costFlow"
                        : "credit.costLend",
                      { cost: borrowCost }
                    )}
                  </p>
                ) : null}
                <form action={claimBookAction}>
                  <input type="hidden" name="book_id" value={book.id} />
                  <button className="btn-primary w-full">
                    ✋ {t("book.haveItNow")}
                  </button>
                </form>
              </>
            ) : (
              <div className="rounded-xl bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  🔒 {t("gate.title")}
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  {t("gate.balance", { cost: borrowCost, have: myCredit })}
                </p>
                <p className="mt-1 text-sm text-amber-700">{t("gate.hintLend")}</p>
                {needCreditError ? (
                  <p className="mt-1 text-sm text-red-600">{t("gate.blocked")}</p>
                ) : null}
                <Link href="/books/new" className="btn-primary mt-2 w-full">
                  ➕ {t("gate.cta")}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {ownerHasPay ? (
        <div className="card mt-4 space-y-3 p-4">
          <div>
            <h2 className="text-base font-semibold">
              🎁 {t("thank.title", { name: owner!.name })}
            </h2>
            <p className="mt-0.5 text-xs text-stone-500">{t("thank.hint")}</p>
          </div>
          <div className="space-y-2">
            {ownerPay.paypal?.type === "link" ? (
              <a
                href={ownerPay.paypal.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                <span>💳 {t("thank.paypal")}</span>
                <span className="text-brand-600">→</span>
              </a>
            ) : ownerPay.paypal?.type === "copy" ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-stone-700">
                  💳 {t("thank.paypal")}: {ownerPay.paypal.value}
                </span>
                <CopyText
                  text={ownerPay.paypal.value}
                  label={t("common.copy")}
                  copiedLabel={t("common.copied")}
                />
              </div>
            ) : null}
            {ownerPay.venmo ? (
              <a
                href={ownerPay.venmo}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                <span>💸 {t("thank.venmo")}</span>
                <span className="text-brand-600">→</span>
              </a>
            ) : null}
            {ownerPay.wechat ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-stone-700">
                    💚 {t("thank.wechat")}
                  </span>
                  <span className="ml-2 break-all text-stone-500">
                    {ownerPay.wechat}
                  </span>
                </span>
                <CopyText
                  text={ownerPay.wechat}
                  label={t("common.copy")}
                  copiedLabel={t("common.copied")}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="card mt-4 space-y-3 p-4">
        <div>
          <h2 className="text-base font-semibold">{t("book.history")}</h2>
          <p className="mt-0.5 text-xs text-stone-500">{t("book.historyHint")}</p>
        </div>
        <ol className="space-y-2">
          {holdings.map((h) => (
            <HistoryRow
              key={h.id}
              holding={h}
              bookId={book.id}
              ownerId={book.owner_user_id}
              currentUserId={user.id}
              canRate={isOwner}
              locale={locale}
              t={t}
            />
          ))}
        </ol>
      </div>

      <div className="card mt-4 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("review.title")}</h2>
          {reviewSummary.count > 0 && reviewSummary.avg != null ? (
            <span className="text-xs text-stone-500">
              <Stars n={reviewSummary.avg} />{" "}
              {t("review.avg", {
                avg: reviewSummary.avg.toFixed(1),
                count: reviewSummary.count,
              })}
            </span>
          ) : null}
        </div>

        {isOwner ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            {t("review.ownerNote")}
          </p>
        ) : (
          <form action={addBookReviewAction} className="space-y-2">
            <input type="hidden" name="book_id" value={book.id} />
            <p className="text-xs text-stone-400">{t("review.anonNote")}</p>
            <select name="stars" defaultValue="" className="input text-sm">
              <option value="">{t("review.noStars")}</option>
              <option value="5">★★★★★</option>
              <option value="4">★★★★</option>
              <option value="3">★★★</option>
              <option value="2">★★</option>
              <option value="1">★</option>
            </select>
            <textarea
              name="comment"
              rows={2}
              placeholder={t("review.placeholder")}
              className="input text-sm"
            />
            <button className="btn-secondary w-full py-1.5 text-sm">
              {t("review.submit")}
            </button>
          </form>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-stone-400">{t("review.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl bg-stone-50 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-500">
                    {r.user_id === user.id ? t("review.youAnon") : t("review.anon")}
                  </span>
                  {r.stars != null ? <Stars n={r.stars} /> : null}
                </div>
                {r.comment ? (
                  <p className="mt-1 whitespace-pre-wrap text-stone-700">{r.comment}</p>
                ) : null}
                <p className="mt-1 text-xs text-stone-400">{fmtDate(r.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  const full = Math.round(n);
  return (
    <span className="text-amber-500" aria-label={`${n} stars`}>
      {"★".repeat(full)}
      <span className="text-stone-300">{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

/**
 * Build a tappable payment URL from a stored handle. Accepts a full URL as-is
 * and otherwise constructs the Venmo link from a username.
 */
function payLink(value: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = encodeURIComponent(raw.replace(/^@/, ""));
  return `https://venmo.com/${handle}`;
}

type PayDisplay = { type: "link"; href: string } | { type: "copy"; value: string };

function payDisplay(value: string | null): PayDisplay | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return { type: "link", href: raw };
  if (raw.includes("@")) return { type: "copy", value: raw };
  const handle = encodeURIComponent(raw.replace(/^@/, ""));
  return { type: "link", href: `https://www.paypal.me/${handle}` };
}

function HistoryRow({
  holding,
  bookId,
  ownerId,
  currentUserId,
  canRate,
  locale,
  t,
}: {
  holding: BookHolding;
  bookId: string;
  ownerId: string;
  currentUserId: string;
  canRate: boolean;
  locale: string;
  t: Translator;
}) {
  const isOpen = !holding.ended_at;
  const statusLabel = isOpen
    ? t("history.current")
    : holding.ended_reason === "returned"
      ? t("history.returned")
      : t("history.passedOn");
  const isOwnerHolding = holding.holder_user_id === ownerId;
  const name =
    holding.holder_user_id === currentUserId ? t("common.you") : holding.holder_name;
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  // The owner may rate a completed borrow (not their own holding) once.
  const showRateForm =
    canRate && !isOwnerHolding && !isOpen && holding.rating_stars == null;

  return (
    <li className="rounded-xl bg-stone-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-stone-800">{name}</span>
        <span
          className={`chip ${
            isOpen
              ? "bg-emerald-100 text-emerald-700"
              : holding.ended_reason === "returned"
                ? "bg-sky-100 text-sky-700"
                : "bg-stone-200 text-stone-600"
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-stone-400">
        {fmt(holding.started_at)}
        {holding.ended_at ? ` – ${fmt(holding.ended_at)}` : ""}
      </p>

      {holding.rating_stars != null ? (
        <p className="mt-1 text-sm">
          <Stars n={holding.rating_stars} />
          {holding.rating_comment ? (
            <span className="ml-2 text-stone-500">{holding.rating_comment}</span>
          ) : null}
        </p>
      ) : null}

      {showRateForm ? (
        <form action={rateBorrowerAction} className="mt-2 space-y-2">
          <input type="hidden" name="holding_id" value={holding.id} />
          <input type="hidden" name="book_id" value={bookId} />
          <p className="text-xs font-medium text-stone-600">{t("rate.title")}</p>
          <select name="stars" defaultValue="5" className="input text-sm">
            <option value="5">{t("rate.star5")}</option>
            <option value="4">{t("rate.star4")}</option>
            <option value="3">{t("rate.star3")}</option>
            <option value="2">{t("rate.star2")}</option>
            <option value="1">{t("rate.star1")}</option>
          </select>
          <input
            name="comment"
            placeholder={t("rate.comment")}
            className="input text-sm"
          />
          <button className="btn-secondary w-full py-1.5 text-xs">
            {t("rate.submit")}
          </button>
        </form>
      ) : null}
    </li>
  );
}

function PersonContact({
  label,
  name,
  wechat,
  contact,
  contactable,
  rating,
  t,
}: {
  label: string;
  name: string;
  wechat: string | null;
  contact: string | null;
  contactable: boolean;
  rating?: UserRating;
  t: Translator;
}) {
  return (
    <div className="rounded-xl bg-brand-50 p-3 text-sm">
      <p className="text-xs text-stone-400">{label}</p>
      <div className="flex flex-wrap items-center gap-x-2">
        <p className="font-medium text-brand-800">{name}</p>
        {rating ? (
          rating.count > 0 && rating.avg != null ? (
            <span className="text-xs text-stone-500">
              {t("book.credit")} <Stars n={rating.avg} /> {rating.avg.toFixed(1)} ·{" "}
              {t("book.creditCount", { count: rating.count })}
            </span>
          ) : (
            <span className="text-xs text-stone-400">{t("book.noRatings")}</span>
          )
        ) : null}
      </div>
      {contactable ? (
        <>
          {wechat ? (
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 break-words text-stone-600">WeChat: {wechat}</p>
              <CopyText
                text={wechat}
                label={t("common.copy")}
                copiedLabel={t("common.copied")}
              />
            </div>
          ) : null}
          {contact ? (
            <div className="mt-1 flex items-center gap-2">
              <p className="min-w-0 break-words text-stone-800">{contact}</p>
              <CopyText
                text={contact}
                label={t("common.copy")}
                copiedLabel={t("common.copied")}
              />
            </div>
          ) : !wechat ? (
            <p className="mt-1 text-stone-400">{t("book.noContact")}</p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-stone-400">{t("book.notAcceptingContact")}</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 bg-white px-4 py-2.5">
      <dt className="w-28 flex-shrink-0 text-stone-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-stone-800">{value}</dd>
    </div>
  );
}
