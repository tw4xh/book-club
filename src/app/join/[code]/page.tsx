import { notFound, redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getCurrentUser } from "@/lib/auth";
import { getGroupByInviteCode, getMembership } from "@/lib/repo";
import { confirmJoinAction, switchGroupAction } from "@/app/actions";
import { ValidatedInput } from "@/components/ValidatedInput";

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = createTranslator(locale);
  const user = await getCurrentUser();

  if (!user) redirect(`/login?next=/join/${code}`);

  const group = getGroupByInviteCode(code);
  if (!group) notFound();

  const alreadyMember = !!getMembership(user.id, group.id);
  const agreeError = sp.error === "agree";

  return (
    <div className="mx-auto mt-8 max-w-md">
      <div className="text-center">
        <div className="text-4xl">👋📚</div>
        <h1 className="mt-4 text-xl font-bold">{t("join.title")}</h1>
        <p className="mt-2 text-stone-600">{group.name}</p>
      </div>

      <div className="card mt-6 p-4">
        <h2 className="text-sm font-semibold text-stone-700">
          {t("join.policyTitle")}
        </h2>
        {group.policy ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
            {group.policy}
          </p>
        ) : (
          <p className="mt-2 text-sm text-stone-400">{t("join.noPolicy")}</p>
        )}
      </div>

      {alreadyMember ? (
        <form action={switchGroupAction} className="mt-6">
          <input type="hidden" name="group_id" value={group.id} />
          <button className="btn-primary w-full">
            {t("join.confirm", { name: group.name })}
          </button>
        </form>
      ) : (
        <form action={confirmJoinAction} className="mt-6 space-y-3">
          <input type="hidden" name="code" value={group.invite_code} />
          {group.policy ? (
            <label className="flex items-start gap-2 text-sm text-stone-700">
              <ValidatedInput
                type="checkbox"
                name="agree"
                value="1"
                required
                className="mt-0.5 h-4 w-4"
                requiredMessage={t("join.agreeError")}
              />
              <span>{t("join.agree")}</span>
            </label>
          ) : null}
          {agreeError ? (
            <p className="text-sm text-red-600">{t("join.agreeError")}</p>
          ) : null}
          <button className="btn-primary w-full">
            {group.policy
              ? t("join.agreeAndJoin", { name: group.name })
              : t("join.confirm", { name: group.name })}
          </button>
        </form>
      )}
    </div>
  );
}
