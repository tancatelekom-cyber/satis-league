import type { AdminManagedProfile, AdminStore } from "@/lib/types";

export const ORGANIZATION_COORDINATOR_NAME = "Emre Terzi";

export type OrganizationStore = AdminStore & {
  managers: AdminManagedProfile[];
  employees: AdminManagedProfile[];
};

export type OrganizationChartData = {
  coordinator: AdminManagedProfile | undefined;
  stores: OrganizationStore[];
  unassignedProfiles: AdminManagedProfile[];
  managerCount: number;
  employeeCount: number;
};

function normalizeName(value: string) {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buildOrganizationChartData(
  profiles: AdminManagedProfile[],
  allStores: AdminStore[]
): OrganizationChartData {
  const activeProfiles = profiles.filter(
    (profile) => profile.approval === "approved" && !profile.is_on_leave
  );
  const coordinator = activeProfiles.find(
    (profile) => normalizeName(profile.full_name) === normalizeName(ORGANIZATION_COORDINATOR_NAME)
  );
  const organizationProfiles = activeProfiles.filter(
    (profile) => profile.id !== coordinator?.id && (profile.role === "manager" || profile.role === "employee")
  );
  const stores = allStores
    .filter((store) => store.is_active || organizationProfiles.some((profile) => profile.store_id === store.id))
    .map((store) => ({
      ...store,
      managers: organizationProfiles
        .filter((profile) => profile.store_id === store.id && profile.role === "manager")
        .sort((left, right) => left.full_name.localeCompare(right.full_name, "tr")),
      employees: organizationProfiles
        .filter((profile) => profile.store_id === store.id && profile.role === "employee")
        .sort((left, right) => left.full_name.localeCompare(right.full_name, "tr"))
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "tr"));
  const knownStoreIds = new Set(allStores.map((store) => store.id));
  const unassignedProfiles = organizationProfiles
    .filter((profile) => !profile.store_id || !knownStoreIds.has(profile.store_id))
    .sort((left, right) => left.full_name.localeCompare(right.full_name, "tr"));

  return {
    coordinator,
    stores,
    unassignedProfiles,
    managerCount: stores.reduce((total, store) => total + store.managers.length, 0),
    employeeCount: stores.reduce((total, store) => total + store.employees.length, 0)
  };
}
