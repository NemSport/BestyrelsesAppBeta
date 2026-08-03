export type AnnualWheelView = "year" | "quarter" | "month";
export type AnnualWheelKind = "" | "activity" | "meeting" | "task" | "decision";

export type AnnualWheelState = {
  view: AnnualWheelView;
  focusMonth: number;
  committeeId: string;
  responsibleId: string;
  kind: AnnualWheelKind;
};

const validViews = new Set<AnnualWheelView>(["year", "quarter", "month"]);
const validKinds = new Set<AnnualWheelKind>([
  "",
  "activity",
  "meeting",
  "task",
  "decision",
]);

export function parseAnnualWheelState(
  searchParams: Pick<URLSearchParams, "get">,
  initialCommitteeId = "",
  currentMonth = new Date().getMonth(),
): AnnualWheelState {
  const rawView = searchParams.get("view") ?? "";
  const rawMonth = Number(searchParams.get("month"));
  const rawKind = searchParams.get("kind") ?? "";

  return {
    view: validViews.has(rawView as AnnualWheelView)
      ? (rawView as AnnualWheelView)
      : "year",
    focusMonth:
      Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12
        ? rawMonth - 1
        : currentMonth,
    committeeId: searchParams.get("committeeId") ?? initialCommitteeId,
    responsibleId: searchParams.get("responsible") ?? "",
    kind: validKinds.has(rawKind as AnnualWheelKind)
      ? (rawKind as AnnualWheelKind)
      : "",
  };
}

export function annualWheelSearchParams(
  current: URLSearchParams,
  state: AnnualWheelState,
  initialCommitteeId = "",
) {
  const next = new URLSearchParams(current);
  for (const key of ["view", "month", "committeeId", "responsible", "kind"]) {
    next.delete(key);
  }

  if (state.view !== "year") next.set("view", state.view);
  if (state.view !== "year") {
    next.set("month", String(state.focusMonth + 1));
  }
  if (state.committeeId && state.committeeId !== initialCommitteeId) {
    next.set("committeeId", state.committeeId);
  }
  if (state.responsibleId) next.set("responsible", state.responsibleId);
  if (state.kind) next.set("kind", state.kind);

  return next;
}
