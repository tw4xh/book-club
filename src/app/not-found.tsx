import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <div className="text-5xl">🔍</div>
      <h1 className="mt-4 text-xl font-bold">404</h1>
      <p className="mt-2 text-stone-500">
        这一页找不到了 · This page could not be found.
      </p>
      <Link href="/" className="btn-primary mt-6">
        ← 返回 / Home
      </Link>
    </div>
  );
}
