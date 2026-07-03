import { redirect } from "next/navigation";
import { createTranslator, getLocale } from "@/lib/i18n";
import { getSessionContext } from "@/lib/context";
import {
  createGroupAction,
  joinGroupAction,
  setContactableAction,
  setGroupPolicyAction,
  setPaymentHandlesAction,
  switchGroupAction,
} from "@/app/actions";
import { CopyInvite } from "@/components/CopyInvite";

export default async function GroupsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const { user, groups, activeGroup } = await getSessionContext();

  if (!user) redirect("/login?next=/groups");

  const contactable = user.contactable !== 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{t("groups.title")}</h1>
        <p className="mt-1 text-sm text-stone-500">{t("groups.subtitle")}</p>
      </div>

      <form action={setContactableAction} className="card space-y-3 p-4">
        <h2 className="font-medium">{t("contact.title")}</h2>
        <p className="text-sm text-stone-500">
          {contactable ? t("contact.on") : t("contact.off")}
        </p>
        <input type="hidden" name="contactable" value={contactable ? "0" : "1"} />
        <button className={contactable ? "btn-secondary w-full" : "btn-primary w-full"}>
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
            placeholder="paypal.me/yourname"
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

      {groups.length === 0 ? (
        <p className="card p-4 text-sm text-stone-400">{t("groups.none")}</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const active = activeGroup?.id === g.id;
            return (
              <div key={g.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">{g.name}</h2>
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
                  {g.role === "admin" ? (
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
                </div>
                <div className="mt-3">
                  <CopyInvite code={g.invite_code} label={t("groups.copyInvite")} />
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      <form action={joinGroupAction} className="card space-y-3 p-4">
        <h2 className="font-medium">{t("groups.join")}</h2>
        <div>
          <label className="label" htmlFor="code">
            {t("groups.joinCode")}
          </label>
          <input id="code" name="code" required className="input font-mono uppercase" />
        </div>
        <button className="btn-secondary w-full">{t("groups.joinSubmit")}</button>
      </form>
    </div>
  );
}
