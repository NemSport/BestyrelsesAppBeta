export type OrganizationNavItem = {
  label: string;
  suffix: string;
  match?: "exact";
};

export const organizationNavItems: readonly OrganizationNavItem[] = [
  { label: "Overblik", suffix: "" },
  { label: "Handlinger", suffix: "/actions" },
  { label: "Udvalg", suffix: "/committees" },
  { label: "Møder", suffix: "/meetings" },
  { label: "Beslutninger", suffix: "/decisions" },
  { label: "Dokumenter", suffix: "/documents" },
  { label: "Interessenter & Relationer", suffix: "/stakeholders" },
  { label: "Opgaver", match: "exact", suffix: "/tasks" },
  { label: "Årshjul", suffix: "/annual-wheel" },
  { label: "Jobkort", suffix: "/job-cards" },
  { label: "Medlemmer", suffix: "/members" },
  { label: "Papirkurv", suffix: "/trash" },
];

export function getVisibleOrganizationNavItems(canManageTrash: boolean) {
  return organizationNavItems.filter(
    (item) => item.suffix !== "/trash" || canManageTrash,
  );
}

export function isOrganizationNavItemActive(
  pathname: string,
  root: string,
  item: OrganizationNavItem,
) {
  const href = `${root}${item.suffix}`;
  if (item.suffix === "") return pathname === root;
  if (item.label === "Udvalg") {
    if (pathname === href || pathname === `${href}/new`) return true;
    if (!pathname.startsWith(`${href}/`)) return false;
    return (
      !pathname.includes("/meetings") && !pathname.includes("/annual-wheel")
    );
  }
  if (item.label === "Møder") {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      (pathname.startsWith(`${root}/committees/`) &&
        pathname.includes("/meetings"))
    );
  }
  if (item.label === "Årshjul") {
    return (
      pathname === href ||
      pathname.startsWith(`${href}/`) ||
      (pathname.startsWith(`${root}/committees/`) &&
        pathname.includes("/annual-wheel"))
    );
  }
  if (item.match === "exact") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getActiveCommitteeId(pathname: string, root: string) {
  const prefix = `${root}/committees/`;
  if (!pathname.startsWith(prefix)) return null;
  const committeeId = pathname.slice(prefix.length).split("/")[0];
  return committeeId && committeeId !== "new" ? committeeId : null;
}
