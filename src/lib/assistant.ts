import {
  createBookRequest,
  getAiUsageToday,
  incrementAiUsage,
  listBookRequests,
  listBooks,
  markAiExhausted,
} from "@/lib/repo";
import type { BookRequest, BookWithPeople, User } from "@/lib/types";

export type AssistantIntent = "find" | "want" | "recommend" | "help" | "list";

export type AssistantResponse = {
  intent: AssistantIntent;
  answer: string;
  matches: BookWithPeople[];
  wantedTitle: string | null;
  usedAi: boolean;
  canCreateRequest: boolean;
  /** True when the AI answer was skipped because today's request budget is used up. */
  aiExhausted: boolean;
};

/** Free-tier daily request budget for Gemini (requests per day). */
export function aiDailyLimit(): number {
  const raw = Number(process.env.GEMINI_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 500;
}

class GeminiError extends Error {
  quotaExhausted: boolean;
  constructor(message: string, quotaExhausted: boolean) {
    super(message);
    this.name = "GeminiError";
    this.quotaExhausted = quotaExhausted;
  }
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export async function answerAssistantQuestion({
  question,
  groupId,
  viewer,
  t,
}: {
  question: string;
  groupId: string;
  viewer: User;
  t: Translator;
}): Promise<AssistantResponse> {
  const trimmed = question.trim();

  if (!trimmed) {
    return {
      intent: "help",
      answer: t("assistant.empty"),
      matches: [],
      wantedTitle: null,
      usedAi: false,
      canCreateRequest: false,
      aiExhausted: false,
    };
  }

  const intent = detectIntent(trimmed);
  const books = await listBooks(groupId, { viewerUserId: viewer.id });
  // Relevant book cards to show under the answer (owner/holder/ZIP shown
  // locally, so we never rely on the model for those facts).
  const matches = searchBooks(books, extractBookQuery(trimmed) || trimmed).slice(0, 6);

  const aiEnabled =
    process.env.AI_CHAT_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY);

  if (aiEnabled) {
    const limit = aiDailyLimit();
    // Budget already spent for today -> skip the API and answer locally.
    if ((await getAiUsageToday()) >= limit) {
      return {
        ...localAnswer({ trimmed, intent, books, viewer, t }),
        aiExhausted: true,
      };
    }
    try {
      const requests = await listBookRequests(groupId, viewer.id);
      const answer = await callGemini({
        question: trimmed,
        viewer,
        books,
        requests,
      });
      await incrementAiUsage();
      const offer = wantedOffer(trimmed, matches, intent);
      return {
        intent,
        answer,
        matches,
        wantedTitle: offer.title,
        usedAi: true,
        canCreateRequest: offer.can,
        aiExhausted: false,
      };
    } catch (err) {
      if (err instanceof GeminiError && err.quotaExhausted) {
        // Out of daily quota: remember it so we stop calling until tomorrow.
        await markAiExhausted(limit);
        console.error(
          "[assistant] Gemini daily quota exhausted, using local fallback."
        );
        return {
          ...localAnswer({ trimmed, intent, books, viewer, t }),
          aiExhausted: true,
        };
      }
      console.error("[assistant] Gemini answer failed, using local fallback:", err);
    }
  }

  return { ...localAnswer({ trimmed, intent, books, viewer, t }), aiExhausted: false };
}

/**
 * Keyword-based answer used when the AI assistant is disabled or the Gemini
 * call fails. Keeps the assistant useful (and free) without any external call.
 */
function localAnswer({
  trimmed,
  intent,
  books,
  viewer,
  t,
}: {
  trimmed: string;
  intent: AssistantIntent;
  books: BookWithPeople[];
  viewer: User;
  t: Translator;
}): Omit<AssistantResponse, "aiExhausted"> {
  if (intent === "list") {
    if (isMineQuery(trimmed)) {
      const mine = books.filter((book) => book.owner_user_id === viewer.id);
      return {
        intent,
        answer: mine.length
          ? t("assistant.listMine", { n: mine.length })
          : t("assistant.listMineEmpty"),
        matches: mine.slice(0, 12),
        wantedTitle: null,
        usedAi: false,
        canCreateRequest: false,
      };
    }
    const available = books.filter((book) => book.status === "available");
    return {
      intent,
      answer: available.length
        ? t("assistant.listCatalog", { n: available.length })
        : t("assistant.listCatalogEmpty"),
      matches: available.slice(0, 12),
      wantedTitle: null,
      usedAi: false,
      canCreateRequest: false,
    };
  }

  if (intent === "recommend") {
    const candidates = books.filter((book) => book.status === "available");
    return {
      intent,
      answer: candidates.length
        ? t("assistant.recommendLocal")
        : t("assistant.recommendEmpty"),
      matches: candidates.slice(0, 5),
      wantedTitle: null,
      usedAi: false,
      canCreateRequest: false,
    };
  }

  const bookQuery = extractBookQuery(trimmed);
  const matches = bookQuery ? searchBooks(books, bookQuery).slice(0, 6) : [];
  if (matches.length > 0) {
    return {
      intent,
      answer: t("assistant.found", { n: matches.length }),
      matches,
      wantedTitle: null,
      usedAi: false,
      canCreateRequest: false,
    };
  }

  const offer = wantedOffer(trimmed, matches, intent);
  if (!offer.can) {
    return {
      intent,
      answer: t("assistant.specify"),
      matches: [],
      wantedTitle: null,
      usedAi: false,
      canCreateRequest: false,
    };
  }
  return {
    intent,
    answer: t("assistant.notFound", { title: offer.title ?? "" }),
    matches: [],
    wantedTitle: offer.title,
    usedAi: false,
    canCreateRequest: true,
  };
}

/**
 * Decide whether to offer posting a "wanted book". Only when nothing matched
 * and the user is actually asking for a book (explicit want / quoted title).
 */
function wantedOffer(
  question: string,
  matches: BookWithPeople[],
  intent: AssistantIntent
): { title: string | null; can: boolean } {
  if (matches.length > 0) return { title: null, can: false };
  const title = extractWantedTitle(question);
  const can = (intent === "want" || hasExplicitTitle(question)) && title.length > 0;
  return { title: can ? title : null, can };
}

export function createAssistantWantedRequest({
  groupId,
  userId,
  title,
  question,
}: {
  groupId: string;
  userId: string;
  title: string;
  question: string;
}): Promise<string> {
  return createBookRequest({
    group_id: groupId,
    requester_user_id: userId,
    title,
    note: question,
  });
}

function detectIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  // Recommend is checked first so "有什么书可以推荐" isn't caught by the
  // broad "list" patterns below.
  if (/recommend|suggest|适合|推荐|读什么|下一本|下本|喜欢什么|next.*read/.test(q)) {
    return "recommend";
  }
  // List / inventory questions ("what books do I have", "what's available")
  // must be checked before want so they aren't mistaken for a title.
  if (
    isMineQuery(q) ||
    /可借的书|可以借的书|能借的书|(有|还有|都有)(哪些|什么|多少)[^。？?]{0,6}书|哪些书|书目|清单|列出|列一下|库存|what books|which books|list (the )?books|books.*available|available books/.test(
      q
    )
  ) {
    return "list";
  }
  if (/want|looking for|anyone has|有没有|想要|想找|谁有|谁那里|在谁/.test(q)) {
    return "want";
  }
  if (/credit|积分|漂流|借阅规则|规则|怎么用|怎么借|怎么还/.test(q)) {
    return "help";
  }
  return "find";
}

function hasExplicitTitle(question: string): boolean {
  return /[《「【][^》」】]{1,}[》」】]|["“”][^"“”]{2,}["“”]/.test(question);
}

function isMineQuery(question: string): boolean {
  const q = question.toLowerCase();
  return /我(都|现在)?有(什么|哪些|多少)?书|我的书|我分享|我拥有|我这里的?书|在我(这|手)|my books|books i (have|own|shared)|i own|what.*i have|books i'm holding/.test(
    q
  );
}

const QUESTION_WORDS =
  /有没有|谁有|谁那里|在谁|我想要|想要|想找|我想|请问|帮我|查一下|查查|找一下|找找|有人有|有没|吗|呢|啊|推荐|适合|下一本|读什么|does anyone have|anyone has|who has|i want|i am looking for|looking for|please|can you|find me/gi;

function extractBookQuery(question: string): string {
  const quoted = question.match(
    /[《「【]([^》」】]{1,})[》」】]|["“”'‘’]([^"“”'‘’]{2,})["“”'‘’]/
  );
  if (quoted) return (quoted[1] || quoted[2]).trim();
  const cleaned = question
    .replace(QUESTION_WORDS, " ")
    .replace(/[?？。！、，,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

function extractWantedTitle(question: string): string {
  // Prefer an explicit quoted/bracketed title; only fall back to cleaned text
  // when it is short enough to plausibly be a book title (avoids treating a
  // whole sentence as a "wanted book").
  const bracketed = question.match(/[《「【]([^》」】]{1,})[》」】]/);
  if (bracketed?.[1]) return bracketed[1].trim();
  const query = extractBookQuery(question);
  if (!query) return "";
  const wordCount = query.split(/\s+/).length;
  if (query.length > 30 || (wordCount > 6 && !/[\u4e00-\u9fff]/.test(query))) {
    return "";
  }
  return query;
}

function searchBooks(books: BookWithPeople[], query: string): BookWithPeople[] {
  const normalizedQuery = normalize(query);
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2);
  if (!normalizedQuery) return [];

  return books
    .map((book) => {
      const haystack = normalize(
        [book.title, book.author, book.isbn, book.notes].filter(Boolean).join(" ")
      );
      let score = 0;
      if (haystack.includes(normalizedQuery)) score += 10;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 2;
      }
      return { book, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.book.title.localeCompare(b.book.title))
    .map((item) => item.book);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function callGemini({
  question,
  viewer,
  books,
  requests,
}: {
  question: string;
  viewer: User;
  books: BookWithPeople[];
  requests: BookRequest[];
}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing Gemini API key");

  const statusLabel: Record<string, string> = {
    available: "available",
    reading: "being read",
    borrowed: "out with a reader",
    requested: "requested",
  };

  // Privacy: never send real member names or ZIP codes to the external model.
  // We map each member's display name to a stable pseudonym (the viewer is
  // "You"); the UI still shows real names locally on the book cards.
  const labelByName = new Map<string, string>();
  labelByName.set(viewer.name, "You");
  let memberSeq = 0;
  const labelFor = (name: string): string => {
    if (!name) return "someone";
    if (!labelByName.has(name)) labelByName.set(name, `Member ${++memberSeq}`);
    return labelByName.get(name)!;
  };
  // Replace any occurrence of a real member name inside free text (the question).
  const scrub = (text: string): string => {
    let out = text;
    for (const [name, label] of labelByName) {
      if (name) out = out.split(name).join(label);
    }
    return out;
  };

  const bookList = books
    .slice(0, 60)
    .map((book, index) => {
      const parts = [
        `${index + 1}. 《${book.title}》`,
        book.author ? `author: ${book.author}` : null,
        book.language ? `language: ${book.language}` : null,
        `mode: ${book.share_mode === "flow" ? "漂流/pass-on" : "借阅/lend"}`,
        `status: ${statusLabel[book.status] ?? book.status}`,
        `owner: ${labelFor(book.owner_name)}`,
        `current holder: ${labelFor(book.holder_name)}`,
      ].filter(Boolean);
      return parts.join(", ");
    })
    .join("\n");

  const requestList = requests
    .filter((r) => r.status === "open")
    .slice(0, 20)
    .map(
      (r) =>
        `- 《${r.title}》${r.author ? ` (${r.author})` : ""} — ${r.want_count} 人想要`
    )
    .join("\n");

  const prompt = [
    "You are the assistant for a neighborhood book-sharing club (Chinese moms sharing children's and Chinese books).",
    "Answer the user's question using ONLY the club book data provided below (the catalog and wanted-book requests).",
    "You may recommend books, find who has a book, or list what is available.",
    "You do NOT have access to community chat/messages; if asked about discussions or conversations, say you can only help with the book catalog.",
    "If the data does not contain the answer, say you don't have that info yet — do not invent titles, people, or facts.",
    'Members are shown as pseudonyms ("You" for the person asking, "Member N" for others). Refer to them exactly by those labels; never guess real names.',
    "Be concise and friendly. Reply in the SAME language as the user's question (default 简体中文).",
    "",
    'The person asking is labeled "You". When they say "我/my", it refers to "You".',
    "",
    `User question: ${scrub(question)}`,
    "",
    "=== Club books ===",
    bookList || "(no books yet)",
    "",
    "=== Open wanted-book requests ===",
    requestList || "(none)",
  ].join("\n");

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
      }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const quotaExhausted =
      res.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(detail);
    throw new GeminiError(
      `Gemini request failed (${res.status}): ${detail.slice(0, 300)}`,
      quotaExhausted
    );
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}
