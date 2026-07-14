import { exitDemoAction, resetDemoAction } from "@/app/actions";

export function DemoBanner({
  labels,
}: {
  labels: { title: string; body: string; reset: string; exit: string };
}) {
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">🧪 {labels.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-amber-800">{labels.body}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <form action={resetDemoAction}>
            <button
              type="submit"
              className="btn border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100"
            >
              {labels.reset}
            </button>
          </form>
          <form action={exitDemoAction}>
            <button
              type="submit"
              className="btn px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
            >
              {labels.exit}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
