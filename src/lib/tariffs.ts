import { TariffCategoryMode, TariffRecord } from "@/lib/types";

export function formatTariffDataGb(value: number) {
  return `${Number(value).toFixed(value % 1 === 0 ? 0 : 1)} GB`;
}

export function getTariffBucketLabel(tariff: TariffRecord, mode: TariffCategoryMode) {
  if (mode === "gb") {
    const data = Number(tariff.data_gb ?? 0);

    if (data <= 5) return "0-5 GB";
    if (data <= 10) return "6-10 GB";
    if (data <= 20) return "11-20 GB";
    if (data <= 30) return "21-30 GB";
    if (data <= 50) return "31-50 GB";
    return "50+ GB";
  }

  if (mode === "minutes") {
    const minutes = Number(tariff.minutes ?? 0);

    if (minutes <= 500) return "0-500 DK";
    if (minutes <= 1000) return "501-1000 DK";
    if (minutes <= 2000) return "1001-2000 DK";
    if (minutes <= 5000) return "2001-5000 DK";
    return "5000+ DK";
  }

  return tariff.category_name?.trim() || tariff.name.trim();
}

export function buildTariffFilterOptions(tariffs: TariffRecord[], mode: TariffCategoryMode) {
  const counts = new Map<string, number>();

  tariffs.forEach((tariff) => {
    const label = getTariffBucketLabel(tariff, mode);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  return Array.from(counts.entries()).map(([value, count]) => ({
    value,
    label: `${value} (${count})`
  }));
}

export function filterTariffs(
  tariffs: TariffRecord[],
  mode: TariffCategoryMode,
  selectedValue: string,
  search: string
) {
  const normalizedSearch = search.trim().toLocaleLowerCase("tr-TR");

  return tariffs.filter((tariff) => {
    if (selectedValue && getTariffBucketLabel(tariff, mode) !== selectedValue) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      tariff.name,
      tariff.category_name,
      tariff.provider,
      tariff.details ?? ""
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");

    return haystack.includes(normalizedSearch);
  });
}
