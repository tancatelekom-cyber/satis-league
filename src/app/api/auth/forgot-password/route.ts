"use server";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicEnv } from "@/lib/supabase/config";

export async function POST(request: Request) {
  const env = getSupabasePublicEnv();

  if (!env) {
    return NextResponse.json(
      { message: "Supabase baglantisi eksik. Ortam degiskenlerini kontrol edin." },
      { status: 500 }
    );
  }

  let email = "";

  try {
    const body = (await request.json()) as { email?: string };
    email = String(body.email ?? "")
      .trim()
      .toLocaleLowerCase("tr-TR");
  } catch {
    return NextResponse.json({ message: "Gecersiz istek gonderildi." }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ message: "Mail adresi zorunludur." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { message: "Hesap kontrolu yapilamadi. Lutfen tekrar deneyin." },
      { status: 500 }
    );
  }

  if (!profile) {
    return NextResponse.json(
      { message: "Bu mail adresiyle tanimli bir hesap bulunamadi." },
      { status: 404 }
    );
  }

  const supabase = createSupabaseClient(env.url, env.anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const redirectTo = `${new URL(request.url).origin}/sifre-yenile`;
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (resetError) {
    return NextResponse.json(
      { message: resetError.message || "Sifre sifirlama maili gonderilemedi." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    message: "Sifre yenileme linki tanimli mail adresinize gonderildi."
  });
}
