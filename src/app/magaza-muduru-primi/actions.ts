"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchManagerPrimePassword } from "@/lib/manager-prime";
import { MANAGER_PRIME_ACCESS_COOKIE } from "./constants";

export async function unlockManagerPrimePage(formData: FormData) {
  const enteredPassword = String(formData.get("password") ?? "").trim();
  const expectedPassword = await fetchManagerPrimePassword();

  if (!expectedPassword) {
    redirect("/magaza-muduru-primi");
  }

  if (enteredPassword !== expectedPassword) {
    redirect("/magaza-muduru-primi?hata=sifre");
  }

  const cookieStore = await cookies();
  cookieStore.set(MANAGER_PRIME_ACCESS_COOKIE, enteredPassword, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12
  });

  redirect("/magaza-muduru-primi");
}
