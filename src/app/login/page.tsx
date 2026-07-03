import { redirect } from "next/navigation";
import Link from "next/link";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { PasswordInput } from "@/components/PasswordInput";
import { ValidatedInput } from "@/components/ValidatedInput";

export default async function LoginPage({
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
  const reset = typeof sp.reset === "string" ? sp.reset : undefined;

  if (user) redirect(next ?? "/");

  return (
    <div className="mx-auto mt-4 max-w-md">
      <h1 className="text-2xl font-bold">{t("login.title")}</h1>
      <p className="mt-2 text-sm text-stone-600">{t("login.subtitle")}</p>

      <form action={loginAction} className="card mt-6 space-y-4 p-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <p className="text-xs text-stone-500">{t("login.requiredHint")}</p>
        {error === "missing_required" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("login.missingRequired")}
          </p>
        ) : null}
        {error === "invalid_credentials" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("login.invalidCredentials")}
          </p>
        ) : null}
        {error === "weak_password" ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {t("login.passwordInvalid")}
          </p>
        ) : null}
        {reset === "success" ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t("login.resetSuccess")}
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
            autoComplete="current-password"
            className="input"
            requiredMessage={t("login.passwordRequired")}
            tooShortMessage={t("login.passwordInvalid")}
            showLabel={t("password.show")}
            hideLabel={t("password.hide")}
          />
        </div>

        <button type="submit" className="btn-primary w-full">
          {t("login.submit")}
        </button>
        <Link
          href="/forgot-password"
          className="block text-center text-sm text-brand-600"
        >
          {t("login.forgotPassword")}
        </Link>
        <Link
          href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}
          className="block text-center text-sm text-brand-600"
        >
          {t("login.createAccount")}
        </Link>
        <p className="text-xs text-stone-400">{t("login.note")}</p>
      </form>
    </div>
  );
}

function RequiredMark({ label }: { label: string }) {
  return <span className="text-xs font-normal text-red-500">{label}</span>;
}
