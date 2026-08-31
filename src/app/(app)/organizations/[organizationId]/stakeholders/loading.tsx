export default function StakeholdersLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Indlæser interessenter"
      className="space-y-6"
    >
      <div className="h-20 animate-pulse rounded-[var(--radius-panel)] bg-surface" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-24 animate-pulse rounded-[var(--radius-panel)] bg-surface"
            key={index}
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-[var(--radius-panel)] bg-surface" />
      <p className="text-sm text-muted">
        Indlæser interessenter og relationer…
      </p>
    </div>
  );
}
