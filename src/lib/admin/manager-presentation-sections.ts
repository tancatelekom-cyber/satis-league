import { createAdminClient } from "@/lib/supabase/admin";

export type ManagerPresentationSectionKey =
  | "cover"
  | "overview"
  | "company"
  | "storeFocus"
  | "storeTables"
  | "employeeFocus"
  | "employeeTables"
  | "actions"
  | "closing";

export type ManagerPresentationSection = {
  key: ManagerPresentationSectionKey;
  label: string;
  sortOrder: number;
  isVisible: boolean;
};

const DEFAULT_MANAGER_PRESENTATION_SECTIONS: ManagerPresentationSection[] = [
  { key: "cover", label: "Kapak ve Ozet", sortOrder: 0, isVisible: true },
  { key: "overview", label: "Genel Gorunum", sortOrder: 1, isVisible: true },
  { key: "company", label: "Firma Genel Durumu", sortOrder: 2, isVisible: true },
  { key: "storeFocus", label: "Magaza Kritikleri", sortOrder: 3, isVisible: true },
  { key: "storeTables", label: "Magaza Tablolari", sortOrder: 4, isVisible: true },
  { key: "employeeFocus", label: "Calisan Kritikleri", sortOrder: 5, isVisible: true },
  { key: "employeeTables", label: "Calisan Tablolari", sortOrder: 6, isVisible: true },
  { key: "actions", label: "Aksiyon Plani", sortOrder: 7, isVisible: true },
  { key: "closing", label: "Kapanis Mesaji", sortOrder: 8, isVisible: true }
];

type ManagerPresentationSectionRow = {
  section_key: ManagerPresentationSectionKey;
  label: string;
  sort_order: number;
  is_visible?: boolean | null;
};

function normalizeSections(rows: ManagerPresentationSectionRow[]) {
  const rowMap = new Map(rows.map((row) => [row.section_key, row] as const));

  return DEFAULT_MANAGER_PRESENTATION_SECTIONS.map((section) => {
    const matched = rowMap.get(section.key);

    return {
      key: section.key,
      label: matched?.label?.trim() || section.label,
      sortOrder: Number.isFinite(matched?.sort_order) ? Number(matched?.sort_order) : section.sortOrder,
      isVisible: typeof matched?.is_visible === "boolean" ? matched.is_visible : section.isVisible
    } satisfies ManagerPresentationSection;
  }).sort((left, right) => left.sortOrder - right.sortOrder);
}

export async function getManagerPresentationSections() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("manager_presentation_sections")
    .select("section_key, label, sort_order, is_visible")
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      sections: DEFAULT_MANAGER_PRESENTATION_SECTIONS,
      persisted: false
    };
  }

  const rows = (data as ManagerPresentationSectionRow[] | null) ?? [];
  const missingSections = DEFAULT_MANAGER_PRESENTATION_SECTIONS.filter(
    (section) => !rows.some((row) => row.section_key === section.key)
  );

  if (missingSections.length > 0) {
    await admin.from("manager_presentation_sections").upsert(
      missingSections.map((section) => ({
        section_key: section.key,
        label: section.label,
        sort_order: section.sortOrder,
        is_visible: section.isVisible
      })),
      {
        onConflict: "section_key"
      }
    );
  }

  return {
    sections: normalizeSections([
      ...rows,
      ...missingSections.map((section) => ({
        section_key: section.key,
        label: section.label,
        sort_order: section.sortOrder,
        is_visible: section.isVisible
      }))
    ]),
    persisted: true
  };
}
