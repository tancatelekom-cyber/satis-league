import { createAdminClient } from "@/lib/supabase/admin";

export type ManagerPresentationStoreTableItem = {
  key: string;
  label: string;
  sortOrder: number;
};

type ManagerPresentationStoreTableRow = {
  table_key: string;
  label: string;
  sort_order: number;
};

export function buildManagerPresentationStoreTableKey(parentTitle: string | undefined, title: string) {
  const rawValue = parentTitle ? `${parentTitle}__${title}` : title;

  return rawValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeItems(defaultItems: ManagerPresentationStoreTableItem[], rows: ManagerPresentationStoreTableRow[]) {
  const rowMap = new Map(rows.map((row) => [row.table_key, row] as const));

  return defaultItems
    .map((item) => {
      const matched = rowMap.get(item.key);

      return {
        key: item.key,
        label: matched?.label?.trim() || item.label,
        sortOrder: Number.isFinite(matched?.sort_order) ? Number(matched?.sort_order) : item.sortOrder
      } satisfies ManagerPresentationStoreTableItem;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function getManagerPresentationStoreTableItems(defaultItems: ManagerPresentationStoreTableItem[]) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("manager_presentation_store_tables")
    .select("table_key, label, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      items: defaultItems,
      persisted: false
    };
  }

  const rows = (data as ManagerPresentationStoreTableRow[] | null) ?? [];
  const missingItems = defaultItems.filter((item) => !rows.some((row) => row.table_key === item.key));

  if (missingItems.length > 0) {
    await admin.from("manager_presentation_store_tables").upsert(
      missingItems.map((item) => ({
        table_key: item.key,
        label: item.label,
        sort_order: item.sortOrder
      })),
      {
        onConflict: "table_key"
      }
    );
  }

  return {
    items: normalizeItems(
      defaultItems,
      [
        ...rows,
        ...missingItems.map((item) => ({
          table_key: item.key,
          label: item.label,
          sort_order: item.sortOrder
        }))
      ]
    ),
    persisted: true
  };
}
