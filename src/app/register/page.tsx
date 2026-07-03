import { redirect } from "next/navigation";
import Link from "next/link";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { registerAction } from "@/app/actions";
import { PasswordInput } from "@/components/PasswordInput";
import { ValidatedInput } from "@/components/ValidatedInput";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? sp.error : undefined;

  if (user) redirect(next ?? "/");

  return (
    <div className="mx-auto mt-4 max-w-md">
      <h1 className="text-2xl font-bold">{t("register.title")}</h1>
      <p className="mt-2 text-sm text-stone-600">{t("register.subtitle")}</p>

      <form action={registerAction} className="card mt-6 space-y-4 p-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <p className="text-xs text-stone-500">{t("register.requiredHint")}</p>
        {error === "missing_required" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("register.missingRequired")}
          </p>
        ) : null}
        {error === "email_exists" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("register.emailExists")}
          </p>
        ) : null}
        {error === "weak_password" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("login.passwordInvalid")}
          </p>
        ) : null}

        <div>
          <label className="label flex items-center gap-1" htmlFor="email">
            {t("login.email")}
            <RequiredMark label={t("common.required")} />
          </label>
          <ValidatedInput
            id="email"
            name="email"
            type="email"
            required
            aria-required="true"
            autoComplete="email"
            className="input"
            requiredMessage={t("login.emailRequired")}
            typeMessage={t("login.emailInvalid")}
          />
        </div>

        <div>
          <label className="label flex items-center gap-1" htmlFor="name">
            {t("login.name")}
            <RequiredMark label={t("common.required")} />
          </label>
          <ValidatedInput
            id="name"
            name="name"
            type="text"
            required
            aria-required="true"
            placeholder={t("login.namePlaceholder")}
            className="input"
            requiredMessage={t("login.nameRequired")}
          />
        </div>

        <div>
          <label className="label flex items-center gap-1" htmlFor="password">
            {t("login.password")}
            <RequiredMark label={t("common.required")} />
          </label>
          <PasswordInput
            id="password"
            name="password"
            required
            minLength={6}
            aria-required="true"
            autoComplete="new-password"
            className="input"
            requiredMessage={t("login.passwordRequired")}
            tooShortMessage={t("login.passwordInvalid")}
            showLabel={t("password.show")}
            hideLabel={t("password.hide")}
          />
          <p className="mt-1 text-xs text-stone-400">{t("register.passwordHint")}</p>
        </div>

        <div>
          <label className="label flex items-center gap-1" htmlFor="contact">
            {t("login.contact")}
            <OptionalMark label={t("common.optional")} />
          </label>
          <input
            id="contact"
            name="contact"
            type="text"
            placeholder={t("login.contactPlaceholder")}
            className="input"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label flex items-center gap-1" htmlFor="home_area">
              {t("login.area")}
              <OptionalMark label={t("common.optional")} />
            </label>
            <input
              id="home_area"
              name="home_area"
              type="text"
              placeholder={t("login.areaPlaceholder")}
              className="input"
            />
          </div>
          <div>
            <label className="label flex items-center gap-1" htmlFor="home_zip">
              {t("login.zip")}
              <RequiredMark label={t("common.required")} />
            </label>
            <ValidatedInput
              id="home_zip"
              name="home_zip"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{5}"
              required
              aria-required="true"
              placeholder={t("login.zipPlaceholder")}
              className="input"
              requiredMessage={t("login.zipRequired")}
              patternMessage={t("login.zipInvalid")}
            />
          </div>
        </div>

        <div>
          <label className="label flex items-center gap-1" htmlFor="wechat_nickname">
            {t("login.wechat")}
            <OptionalMark label={t("common.optional")} />
          </label>
          <input
            id="wechat_nickname"
            name="wechat_nickname"
            type="text"
            className="input"
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          {t("register.submit")}
        </button>
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="block text-center text-sm text-brand-600"
        >
          {t("register.haveAccount")}
        </Link>
        <p className="text-xs text-stone-400">{t("login.note")}</p>
      </form>
    </div>
  );
}

function RequiredMark({ label }: { label: string }) {
  return <span className="text-xs font-normal text-red-500">{label}</span>;
}

function OptionalMark({ label }: { label: string }) {
  return <span className="text-xs font-normal text-stone-400">{label}</span>;
}
