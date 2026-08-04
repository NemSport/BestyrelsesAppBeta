export default function OrganizationWorkspaceLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Indlæser arbejdsområde"
      className="space-y-6"
    >
      <div className="h-20 animate-pulse border-y border-line bg-surface" />
      <div className="h-44 animate-pulse border-y border-line bg-brand-soft/30" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 animate-pulse bg-surface" />
        <div className="h-24 animate-pulse bg-surface" />
        <div className="h-24 animate-pulse bg-surface" />
      </div>
      <p className="text-sm text-muted">Indlæser dit prioriterede overblik…</p>
    </div>
  );
}
