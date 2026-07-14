import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import {
  closeGroupAction,
  createGroupAction,
  joinGroupAction,
  leaveGroupAction,
  setContactableAction,
  setGroupCreditModeAction,
  setGroupPolicyAction,
  setPaymentHandlesAction,
  setProfileAction,
  switchGroupAction,
} from "@/app/actions";
import { CopyInvite } from "@/components/CopyInvite";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, groups, activeGroup } = await getSessionContext();
  const sp = await searchParams;
  const leaveStatus = typeof sp.leave === "string" ? sp.leave : "";
  const profileStatus = typeof sp.profile === "string" ? sp.profile : "";
  const closeStatus = typeof sp.close === "string" ? sp.close : "";

  if (!user) redirect("/login?next=/groups");

  const contactable = user.contactable !== 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("groups.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("groups.subtitle")}</p>
      </div>

      {leaveStatus === "success" ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t("groups.leaveSuccess")}
        </p>
      ) : leaveStatus === "last_admin" ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("groups.leaveLastAdmin")}
        </p>
      ) : null}
      {profileStatus === "success" ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t("profile.saved")}
        </p>
      ) : profileStatus === "missing" ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("profile.missing")}
        </p>
      ) : null}
      {closeStatus === "success" ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t("groups.closeSuccess")}
        </p>
      ) : closeStatus === "confirm" ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("groups.closeConfirmError")}
        </p>
      ) : closeStatus === "missing" ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("groups.closeMissing")}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("groups.none")}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const active = activeGroup?.id === g.id;
            const isAdmin = g.role === "admin";
            return (
              <div
                key={g.id}
                className={`card p-4 ${
                  isAdmin ? "border-amber-200 bg-amber-50/70 shadow-amber-100" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate font-medium">{g.name}</h2>
                      {isAdmin ? (
                        <span className="chip bg-amber-100 text-amber-800">
                          {t("groups.adminBadge")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {g.type ? `${g.type} · ` : ""}
                      {g.member_count} 👤 · {t("groups.invite")}:{" "}
                      <span className="font-mono">{g.invite_code}</span>
                    </p>
                  </div>
                  {active ? (
                    <span className="chip bg-brand-100 text-brand-700">
                      {t("groups.active")}
                    </span>
                  ) : (
                    <form action={switchGroupAction}>
                      <input type="hidden" name="group_id" value={g.id} />
                      <button className="btn-ghost px-2 py-1 text-xs">
                        {t("groups.switch")}
                      </button>
                    </form>
                  )}
                </div>
                <div className="mt-3 rounded-xl bg-stone-50 p-3">
                  <p className="text-xs font-semibold text-stone-500">
                    {t("groups.policy")}
                  </p>
                  {g.policy ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                      {g.policy}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-stone-400">
                      {t("groups.policyNone")}
                    </p>
                  )}
                  {isAdmin ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-brand-600">
                        {t("groups.editPolicy")}
                      </summary>
                      <form action={setGroupPolicyAction} className="mt-2 space-y-2">
                        <input type="hidden" name="group_id" value={g.id} />
                        <textarea
                          name="policy"
                          rows={4}
                          defaultValue={g.policy ?? ""}
                          placeholder={t("groups.createPolicyHint")}
                          className="input text-sm"
                        />
                        <button className="btn-secondary w-full py-1.5 text-xs">
                          {t("groups.savePolicy")}
                        </button>
                      </form>
                    </details>
                  ) : null}
                  {isAdmin ? (
                    <div className="mt-3 border-t border-stone-200 pt-3">
                      <p className="text-xs font-semibold text-stone-500">
                        {t("groups.creditModeTitle")}
                      </p>
                      <p className="mt-1 text-sm text-stone-700">
                        {g.credit_mode === "credit"
                          ? t("groups.creditModeCredit")
                          : t("groups.creditModeTrust")}
                      </p>
                      <p className="mt-1 text-xs text-stone-400">
                        {t("groups.creditModeHint")}
                      </p>
                      <form action={setGroupCreditModeAction} className="mt-2">
                        <input type="hidden" name="group_id" value={g.id} />
                        <input
                          type="hidden"
                          name="credit_mode"
                          value={g.credit_mode === "credit" ? "trust" : "credit"}
                        />
                        <button className="btn-secondary w-full py-1.5 text-xs">
                          {g.credit_mode === "credit"
                            ? t("groups.creditModeDisable")
                            : t("groups.creditModeEnable")}
                        </button>
                      </form>
                    </div>
                  ) : null}
                  {isAdmin ? (
                    <details className="mt-3 border-t border-stone-200 pt-3">
                      <summary className="cursor-pointer text-xs font-medium text-red-600">
                        {t("groups.close")}
                      </summary>
                      <form action={closeGroupAction} className="mt-2 space-y-2">
                        <input type="hidden" name="group_id" value={g.id} />
                        <p className="text-xs text-red-700">{t("groups.closeHint")}</p>
                        <label
                          className="label text-xs"
                          htmlFor={`close_confirm_${g.id}`}
                        >
                          {t("groups.closeConfirmLabel")}
                        </label>
                        <input
                          id={`close_confirm_${g.id}`}
                          name="confirm_name"
                          placeholder={g.name}
                          className="input text-sm"
                        />
                        <button className="btn-secondary w-full border-red-200 py-1.5 text-xs text-red-700 hover:bg-red-50">
                          {t("groups.closeSubmit")}
                        </button>
                      </form>
                    </details>
                  ) : null}
                </div>
                <div className="mt-3 space-y-2">
                  <CopyInvite code={g.invite_code} label={t("groups.copyInvite")} />
                  <form action={leaveGroupAction}>
                    <input type="hidden" name="group_id" value={g.id} />
                    <button className="btn-ghost w-full text-red-600 hover:bg-red-50">
                      {t("groups.leave")}
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <form action={joinGroupAction} className="card space-y-3 p-4">
            <h2 className="font-medium">{t("groups.join")}</h2>
            <div>
              <label className="label" htmlFor="code">
                {t("groups.joinCode")}
              </label>
              <input
                id="code"
                name="code"
                required
                className="input font-mono uppercase"
              />
            </div>
            <button className="btn-secondary w-full">{t("groups.joinSubmit")}</button>
          </form>

          <form action={createGroupAction} className="card space-y-3 p-4">
            <h2 className="font-medium">{t("groups.create")}</h2>
            <div>
              <label className="label" htmlFor="name">
                {t("groups.createName")}
              </label>
              <input id="name" name="name" required className="input" />
            </div>
            <div>
              <label className="label" htmlFor="policy">
                {t("groups.createPolicy")}
              </label>
              <textarea
                id="policy"
                name="policy"
                rows={4}
                placeholder={t("groups.createPolicyHint")}
                className="input"
              />
            </div>
            <button className="btn-primary w-full">{t("groups.createSubmit")}</button>
          </form>
        </div>

        <div className="space-y-4">
          <form action={setProfileAction} className="card space-y-3 p-4">
            <div>
              <h2 className="font-medium">{t("profile.title")}</h2>
              <p className="mt-1 text-sm text-stone-500">{t("profile.hint")}</p>
            </div>
            <div>
              <label className="label" htmlFor="profile_name">
                {t("profile.name")}
              </label>
              <input
                id="profile_name"
                name="name"
                required
                defaultValue={user.name}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="profile_wechat">
                {t("profile.wechat")}
              </label>
              <input
                id="profile_wechat"
                name="wechat_nickname"
                defaultValue={user.wechat_nickname ?? ""}
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="profile_contact">
                {t("profile.contact")}
              </label>
              <input
                id="profile_contact"
                name="contact"
                defaultValue={user.contact ?? ""}
                className="input"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="profile_area">
                  {t("profile.area")}
                </label>
                <input
                  id="profile_area"
                  name="home_area"
                  defaultValue={user.home_area ?? ""}
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor="profile_zip">
                  {t("profile.zip")}
                </label>
                <input
                  id="profile_zip"
                  name="home_zip"
                  inputMode="numeric"
                  defaultValue={user.home_zip ?? ""}
                  placeholder={t("login.zipPlaceholder")}
                  className="input"
                />
              </div>
            </div>
            <button className="btn-primary w-full">{t("profile.save")}</button>
          </form>

          <form action={setContactableAction} className="card space-y-3 p-4">
            <h2 className="font-medium">{t("contact.title")}</h2>
            <p className="text-sm text-stone-500">
              {contactable ? t("contact.on") : t("contact.off")}
            </p>
            <input type="hidden" name="contactable" value={contactable ? "0" : "1"} />
            <button
              className={contactable ? "btn-secondary w-full" : "btn-primary w-full"}
            >
              {contactable ? t("contact.turnOff") : t("contact.turnOn")}
            </button>
          </form>

          <form action={setPaymentHandlesAction} className="card space-y-3 p-4">
            <div>
              <h2 className="font-medium">{t("pay.title")}</h2>
              <p className="mt-1 text-sm text-stone-500">{t("pay.hint")}</p>
            </div>
            <div>
              <label className="label" htmlFor="pay_paypal">
                {t("pay.paypal")}
              </label>
              <input
                id="pay_paypal"
                name="pay_paypal"
                defaultValue={user.pay_paypal ?? ""}
                placeholder="paypal@example.com"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="pay_venmo">
                {t("pay.venmo")}
              </label>
              <input
                id="pay_venmo"
                name="pay_venmo"
                defaultValue={user.pay_venmo ?? ""}
                placeholder="@your-venmo"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="pay_wechat">
                {t("pay.wechat")}
              </label>
              <input
                id="pay_wechat"
                name="pay_wechat"
                defaultValue={user.pay_wechat ?? ""}
                placeholder="微信号"
                className="input"
              />
            </div>
            <button className="btn-secondary w-full">{t("pay.save")}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
