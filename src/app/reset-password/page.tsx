import Link from "next/link";
import { createTranslator, getLocale } from "@/lib/i18n";
import { resetPasswordAction } from "@/app/actions";
import { PasswordInput } from "@/components/PasswordInput";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const error = typeof sp.error === "string" ? sp.error : undefined;

  return (
    <div className="mx-auto mt-4 max-w-md">
      <h1 className="text-2xl font-bold">{t("reset.title")}</h1>
      <p className="mt-2 text-sm text-stone-600">{t("reset.subtitle")}</p>

      <form action={resetPasswordAction} className="card mt-6 space-y-4 p-4">
        <input type="hidden" name="token" value={token} />

        {error === "missing_required" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("reset.missingRequired")}
          </p>
        ) : null}
        {error === "weak_password" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("login.passwordInvalid")}
          </p>
        ) : null}
        {error === "invalid_token" || !token ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("reset.invalidToken")}
          </p>
        ) : null}

        <div>
          <label className="label flex items-center gap-1" htmlFor="password">
            {t("reset.newPassword")}
            <span className="text-xs font-normal text-red-500">
              {t("common.required")}
            </span>
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
            capsLockLabel={t("password.capsLock")}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={!token}>
          {t("reset.submit")}
        </button>
        <Link
          href="/forgot-password"
          className="block text-center text-sm text-brand-600"
        >
          {t("reset.requestAgain")}
        </Link>
      </form>
    </div>
  );
}
