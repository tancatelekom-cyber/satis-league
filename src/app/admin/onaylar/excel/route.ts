import { NextResponse } from "next/server";
import { buildCsv } from "@/lib/export/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type AdminAccessProfile = {
  id: string;
  role: string;
  approval: string;
};

type ManagedProfileExportRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  approval: string;
  is_on_leave: boolean;
  store:
    | {
        name: string;
      }
    | Array<{
        name: string;
      }>
    | null;
};

function formatLastLogin(value: string | null) {
  if (!value) {
    return "Hic giris yapmadi";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "aktif-kullanicilar-son-giris"
  );
}

async function ensureAdminRequest() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, approval")
    .eq("id", user.id)
    .single();

  const safeProfile = profile as AdminAccessProfile | null;

  if (!safeProfile || safeProfile.approval !== "approved" || safeProfile.role !== "admin") {
    return null;
  }

  return safeProfile;
}

export async function GET() {
  const adminProfile = await ensureAdminRequest();

  if (!adminProfile) {
    return NextResponse.json({ error: "Yetkisiz erisim." }, { status: 403 });
  }

  const admin = createAdminClient();
  const authUsers: Array<{ id: string; last_sign_in_at?: string | null }> = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });

    if (error) {
      return NextResponse.json({ error: `Kullanicilar okunamadi: ${error.message}` }, { status: 500 });
    }

    const batch = data?.users ?? [];
    authUsers.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, full_name, email, role, approval, is_on_leave, store:stores(name)")
    .eq("approval", "approved")
    .eq("is_on_leave", false)
    .order("full_name", { ascending: true });

  if (profilesError) {
    return NextResponse.json({ error: `Profiller okunamadi: ${profilesError.message}` }, { status: 500 });
  }

  const authUserLastLoginMap = new Map(authUsers.map((user) => [user.id, user.last_sign_in_at ?? null] as const));
  const rows = ((profiles as ManagedProfileExportRow[] | null) ?? [])
    .map((profile) => ({
      ...profile,
      store: Array.isArray(profile.store) ? profile.store[0] ?? null : profile.store,
      last_sign_in_at: authUserLastLoginMap.get(profile.id) ?? null
    }))
    .sort((left, right) => {
      const leftTime = left.last_sign_in_at ? new Date(left.last_sign_in_at).getTime() : 0;
      const rightTime = right.last_sign_in_at ? new Date(right.last_sign_in_at).getTime() : 0;
      return rightTime - leftTime;
    });

  const csv = buildCsv([
    ["Ad Soyad", "Mail", "Rol", "Magaza", "Son Giris"],
    ...rows.map((profile) => [
      profile.full_name,
      profile.email,
      profile.role,
      profile.store?.name ?? "Merkez",
      formatLastLogin(profile.last_sign_in_at)
    ])
  ]);

  const fileName = safeFileName(`aktif-kullanicilar-son-giris-${new Date().toISOString().slice(0, 10)}`);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
