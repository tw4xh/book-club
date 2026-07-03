import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { lookupIsbn } from "@/lib/books-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ isbn: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { isbn } = await params;
  const meta = await lookupIsbn(isbn);
  if (!meta) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(meta);
}
