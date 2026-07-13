/**
 * Seeds demo book clubs, members, books, chats, requests, and reading lists so
 * the app isn't empty for testing. Safe to run multiple times: it keys off fixed
 * invite codes and skips seeding if any demo club already exists.
 *
 * Run with: npm run seed
 */
import {
  addBookListItem,
  addBookReview,
  addMembership,
  claimBook,
  createBook,
  createBookList,
  createBookRequest,
  getBookHoldings,
  getGroupByInviteCode,
  postGroupMessage,
  rateBorrower,
  returnToOwner,
  sendDirectMessage,
  setRequestStatus,
  setUserContactable,
  setUserPaymentHandles,
  toggleRequestInterest,
  upsertUserByEmail,
} from "../src/lib/repo";
import { run, withTransaction } from "../src/lib/db";
import { lookupIsbn } from "../src/lib/books-api";
import { hashPassword } from "../src/lib/password";
import type { BookShareMode, User } from "../src/lib/types";
import fs from "node:fs";

const SEED_CODE = "MNMOMS";
const SEED_GROUP_CODES = [SEED_CODE, "TWINEN", "BIGKIDS", "WEEKEND"];
const DEMO_PASSWORD = "demo1234";
const SEED_EMAILS = [
  "lily@example.com",
  "wei@example.com",
  "grace@example.com",
  "may@example.com",
  "qing@example.com",
  "anna@example.com",
  "tianyaohasadream@gmail.com",
];

function loadLocalEnv() {
  if (!fs.existsSync(".env")) return;
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    process.env[key] ??= value;
  }
}

async function createSeedGroup(input: {
  name: string;
  type: string;
  inviteCode: string;
  policy: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await run(
    `INSERT INTO groups (id, name, type, policy, invite_code, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      input.name,
      input.type,
      input.policy,
      input.inviteCode,
      new Date().toISOString(),
    ]
  );
  return id;
}

function languageLabel(language: string | null): string | null {
  if (!language) return null;
  const lower = language.toLowerCase();
  if (lower.startsWith("zh")) return "中文";
  if (lower.startsWith("en")) return "英文";
  return language;
}

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
  const lines = titleLines(title);
  const titleSvg = lines
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

async function createBookWithIsbnMeta(input: Parameters<typeof createBook>[0]) {
  if (!input.isbn || input.cover_image_url) {
    return createBook({
      ...input,
      cover_image_url:
        input.cover_image_url ?? generatedCover(input.title, input.category),
    });
  }
  const meta = await lookupIsbn(input.isbn).catch(() => null);
  if (!meta) {
    return createBook({
      ...input,
      cover_image_url: generatedCover(input.title, input.category),
    });
  }

  return createBook({
    ...input,
    author: input.author ?? (meta.authors.length > 0 ? meta.authors.join(", ") : null),
    language: input.language ?? languageLabel(meta.language),
    cover_image_url:
      input.cover_image_url ??
      meta.cover_url ??
      generatedCover(input.title, input.category),
    category: input.category ?? meta.categories[0] ?? null,
  });
}

async function main() {
  loadLocalEnv();

  const existing = await Promise.all(
    SEED_GROUP_CODES.map((code) => getGroupByInviteCode(code))
  );
  if (existing.some(Boolean)) {
    if (process.env.SEED_RESET === "1") {
      await withTransaction(async (tx) => {
        const groupPlaceholders = SEED_GROUP_CODES.map((_, i) => `$${i + 1}`).join(
          ", "
        );
        await tx.run(
          `DELETE FROM groups WHERE invite_code IN (${groupPlaceholders})`,
          SEED_GROUP_CODES
        );
        const placeholders = SEED_EMAILS.map((_, i) => `$${i + 1}`).join(", ");
        await tx.run(`DELETE FROM users WHERE email IN (${placeholders})`, SEED_EMAILS);
      });
    } else {
      console.log(`Seed club (${SEED_CODE}) already exists. Nothing to do.`);
      console.log("Run `npm run seed:reset` to replace it with fresh demo data.");
      return;
    }
  }

  // Create the club with a fixed invite code so the seed is idempotent.
  const groupId = crypto.randomUUID();
  const policy = [
    "📖 入会须知（示例，会主可修改）：",
    "1. 借阅的书请按约定时间归还，传阅的书读完及时传给下一位。",
    "2. 请爱惜书籍，保持清洁，不要涂画、折页。",
    "3. 贵重书籍可能需要押金，损坏或丢失请照价赔偿。",
    "4. 取书还书请友好沟通，互相体谅。",
  ].join("\n");
  await run(
    `INSERT INTO groups (id, name, type, policy, invite_code, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      groupId,
      "明尼苏达华人妈妈读书会",
      "Chinese moms · Minnesota",
      policy,
      SEED_CODE,
      new Date().toISOString(),
    ]
  );

  const lily = await upsertUserByEmail({
    email: "lily@example.com",
    name: "Lily 妈妈",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: lily_mn / 612-555-0101",
    home_area: "Eden Prairie",
    home_zip: "55344",
  });
  const wei = await upsertUserByEmail({
    email: "wei@example.com",
    name: "Wei 妈妈",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: wei_mn",
    home_area: "Maple Grove",
    home_zip: "55369",
  });
  const grace = await upsertUserByEmail({
    email: "grace@example.com",
    name: "Grace 妈妈",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: grace_mn",
    home_area: "Woodbury",
    home_zip: "55125",
  });
  const may = await upsertUserByEmail({
    email: "may@example.com",
    name: "May 妈妈",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: may_books",
    home_area: "Plymouth",
    home_zip: "55446",
  });
  const qing = await upsertUserByEmail({
    email: "qing@example.com",
    name: "Qing 妈妈",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: qing_reads",
    home_area: "Minnetonka",
    home_zip: "55305",
  });
  const anna = await upsertUserByEmail({
    email: "anna@example.com",
    name: "Anna 妈妈",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: anna_mn",
    home_area: "St. Paul",
    home_zip: "55104",
  });
  const tianyao = await upsertUserByEmail({
    email: "tianyaohasadream@gmail.com",
    name: "Tianyao",
    password_hash: hashPassword(DEMO_PASSWORD),
    contact: "微信: tianyao",
    home_area: "Minneapolis",
    home_zip: "55414",
  });

  const members = [lily, wei, grace, may, qing, anna, tianyao];

  for (const u of members) {
    await addMembership(
      u.id,
      groupId,
      u.id === lily.id ? "admin" : "member",
      new Date().toISOString()
    );
  }

  const englishGroupId = await createSeedGroup({
    name: "双城英文启蒙交换群",
    type: "English reading · Twin Cities",
    inviteCode: "TWINEN",
    policy:
      "适合想交换英文绘本、分级读物和 phonics 资料的家庭。请标注级别，借阅书建议 2-3 周归还。",
  });
  const bigKidsGroupId = await createSeedGroup({
    name: "明州大孩子中文阅读社",
    type: "Chinese reading · 7+ kids",
    inviteCode: "BIGKIDS",
    policy: "面向 7 岁以上孩子的中文章节书、漫画和名著。欢迎分享孩子真实读后感。",
  });
  const weekendGroupId = await createSeedGroup({
    name: "周末图书漂流站",
    type: "Weekend swaps · Local pickup",
    inviteCode: "WEEKEND",
    policy: "周末线下交换用的小群。请在聊天里约好地点时间，传阅书读完尽快转给下一位。",
  });

  for (const u of members) {
    await addMembership(u.id, englishGroupId, u.id === anna.id ? "admin" : "member");
  }
  for (const u of members) {
    await addMembership(u.id, bigKidsGroupId, u.id === qing.id ? "admin" : "member");
  }
  for (const u of members) {
    await addMembership(u.id, weekendGroupId, u.id === wei.id ? "admin" : "member");
  }

  type SeedBook = {
    owner: User;
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
  };

  const books: SeedBook[] = [
    {
      owner: lily,
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
      owner: lily,
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
      owner: lily,
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
      owner: lily,
      title: "逃家小兔",
      author: "玛格丽特·怀兹·布朗",
      language: "中文",
      age_range: "3-6 岁",
      category: "绘本",
      condition: "九成新",
      share_mode: "lend",
      deposit: "$5",
    },
    {
      owner: wei,
      title: "不一样的卡梅拉（套装）",
      author: "约里斯·克利木",
      language: "中文",
      age_range: "4-8 岁",
      category: "桥梁书",
      condition: "九成新",
      share_mode: "lend",
      deposit: "$10",
    },
    {
      owner: wei,
      title: "神奇校车",
      author: "乔安娜·柯尔",
      language: "中文",
      age_range: "5-9 岁",
      category: "科普",
      condition: "七成新",
      share_mode: "flow",
    },
    {
      owner: wei,
      title: "棕色的熊，棕色的熊，你在看什么？",
      author: "比尔·马丁",
      language: "中文",
      age_range: "0-3 岁",
      category: "绘本",
      condition: "九成新",
      share_mode: "flow",
    },
    {
      owner: wei,
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
      owner: grace,
      title: "西游记（少儿版）",
      author: "吴承恩",
      language: "中文",
      age_range: "7-12 岁",
      category: "名著",
      condition: "九成新",
      share_mode: "flow",
    },
    {
      owner: grace,
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
      owner: grace,
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
      owner: grace,
      title: "一年级的小豆豆",
      author: "狐狸姐姐",
      language: "中文",
      age_range: "6-8 岁",
      category: "校园故事",
      condition: "八成新",
      share_mode: "lend",
      deposit: "$8",
    },
    {
      owner: may,
      title: "青蛙和蟾蜍",
      author: "阿诺德·洛贝尔",
      language: "中文",
      age_range: "5-8 岁",
      category: "桥梁书",
      condition: "九成新",
      share_mode: "flow",
    },
    {
      owner: may,
      title: "中文分级阅读 K2",
      author: "亲近母语",
      language: "中文",
      age_range: "4-6 岁",
      category: "分级阅读",
      condition: "七成新",
      share_mode: "lend",
      deposit: "$10",
    },
    {
      owner: may,
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
      owner: qing,
      title: "米小圈上学记",
      author: "北猫",
      language: "中文",
      age_range: "7-10 岁",
      category: "章节书",
      condition: "八成新",
      share_mode: "flow",
    },
    {
      owner: qing,
      title: "大中华寻宝记：四川寻宝记",
      author: "孙家裕",
      language: "中文",
      age_range: "7-12 岁",
      category: "漫画",
      condition: "九成新",
      share_mode: "lend",
      deposit: "$10",
    },
    {
      owner: qing,
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
    {
      owner: anna,
      title: "亲爱的小孩，猜猜世界多有趣",
      author: "李一慢",
      language: "中文",
      age_range: "3-6 岁",
      category: "绘本",
      condition: "九成新",
      share_mode: "flow",
    },
    {
      owner: anna,
      title: "美国幼儿园课本 K",
      author: "Michael A. Putlack",
      language: "英文",
      age_range: "4-6 岁",
      category: "英文启蒙",
      condition: "八成新",
      share_mode: "lend",
      deposit: "$10",
    },
    {
      owner: anna,
      title: "故宫里的大怪兽",
      author: "常怡",
      language: "中文",
      age_range: "8-12 岁",
      category: "章节书",
      condition: "九成新",
      share_mode: "flow",
    },
    {
      owner: tianyao,
      title: "怪杰佐罗力：神秘的飞机",
      author: "原裕",
      language: "中文",
      age_range: "7-10 岁",
      category: "章节书",
      condition: "九成新",
      share_mode: "flow",
      isbn: "9787558328558",
      notes: "Tianyao 的示例书，带真实 ISBN 和封面。",
    },
    {
      owner: tianyao,
      title: "小王子",
      author: "圣埃克苏佩里",
      language: "中文",
      age_range: "8-12 岁",
      category: "名著",
      condition: "九成新",
      share_mode: "lend",
      deposit: "$5",
      isbn: "9787020042494",
    },
  ];

  const created = await Promise.all(
    books.map((b) =>
      createBookWithIsbnMeta({
        group_id: groupId,
        owner_user_id: b.owner.id,
        title: b.title,
        author: b.author,
        language: b.language,
        age_range: b.age_range,
        category: b.category,
        condition: b.condition,
        share_mode: b.share_mode,
        deposit: "deposit" in b ? (b.deposit as string) : null,
        isbn: b.isbn ?? null,
        notes: b.notes ?? null,
        current_location_area: b.owner.home_area,
        location_zip: b.owner.home_zip,
      })
    )
  );

  const englishBooks = [
    await createBookWithIsbnMeta({
      group_id: englishGroupId,
      owner_user_id: anna.id,
      title: "Oxford Reading Tree Level 1+",
      author: "Roderick Hunt",
      language: "英文",
      age_range: "4-6 岁",
      category: "英文分级",
      condition: "九成新",
      share_mode: "lend",
      deposit: "$8",
      isbn: "9780198481169",
      current_location_area: anna.home_area,
      location_zip: anna.home_zip,
      notes: "适合刚开始 phonics 和 sight words 的孩子。",
    }),
    await createBookWithIsbnMeta({
      group_id: englishGroupId,
      owner_user_id: may.id,
      title: "Pete the Cat: I Love My White Shoes",
      author: "Eric Litwin",
      language: "英文",
      age_range: "3-6 岁",
      category: "英文绘本",
      condition: "八成新",
      share_mode: "flow",
      isbn: "9780061906220",
      current_location_area: may.home_area,
      location_zip: may.home_zip,
    }),
    await createBookWithIsbnMeta({
      group_id: englishGroupId,
      owner_user_id: lily.id,
      title: "Elephant & Piggie: Today I Will Fly!",
      author: "Mo Willems",
      language: "英文",
      age_range: "4-7 岁",
      category: "桥梁书",
      condition: "九成新",
      share_mode: "flow",
      isbn: "9781423102953",
      current_location_area: lily.home_area,
      location_zip: lily.home_zip,
    }),
  ];

  await createBookWithIsbnMeta({
    group_id: bigKidsGroupId,
    owner_user_id: qing.id,
    title: "怪杰佐罗力：神秘的飞机",
    author: "原裕",
    language: "中文",
    age_range: "7-10 岁",
    category: "章节书",
    condition: "九成新",
    share_mode: "flow",
    isbn: "9787558328558",
    current_location_area: qing.home_area,
    location_zip: qing.home_zip,
    notes: "测试中文 ISBN 自动封面数据源时也可以扫这本。",
  });
  await createBookWithIsbnMeta({
    group_id: bigKidsGroupId,
    owner_user_id: grace.id,
    title: "林汉达中国历史故事集",
    author: "林汉达",
    language: "中文",
    age_range: "9-14 岁",
    category: "历史",
    condition: "八成新",
    share_mode: "lend",
    deposit: "$10",
    current_location_area: grace.home_area,
    location_zip: grace.home_zip,
  });
  await createBookWithIsbnMeta({
    group_id: bigKidsGroupId,
    owner_user_id: wei.id,
    title: "可怕的科学：经典数学系列",
    author: "卡佳坦·波斯基特",
    language: "中文",
    age_range: "9-14 岁",
    category: "科普",
    condition: "七成新",
    share_mode: "flow",
    current_location_area: wei.home_area,
    location_zip: wei.home_zip,
  });

  await createBookWithIsbnMeta({
    group_id: weekendGroupId,
    owner_user_id: wei.id,
    title: "小熊宝宝绘本",
    author: "佐佐木洋子",
    language: "中文",
    age_range: "0-3 岁",
    category: "绘本",
    condition: "七成新",
    share_mode: "flow",
    current_location_area: wei.home_area,
    location_zip: wei.home_zip,
  });
  await createBookWithIsbnMeta({
    group_id: weekendGroupId,
    owner_user_id: anna.id,
    title: "Peppa Pig 双语故事",
    author: "Ladybird",
    language: "中英双语",
    age_range: "3-6 岁",
    category: "双语绘本",
    condition: "八成新",
    share_mode: "lend",
    deposit: "$5",
    current_location_area: anna.home_area,
    location_zip: anna.home_zip,
  });

  const byTitle = (title: string) => {
    const book = created.find((b) => b.title === title);
    if (!book) throw new Error(`Seed book not found: ${title}`);
    return book;
  };

  // Anonymous content reviews. These make quality-credit behavior easy to test:
  // "猜猜我有多爱你" averages 4.5 stars, so it receives the high-quality bonus.
  await addBookReview(
    byTitle("猜猜我有多爱你").id,
    grace.id,
    5,
    "孩子超级喜欢，睡前要读好几遍！"
  );
  await addBookReview(
    byTitle("猜猜我有多爱你").id,
    wei.id,
    4,
    "画风温柔，适合亲子共读。"
  );
  await addBookReview(
    byTitle("夏洛的网").id,
    lily.id,
    5,
    "适合大一点的孩子，读完很感动。"
  );
  await addBookReview(byTitle("夏洛的网").id, may.id, 5, "很好的生命教育故事。");
  await addBookReview(
    byTitle("神奇校车").id,
    anna.id,
    4,
    "科普内容有趣，孩子会追着问问题。"
  );
  await addBookReview(
    byTitle("DK儿童百科全书").id,
    qing.id,
    5,
    "厚但是很好翻，适合查知识点。"
  );
  await addBookReview(englishBooks[0].id, lily.id, 4, "分级很清楚，适合每天读一点。");

  // Make Wei's flow book "神奇校车" already pass on to Grace, so its page shows
  // both the current holder (Grace) and the original owner (Wei).
  await claimBook(byTitle("神奇校车").id, grace.id);
  await claimBook(byTitle("米小圈上学记").id, lily.id);
  await claimBook(byTitle("青蛙和蟾蜍").id, anna.id);

  // Demo a completed lend cycle with a rating: Wei borrows Lily's "好饿的毛毛虫",
  // returns it, and Lily rates Wei — so the book shows borrow history + credit.
  const caterpillar = byTitle("好饿的毛毛虫");
  await claimBook(caterpillar.id, wei.id);
  await returnToOwner(caterpillar.id, wei.id);
  const weiBorrow = (await getBookHoldings(caterpillar.id)).find(
    (h) => h.holder_user_id === wei.id && h.ended_reason === "returned"
  );
  if (weiBorrow)
    await rateBorrower(weiBorrow.id, lily.id, 5, "书还得很干净，准时归还，赞！");

  // Demo active lend books that are still out with borrowers.
  await claimBook(byTitle("夏洛的网").id, qing.id);
  await claimBook(byTitle("牛津树 Level 3").id, lily.id);
  await claimBook(byTitle("大中华寻宝记：四川寻宝记").id, may.id);

  // Grace opts out of being contacted, to demo the "stop contacting me" switch.
  await setUserContactable(grace.id, false);
  await setUserContactable(qing.id, false);

  // Demo payment handles so the "thank the owner" feature shows up. Lily offers
  // all three; Wei only Venmo; May uses PayPal/WeChat; Grace none (empty case).
  await setUserPaymentHandles(lily.id, {
    paypal: "lilymn",
    venmo: "@lily-mn",
    wechat: "lily_mn_pay",
  });
  await setUserPaymentHandles(wei.id, { venmo: "@wei-mn" });
  await setUserPaymentHandles(may.id, {
    paypal: "https://www.paypal.me/mayreads",
    wechat: "may_books_pay",
  });
  await setUserPaymentHandles(anna.id, { venmo: "@anna-books" });

  // --- Community demo data -------------------------------------------------
  // Club group chat.
  await postGroupMessage(
    groupId,
    lily.id,
    "大家好，欢迎来到读书会！有想读的书随时在“想要的书”里提～"
  );
  await postGroupMessage(groupId, wei.id, "请问有没有适合 4 岁的英文绘本呀？");
  await postGroupMessage(groupId, grace.id, "我家有几本，回头加到书单里！");
  await postGroupMessage(
    groupId,
    may.id,
    "这周末我会去 Eden Prairie 图书馆附近，可以顺路交换书。"
  );
  await postGroupMessage(
    groupId,
    qing.id,
    "我加了几本大孩子看的章节书，适合 8 岁以上。"
  );
  await postGroupMessage(
    groupId,
    anna.id,
    "如果有人想练英文阅读，我有牛津树和幼儿园课本。"
  );
  await postGroupMessage(englishGroupId, anna.id, "这个群主要交换英文启蒙和分级读物。");
  await postGroupMessage(
    englishGroupId,
    may.id,
    "我家 Pete the Cat 可以传阅，适合唱着读。"
  );
  await postGroupMessage(
    bigKidsGroupId,
    qing.id,
    "大孩子中文阅读社开张啦，欢迎推荐章节书。"
  );
  await postGroupMessage(
    bigKidsGroupId,
    grace.id,
    "历史类和科普类书我家孩子最近很喜欢。"
  );
  await postGroupMessage(weekendGroupId, wei.id, "周末图书漂流站可以用来约线下交换。");
  await postGroupMessage(
    weekendGroupId,
    anna.id,
    "我周六下午会去 St. Paul 图书馆附近。"
  );

  // Direct message threads.
  await sendDirectMessage(wei.id, lily.id, "你好 Lily，好饿的毛毛虫还能借吗？");
  await sendDirectMessage(lily.id, wei.id, "可以的，我这周三晚上在 Eden Prairie。");
  await sendDirectMessage(may.id, anna.id, "牛津树 Level 3 我想下个月借，可以排队吗？");
  await sendDirectMessage(anna.id, may.id, "可以，我先借给 Lily，回来后联系你。");
  await sendDirectMessage(qing.id, grace.id, "西游记少儿版适合二年级孩子吗？");

  // Wanted books: one open, one with "I'll buy", and one fulfilled request.
  const reqCat = await createBookRequest({
    group_id: groupId,
    requester_user_id: grace.id,
    title: "活了100万次的猫",
    author: "佐野洋子",
    note: "想给孩子读，最好是精装中文版。",
  });
  await toggleRequestInterest(reqCat, wei.id, "want");
  await toggleRequestInterest(reqCat, lily.id, "buy");

  const reqMath = await createBookRequest({
    group_id: groupId,
    requester_user_id: may.id,
    title: "汉声数学图画书",
    author: "汉声杂志社",
    note: "如果有人从国内带,我也想团一本。",
  });
  await toggleRequestInterest(reqMath, lily.id, "want");
  await toggleRequestInterest(reqMath, qing.id, "want");
  await toggleRequestInterest(reqMath, anna.id, "buy");

  const reqFulfilled = await createBookRequest({
    group_id: groupId,
    requester_user_id: anna.id,
    title: "小猪佩奇双语故事",
    author: "英国快乐瓢虫出版公司",
    note: "已经有人提供，测试 fulfilled 状态。",
  });
  await toggleRequestInterest(reqFulfilled, grace.id, "want");
  await setRequestStatus(reqFulfilled, anna.id, "fulfilled");

  // Recommended reading lists.
  const bedtimeListId = await createBookList(
    groupId,
    lily.id,
    "3-6 岁睡前绘本精选",
    "陪孩子安静入睡的温柔绘本。"
  );
  await addBookListItem(
    bedtimeListId,
    "晚安，月亮",
    "玛格丽特·怀兹·布朗",
    null,
    "经典中的经典"
  );
  await addBookListItem(
    bedtimeListId,
    "逃家小兔",
    "玛格丽特·怀兹·布朗",
    null,
    "温暖的亲子之爱"
  );
  await addBookListItem(
    bedtimeListId,
    "月亮，生日快乐",
    "弗兰克·阿希",
    null,
    "想象力满分"
  );

  const bridgeListId = await createBookList(
    groupId,
    may.id,
    "一年级桥梁书入门",
    "从绘本过渡到章节书，适合刚开始自主阅读的孩子。"
  );
  await addBookListItem(
    bridgeListId,
    "青蛙和蟾蜍",
    "阿诺德·洛贝尔",
    null,
    "短故事，字不多"
  );
  await addBookListItem(
    bridgeListId,
    "一年级的小豆豆",
    "狐狸姐姐",
    null,
    "校园生活贴近孩子"
  );
  await addBookListItem(
    bridgeListId,
    "不一样的卡梅拉",
    "约里斯·克利木",
    null,
    "趣味性强"
  );

  const olderKidsListId = await createBookList(
    groupId,
    qing.id,
    "8 岁以上中文保持书单",
    "让大孩子继续愿意读中文的章节书和漫画。"
  );
  await addBookListItem(
    olderKidsListId,
    "故宫里的大怪兽",
    "常怡",
    null,
    "历史和想象结合"
  );
  await addBookListItem(
    olderKidsListId,
    "大中华寻宝记",
    "孙家裕",
    null,
    "漫画形式，孩子接受度高"
  );
  await addBookListItem(
    olderKidsListId,
    "哈利·波特与魔法石",
    "J.K. 罗琳",
    null,
    "熟悉故事，适合中文阅读挑战"
  );

  const englishStarterListId = await createBookList(
    englishGroupId,
    anna.id,
    "英文启蒙第一阶段",
    "适合 3-6 岁孩子建立英文阅读兴趣。"
  );
  await addBookListItem(
    englishStarterListId,
    "Pete the Cat",
    "Eric Litwin",
    null,
    "节奏感强"
  );
  await addBookListItem(
    englishStarterListId,
    "Elephant & Piggie",
    "Mo Willems",
    null,
    "对话简单，孩子容易跟读"
  );
  await addBookListItem(
    englishStarterListId,
    "Oxford Reading Tree",
    "Roderick Hunt",
    null,
    "分级体系清楚"
  );

  const historyListId = await createBookList(
    bigKidsGroupId,
    qing.id,
    "大孩子中文阅读挑战",
    "章节书、历史和科普混合，帮助大孩子保持中文。"
  );
  await addBookListItem(
    historyListId,
    "林汉达中国历史故事集",
    "林汉达",
    null,
    "故事性强"
  );
  await addBookListItem(
    historyListId,
    "怪杰佐罗力",
    "原裕",
    null,
    "幽默，适合过渡到章节书"
  );
  await addBookListItem(
    historyListId,
    "可怕的科学",
    "卡佳坦·波斯基特",
    null,
    "科普也可以很好玩"
  );

  console.log("Seeded club '明尼苏达华人妈妈读书会'");
  console.log("  Invite codes:");
  console.log(`    明尼苏达华人妈妈读书会: ${SEED_CODE}`);
  console.log("    双城英文启蒙交换群: TWINEN");
  console.log("    明州大孩子中文阅读社: BIGKIDS");
  console.log("    周末图书漂流站: WEEKEND");
  console.log(`  Members: ${members.map((u) => u.name).join(", ")}`);
  console.log(`  Main club books: ${books.length}`);
  console.log("  Test logins:");
  for (const u of members) console.log(`    ${u.email}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("Log in with any listed email (any name) to try it out.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
