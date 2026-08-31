export type DocumentFilterItem = {
  name: string;
  description: string | null;
  categoryName: string | null;
  committeeName: string | null;
  category_id: string | null;
  primary_committee_id: string | null;
  created_at: string;
  updated_at: string;
  currentVersion: { mime_type: string; file_name: string } | null;
};

export function documentFileType(mime?: string, name?: string) {
  return (name?.split(".").pop() || mime?.split("/").pop() || "fil").toUpperCase();
}

export function filterAndSortDocuments<T extends DocumentFilterItem>(items: T[], filters: { search: string; category: string; committee: string; type: string; year: string; sort: string }) {
  const needle = filters.search.trim().toLocaleLowerCase("da");
  return items.filter((item) => (!needle || `${item.name} ${item.description ?? ""} ${item.categoryName ?? ""} ${item.committeeName ?? ""}`.toLocaleLowerCase("da").includes(needle))
    && (!filters.category || item.category_id === filters.category)
    && (!filters.committee || item.primary_committee_id === filters.committee)
    && (!filters.type || documentFileType(item.currentVersion?.mime_type, item.currentVersion?.file_name) === filters.type)
    && (!filters.year || String(new Date(item.updated_at).getFullYear()) === filters.year))
    .sort((a, b) => filters.sort === "name-asc" ? a.name.localeCompare(b.name, "da") : filters.sort === "name-desc" ? b.name.localeCompare(a.name, "da") : filters.sort === "oldest" ? Date.parse(a.created_at) - Date.parse(b.created_at) : filters.sort === "newest" ? Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(b.updated_at) - Date.parse(a.updated_at));
}
