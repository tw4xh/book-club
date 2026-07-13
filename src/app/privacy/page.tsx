import Link from "next/link";
import { getLocale } from "@/lib/i18n";

export const metadata = {
  title: "Privacy & AI Notice",
};

export default async function PrivacyPage() {
  const locale = await getLocale();
  return (
    <div className="mx-auto mt-4 max-w-2xl">
      {locale === "en" ? <PrivacyEn /> : <PrivacyZh />}
      <p className="mt-8 text-center text-sm">
        <Link href="/" className="text-brand-600">
          ← Home
        </Link>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-stone-800">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-stone-600">{children}</div>
    </section>
  );
}

function PrivacyZh() {
  return (
    <article>
      <h1 className="text-2xl font-bold">隐私与 AI 使用说明</h1>
      <p className="mt-2 text-sm text-stone-500">
        本站是一个非营利的邻里图书共享社区。我们只收集为社区运转所必需的信息，并尽量减少数据外传。
      </p>

      <Section title="我们收集的信息">
        <ul className="list-disc space-y-1 pl-5">
          <li>账号信息：昵称、邮箱、密码（以加密哈希保存，我们无法看到明文）。</li>
          <li>你主动填写的联系方式、微信昵称、所在区域与邮编（ZIP）。</li>
          <li>你发布的图书、书评、社区留言、想要的书等内容。</li>
        </ul>
      </Section>

      <Section title="信息如何被使用">
        <p>
          这些信息仅用于在你加入的书友会内部提供服务：展示书目与地图、记录借阅与漂流、社区交流等。
          你的联系方式只对同一书友会的成员可见，且可在个人设置中控制。
        </p>
      </Section>

      <Section title="图书助手（AI）与第三方">
        <p>
          图书助手的大多数问题（谁有某本书、我有什么书、书友会书目等）完全在本站数据库内回答，不会外传。
          助手<strong>不会读取社区聊天/留言内容</strong>，只处理图书相关信息。
        </p>
        <p>
          当你提出需要 AI 生成的问题（如个性化推荐）时，我们会调用第三方模型
          <strong> Google Gemini（免费层）</strong>。此时发送给 Google
          的内容仅为：书名、作者、语言、
          共享模式、状态、想要的书标题，以及你输入的问题。
        </p>
        <p>
          <strong>我们会先对成员身份做去标识化处理</strong>：真实姓名会被替换为“You /
          Member N”等代称，
          <strong>不发送姓名、邮编、联系方式、微信或积分</strong>
          。真实姓名只在你自己的浏览器里、书目卡片上显示。
        </p>
        <p>
          请注意：免费层的使用受 Google 的条款约束，Google
          可能会保留并使用所发送内容以改进其服务。
          因此请不要在提问或留言中填写他人的隐私信息（电话、住址、孩子的可识别信息等）。
        </p>
        <p>每天的 AI 提问次数有限额；用完后助手只用本地数据回答最基础的问题。</p>
      </Section>

      <Section title="儿童信息">
        <p>
          本站账号面向成年人（家长）。请勿在书评、留言或想要的书中填写 13
          岁以下儿童的可识别个人信息（真实全名、照片、精确住址等）。
        </p>
      </Section>

      <Section title="你的权利">
        <p>
          你可以随时在“我的书友会 /
          个人信息”中查看和修改你的资料、退出书友会、撤回或转移你分享的书。
          如需删除账号或数据，请联系维护者。
        </p>
      </Section>

      <Section title="数据存储与安全">
        <p>
          数据保存在本项目的数据库中。密码使用 scrypt
          哈希保存。我们会尽合理努力保护数据， 但没有任何系统能保证绝对安全。
        </p>
      </Section>

      <Section title="变更">
        <p>本说明可能会更新。继续使用即表示你接受最新版本。</p>
      </Section>
    </article>
  );
}

function PrivacyEn() {
  return (
    <article>
      <h1 className="text-2xl font-bold">Privacy & AI Notice</h1>
      <p className="mt-2 text-sm text-stone-500">
        This is a non-profit neighborhood book-sharing community. We collect only what
        the community needs to work, and minimize what leaves our server.
      </p>

      <Section title="Information we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Account info: display name, email, password (stored as a secure hash).
          </li>
          <li>Optional contact, WeChat nickname, area, and ZIP code you enter.</li>
          <li>Content you post: books, reviews, community messages, wanted books.</li>
        </ul>
      </Section>

      <Section title="How it is used">
        <p>
          This information is used only to run the clubs you join: showing the catalog
          and map, tracking lending/pass-on, and community interaction. Your contact
          details are visible only to members of the same club and can be controlled in
          settings.
        </p>
      </Section>

      <Section title="Book assistant (AI) & third parties">
        <p>
          Most assistant questions (who has a book, what books I have, the club catalog)
          are answered entirely from our local database and are never sent out. The
          assistant <strong>does not read community chat/messages</strong> — it only
          handles book-related information.
        </p>
        <p>
          For questions that need AI generation (personalized recommendations), we call
          a third-party model, <strong>Google Gemini (free tier)</strong>. What is sent
          to Google is only: book titles, authors, language, share mode, status,
          wanted-book titles, and your question.
        </p>
        <p>
          <strong>We de-identify members first</strong>: real names are replaced with
          labels like “You / Member N”, and we{" "}
          <strong>
            do not send names, ZIP codes, contact info, WeChat, or credits
          </strong>
          . Real names are only shown locally in your browser on the book cards.
        </p>
        <p>
          Note: free-tier use is governed by Google&apos;s terms, and Google may retain
          and use submitted content to improve its services. Please do not put other
          people&apos;s private information (phone, address, identifiable info about
          children) in questions or messages.
        </p>
        <p>
          Daily AI questions are capped; once used up the assistant answers only basic
          questions from local data.
        </p>
      </Section>

      <Section title="Children">
        <p>
          Accounts are for adults (parents). Please do not enter identifiable personal
          information about children under 13 (full real names, photos, precise
          addresses) in reviews, messages, or wanted books.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can view and edit your profile, leave clubs, and withdraw or transfer your
          shared books at any time under “My Clubs / Profile”. To delete your account or
          data, contact the maintainer.
        </p>
      </Section>

      <Section title="Storage & security">
        <p>
          Data is stored in this project&apos;s database. Passwords are hashed with
          scrypt. We make reasonable efforts to protect data, but no system can
          guarantee absolute security.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          This notice may be updated. Continued use means you accept the latest version.
        </p>
      </Section>
    </article>
  );
}
