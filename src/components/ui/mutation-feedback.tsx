import type { MutationFeedbackState } from "@/hooks/use-mutation-feedback";

export function MutationFeedback({
  feedback,
  className = "",
}: {
  feedback: MutationFeedbackState;
  className?: string;
}) {
  if (feedback.status === "idle" || !feedback.message) return null;

  const label =
    feedback.status === "pending"
      ? "Gemmer"
      : feedback.status === "success"
        ? "Gemt"
        : "Kunne ikke gemme";

  return (
    <div
      aria-live={feedback.status === "error" ? "assertive" : "polite"}
      className={`rounded-[var(--radius-control)] px-3 py-2 text-sm ${
        feedback.status === "error"
          ? "alert-danger"
          : feedback.status === "success"
            ? "alert-success"
            : "border border-line bg-subtle text-muted"
      } ${className}`}
      role={feedback.status === "error" ? "alert" : "status"}
    >
      <span className="font-semibold">{label}:</span>{" "}
      <span>{feedback.message}</span>
    </div>
  );
}
