import crypto from "node:crypto";
import { db, run } from "./db";
import { hashPassword } from "./password";
import {
  addBookListItem,
  addBookReview,
  addMembership,
  claimBook,
  createBook,
  createBookList,
  createBookRequest,
  createGroup,
  getBookHoldings,
  postGroupMessage,
  rateBorrower,
  returnToOwner,
  sendDirectMessage,
  setUserContactable,
  setUserPaymentHandles,
  toggleRequestInterest,
  upsertUserByEmail,
} from "./repo";
import type { Book, BookShareMode, User } from "./types";

/**
 * Isolated, throwaway demo sandboxes.
 *
 * Each visitor who clicks "Try the demo" gets their OWN private club: a fresh
 * group plus fresh copies of the demo members, books, chats, lists, and
 * history. Because the whole app is scoped by group membership, a demo visitor
 * can only ever see (and change) their own clone — never real users' data or
 * another demo visitor's clone. Clones are ephemeral: they are cleaned up on
 * logout/exit and expire after {@link DEMO_TTL_MS}. Nothing here is written to
 * the shared demo/seed data.
 */

export const DEMO_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

const DEMO_EMAIL_DOMAIN = "demo.invalid";
const DEMO_PASSWORD = "demo1234";

export interface DemoSessionRow {
  id: string;
  login_user_id: string;
  group_id: string;
  member_ids: string;
  created_at: string;
  last_seen_at: string;
}

// --- SVG cover generation (self-contained; no external book APIs) ----------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleLines(title: string): string[] {
  const chars = Array.from(title);
  const lines: string[] = [];
  for (let i = 0; i < chars.length && lines.length < 3; i += 8) {
    lines.push(chars.slice(i, i + 8).join(""));
  }
  return lines;
}

function generatedCover(title: string, category?: string | null): string {
  const palettes = [
    ["#fda4af", "#fb7185"],
    ["#93c5fd", "#3b82f6"],
    ["#86efac", "#22c55e"],
    ["#fde68a", "#f59e0b"],
    ["#c4b5fd", "#8b5cf6"],
    ["#67e8f9", "#06b6d4"],
  ];
  const index =
    Array.from(title).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % palettes.length;
  const [from, to] = palettes[index];
  const titleSvg = titleLines(title)
    .map(
      (line, i) =>
        `<text x="50%" y="${118 + i * 34}" text-anchor="middle" font-size="26" font-weight="700" fill="#fff">${escapeXml(line)}</text>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="520" viewBox="0 0 360 520">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="360" height="520" rx="28" fill="url(#g)"/>
  <rect x="26" y="30" width="308" height="460" rx="22" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.42)" stroke-width="2"/>
  <text x="50%" y="82" text-anchor="middle" font-size="24" fill="rgba(255,255,255,0.9)">邻里书屋</text>
  ${titleSvg}
  <text x="50%" y="392" text-anchor="middle" font-size="20" fill="rgba(255,255,255,0.9)">${escapeXml(category ?? "儿童图书")}</text>
  <text x="50%" y="448" text-anchor="middle" font-size="64" fill="rgba(255,255,255,0.9)">📚</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// --- Provisioning ----------------------------------------------------------

interface DemoBookSpec {
  ownerKey: string;
  title: string;
  author: string;
  language: string;
  age_range: string;
  category: string;
  condition: string;
  share_mode: BookShareMode;
  deposit?: string;
  isbn?: string;
  notes?: string;
}

const DEMO_POLICY = [
  "📖 入会须知（示例，会主可修改）：",
  "1. 借阅的书请按约定时间归还，传阅的书读完及时传给下一位。",
  "2. 请爱惜书籍，保持清洁，不要涂画、折页。",
  "3. 贵重书籍可能需要押金，损坏或丢失请照价赔偿。",
  "4. 取书还书请友好沟通，互相体谅。",
].join("\n");

const DEMO_MEMBERS = [
  {
    key: "lily",
    name: "Lily 妈妈",
    contact: "微信: lily_mn / 612-555-0101",
    area: "Eden Prairie",
    zip: "55344",
  },
  {
    key: "wei",
    name: "Wei 妈妈",
    contact: "微信: wei_mn",
    area: "Maple Grove",
    zip: "55369",
  },
  {
    key: "grace",
    name: "Grace 妈妈",
    contact: "微信: grace_mn",
    area: "Woodbury",
    zip: "55125",
  },
  {
    key: "may",
    name: "May 妈妈",
    contact: "微信: may_books",
    area: "Plymouth",
    zip: "55446",
  },
  {
    key: "qing",
    name: "Qing 妈妈",
    contact: "微信: qing_reads",
    area: "Minnetonka",
    zip: "55305",
  },
];

const DEMO_BOOKS: DemoBookSpec[] = [
  {
    ownerKey: "lily",
    title: "猜猜我有多爱你",
    author: "山姆·麦克布雷尼",
    language: "中文",
    age_range: "0-3 岁",
    category: "绘本",
    condition: "九成新",
    share_mode: "flow",
    isbn: "9787533258092",
    notes: "适合睡前亲子共读，高质量传阅书。",
  },
  {
    ownerKey: "lily",
    title: "好饿的毛毛虫",
    author: "艾瑞·卡尔",
    language: "中文",
    age_range: "0-3 岁",
    category: "绘本",
    condition: "八成新",
    share_mode: "lend",
    deposit: "¥30",
    isbn: "9787533256739",
  },
  {
    ownerKey: "lily",
    title: "我爸爸",
    author: "安东尼·布朗",
    language: "中文",
    age_range: "3-6 岁",
    category: "绘本",
    condition: "九成新",
    share_mode: "flow",
    isbn: "9787543464582",
  },
  {
    ownerKey: "wei",
    title: "神奇校车",
    author: "乔安娜·柯尔",
    language: "中文",
    age_range: "5-9 岁",
    category: "科普",
    condition: "七成新",
    share_mode: "flow",
  },
  {
    ownerKey: "wei",
    title: "棕色的熊，棕色的熊，你在看什么？",
    author: "比尔·马丁",
    language: "中文",
    age_range: "0-3 岁",
    category: "绘本",
    condition: "九成新",
    share_mode: "flow",
  },
  {
    ownerKey: "wei",
    title: "DK儿童百科全书",
    author: "DK",
    language: "中文",
    age_range: "7-12 岁",
    category: "科普",
    condition: "八成新",
    share_mode: "lend",
    deposit: "$15",
  },
  {
    ownerKey: "grace",
    title: "夏洛的网",
    author: "E.B. 怀特",
    language: "中文",
    age_range: "8-12 岁",
    category: "小说",
    condition: "九成新",
    share_mode: "lend",
    deposit: "¥50",
  },
  {
    ownerKey: "grace",
    title: "小王子",
    author: "圣埃克苏佩里",
    language: "中文",
    age_range: "8-12 岁",
    category: "名著",
    condition: "九成新",
    share_mode: "flow",
    isbn: "9787020042494",
  },
  {
    ownerKey: "may",
    title: "青蛙和蟾蜍",
    author: "阿诺德·洛贝尔",
    language: "中文",
    age_range: "5-8 岁",
    category: "桥梁书",
    condition: "九成新",
    share_mode: "flow",
  },
  {
    ownerKey: "may",
    title: "牛津树 Level 3",
    author: "Roderick Hunt",
    language: "英文",
    age_range: "4-7 岁",
    category: "英文启蒙",
    condition: "九成新",
    share_mode: "lend",
    deposit: "$12",
  },
  {
    ownerKey: "qing",
    title: "米小圈上学记",
    author: "北猫",
    language: "中文",
    age_range: "7-10 岁",
    category: "章节书",
    condition: "八成新",
    share_mode: "flow",
  },
  {
    ownerKey: "qing",
    title: "哈利·波特与魔法石",
    author: "J.K. 罗琳",
    language: "中文",
    age_range: "9-14 岁",
    category: "小说",
    condition: "八成新",
    share_mode: "lend",
    deposit: "$15",
    isbn: "9787020033430",
  },
];

/**
 * Build one complete, isolated demo club and record it as a demo session.
 * Returns the session token, the login identity (cloned "Lily"), and group id.
 */
export async function provisionDemoSession(): Promise<{
  token: string;
  loginUserId: string;
  groupId: string;
}> {
  const token = crypto.randomUUID().replace(/-/g, "");
  const at = new Date().toISOString();

  // Provisioning runs in a few parallel "waves" so a fresh demo starts quickly.
  // Within each wave the operations are independent (distinct rows, and the
  // credit ledger is append-only), so they are safe to run at the same time.

  // Wave 1: cloned members + the group (independent of each other).
  // Namespaced emails keep every clone fully independent from the others.
  const [userEntries, group] = await Promise.all([
    Promise.all(
      DEMO_MEMBERS.map(
        async (m) =>
          [
            m.key,
            await upsertUserByEmail({
              email: `demo_${token}_${m.key}@${DEMO_EMAIL_DOMAIN}`,
              name: m.name,
              password_hash: hashPassword(DEMO_PASSWORD),
              contact: m.contact,
              home_area: m.area,
              home_zip: m.zip,
            }),
          ] as const
      )
    ),
    createGroup("邻里书屋体验馆", "Demo · 示例书友会", DEMO_POLICY),
  ]);
  const users: Record<string, User> = Object.fromEntries(userEntries);
  const lily = users.lily;
  const memberIds = Object.values(users).map((u) => u.id);

  // Wave 2: memberships + books (both only need the users and the group).
  const [, createdEntries] = await Promise.all([
    Promise.all(
      DEMO_MEMBERS.map((m) =>
        addMembership(
          users[m.key].id,
          group.id,
          m.key === "lily" ? "admin" : "member",
          at
        )
      )
    ),
    Promise.all(
      DEMO_BOOKS.map(
        async (spec) =>
          [
            spec.title,
            await createBook({
              group_id: group.id,
              owner_user_id: users[spec.ownerKey].id,
              title: spec.title,
              author: spec.author,
              language: spec.language,
              age_range: spec.age_range,
              category: spec.category,
              condition: spec.condition,
              share_mode: spec.share_mode,
              deposit: spec.deposit ?? null,
              isbn: spec.isbn ?? null,
              notes: spec.notes ?? null,
              cover_image_url: generatedCover(spec.title, spec.category),
              current_location_area: users[spec.ownerKey].home_area,
              location_zip: users[spec.ownerKey].home_zip,
            }),
          ] as const
      )
    ),
  ]);
  const created: Record<string, Book> = Object.fromEntries(createdEntries);

  // A completed lend cycle (borrow → return → rating) must run in order.
  const lendCycle = async () => {
    const caterpillar = created["好饿的毛毛虫"];
    await claimBook(caterpillar.id, users.wei.id);
    await returnToOwner(caterpillar.id, users.wei.id);
    const weiBorrow = (await getBookHoldings(caterpillar.id)).find(
      (h) => h.holder_user_id === users.wei.id && h.ended_reason === "returned"
    );
    if (weiBorrow) {
      await rateBorrower(
        weiBorrow.id,
        users.lily.id,
        5,
        "书还得很干净，准时归还，赞！"
      );
    }
  };

  // Two-message DM thread, kept in order so it reads as a conversation.
  const dmThread = async () => {
    await sendDirectMessage(
      users.wei.id,
      users.lily.id,
      "你好 Lily，好饿的毛毛虫还能借吗？"
    );
    await sendDirectMessage(
      users.lily.id,
      users.wei.id,
      "可以的，我这周三晚上在 Eden Prairie。"
    );
  };

  const requestThread = async () => {
    const req = await createBookRequest({
      group_id: group.id,
      requester_user_id: users.grace.id,
      title: "活了100万次的猫",
      author: "佐野洋子",
      note: "想给孩子读，最好是精装中文版。",
    });
    await Promise.all([
      toggleRequestInterest(req, users.wei.id, "want"),
      toggleRequestInterest(req, users.lily.id, "buy"),
    ]);
  };

  const listThread = async () => {
    const listId = await createBookList(
      group.id,
      users.lily.id,
      "3-6 岁睡前绘本精选",
      "陪孩子安静入睡的温柔绘本。"
    );
    await Promise.all([
      addBookListItem(listId, "晚安，月亮", "玛格丽特·怀兹·布朗", null, "经典中的经典"),
      addBookListItem(listId, "逃家小兔", "玛格丽特·怀兹·布朗", null, "温暖的亲子之爱"),
      addBookListItem(listId, "月亮，生日快乐", "弗兰克·阿希", null, "想象力满分"),
    ]);
  };

  // Wave 3: reviews, holdings, profile tweaks, chat, DMs, requests, and lists
  // are all independent of one another, so run them together.
  await Promise.all([
    // Anonymous content reviews.
    addBookReview(
      created["猜猜我有多爱你"].id,
      users.grace.id,
      5,
      "孩子超级喜欢，睡前要读好几遍！"
    ),
    addBookReview(
      created["猜猜我有多爱你"].id,
      users.wei.id,
      4,
      "画风温柔，适合亲子共读。"
    ),
    addBookReview(
      created["夏洛的网"].id,
      users.lily.id,
      5,
      "适合大一点的孩子，读完很感动。"
    ),
    addBookReview(
      created["DK儿童百科全书"].id,
      users.qing.id,
      5,
      "厚但是很好翻，适合查知识点。"
    ),
    // Flow books already passed on, so a holder differs from the owner.
    claimBook(created["神奇校车"].id, users.grace.id),
    claimBook(created["米小圈上学记"].id, users.lily.id),
    // Active lend books still out with borrowers.
    claimBook(created["夏洛的网"].id, users.qing.id),
    claimBook(created["牛津树 Level 3"].id, users.lily.id),
    lendCycle(),
    // Some members opt out of being contacted (to show the switch).
    setUserContactable(users.grace.id, false),
    setUserContactable(users.qing.id, false),
    // Payment handles so "thank the owner" appears.
    setUserPaymentHandles(users.lily.id, {
      paypal: "lilymn",
      venmo: "@lily-mn",
      wechat: "lily_mn_pay",
    }),
    setUserPaymentHandles(users.wei.id, { venmo: "@wei-mn" }),
    // Club chat (each member posts once, so no daily-credit race).
    postGroupMessage(
      group.id,
      users.lily.id,
      "大家好，欢迎来到读书会！有想读的书随时在“想要的书”里提～"
    ),
    postGroupMessage(group.id, users.wei.id, "请问有没有适合 4 岁的英文绘本呀？"),
    postGroupMessage(group.id, users.grace.id, "我家有几本，回头加到书单里！"),
    postGroupMessage(
      group.id,
      users.may.id,
      "这周末我会去 Eden Prairie 图书馆附近，可以顺路交换书。"
    ),
    postGroupMessage(
      group.id,
      users.qing.id,
      "我加了几本大孩子看的章节书，适合 8 岁以上。"
    ),
    dmThread(),
    requestThread(),
    listThread(),
  ]);

  await run(
    `INSERT INTO demo_sessions (id, login_user_id, group_id, member_ids, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [token, lily.id, group.id, JSON.stringify(memberIds), at]
  );

  return { token, loginUserId: lily.id, groupId: group.id };
}

// --- Lookup / lifecycle -----------------------------------------------------

export async function getDemoSession(
  token: string
): Promise<DemoSessionRow | undefined> {
  return (
    await db.query<DemoSessionRow>("SELECT * FROM demo_sessions WHERE id = $1", [token])
  )[0];
}

export async function touchDemoSession(token: string): Promise<void> {
  await run("UPDATE demo_sessions SET last_seen_at = $1 WHERE id = $2", [
    new Date().toISOString(),
    token,
  ]);
}

/** Delete a demo session and all of its cloned data (group + members). */
export async function deleteDemoSession(token: string): Promise<void> {
  const session = await getDemoSession(token);
  if (!session) return;
  await purgeDemoData(session);
  await run("DELETE FROM demo_sessions WHERE id = $1", [token]);
}

async function purgeDemoData(session: DemoSessionRow): Promise<void> {
  let memberIds: string[] = [];
  try {
    memberIds = JSON.parse(session.member_ids);
  } catch {
    memberIds = [];
  }
  // Delete the group first: books, chats, lists, requests, holdings, credit
  // events, etc. all cascade from it. Then delete the cloned members, which
  // cascades their direct messages and memberships.
  await run("DELETE FROM groups WHERE id = $1", [session.group_id]);
  if (memberIds.length > 0) {
    await run("DELETE FROM users WHERE id = ANY($1::text[])", [memberIds]);
  }
}

/** Best-effort cleanup of demo sandboxes older than the TTL. */
export async function cleanupExpiredDemoSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - DEMO_TTL_MS).toISOString();
  const expired = await db.query<DemoSessionRow>(
    "SELECT * FROM demo_sessions WHERE last_seen_at < $1",
    [cutoff]
  );
  for (const session of expired) {
    try {
      await purgeDemoData(session);
      await run("DELETE FROM demo_sessions WHERE id = $1", [session.id]);
    } catch {
      // Ignore individual cleanup failures; try again on the next entry.
    }
  }
}
