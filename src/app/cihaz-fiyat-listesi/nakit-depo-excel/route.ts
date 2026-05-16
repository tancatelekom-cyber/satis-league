import { NextResponse } from "next/server";
import { fetchCashDepotRows } from "@/lib/device-price-list";
import { buildCsv } from "@/lib/export/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "nakit-depo"
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Giris gerekli." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("approval, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.approval !== "approved" || !["admin", "management"].includes(profile.role)) {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const selectedCategory = String(searchParams.get("category") ?? "").trim();
  const selectedSubCategory = String(searchParams.get("subcategory") ?? "").trim();
  const selectedBrand = String(searchParams.get("brand") ?? "").trim();
  const selectedModel = String(searchParams.get("model") ?? "").trim();

  try {
    const rows = await fetchCashDepotRows();
    const filteredRows = rows.filter((item) => {
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (selectedSubCategory && item.subCategory !== selectedSubCategory) return false;
      if (selectedBrand && item.brand !== selectedBrand) return false;
      if (selectedModel && item.model !== selectedModel) return false;
      return true;
    });

    const csv = buildCsv([
      [
        "Kategori",
        "Alt Kategori",
        "Marka",
        "Model",
        "Renk",
        "Satis Fiyati",
        "Maliyet",
        "Prim",
        "Ek Aciklama",
        "Seri No"
      ],
      ...filteredRows.map((item) => [
        item.category,
        item.subCategory,
        item.brand,
        item.model,
        item.color,
        item.salePrice,
        item.costPrice,
        item.bonus,
        item.note,
        item.serialNo
      ])
    ]);

    const fileNameParts = ["nakit-depo"];
    if (selectedCategory) fileNameParts.push(selectedCategory);
    if (selectedSubCategory) fileNameParts.push(selectedSubCategory);
    if (selectedBrand) fileNameParts.push(selectedBrand);
    if (selectedModel) fileNameParts.push(selectedModel);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFileName(fileNameParts.join("-"))}.csv"`
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nakit depo excel olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
