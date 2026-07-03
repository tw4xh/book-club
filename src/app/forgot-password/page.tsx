import Link from "next/link";
import { createTranslator, getLocale } from "@/lib/i18n";
import { requestPasswordResetAction } from "@/app/actions";
import { ValidatedInput } from "@/components/ValidatedInput";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const token = typeof sp.token === "string" ? sp.token : null;
  const resetHref = token ? `/reset-password?token=${encodeURIComponent(token)}` : null;

  return (
    <div className="mx-auto mt-4 max-w-md">
      <h1 className="text-2xl font-bold">{t("forgot.title")}</h1>
      <p className="mt-2 text-sm text-stone-600">{t("forgot.subtitle")}</p>

      <form action={requestPasswordResetAction} className="card mt-6 space-y-4 p-4">
        {sent ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {t("forgot.sent")}
          </p>
        ) : null}

        {resetHref ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">{t("forgot.devTitle")}</p>
            <p className="mt-1 text-xs">{t("forgot.devHint")}</p>
            <Link href={resetHref} className="btn-primary mt-2 w-full">
              {t("forgot.openReset")}
            </Link>
          </div>
        ) : null}

        <div>
          <label className="label flex items-center gap-1" htmlFor="email">
            {t("login.email")}
            <span className="text-xs font-normal text-red-500">
              {t("common.required")}
            </span>
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

        <button type="submit" className="btn-primary w-full">
          {t("forgot.submit")}
        </button>
        <Link href="/login" className="block text-center text-sm text-brand-600">
          {t("forgot.backToLogin")}
        </Link>
      </form>
    </div>
  );
}
