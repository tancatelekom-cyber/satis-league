"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchRevenueExpensePassword } from "@/lib/revenue-expense";
import { REVENUE_EXPENSE_ACCESS_COOKIE } from "./constants";

export async function unlockRevenueExpensePage(formData: FormData) {
  const enteredPassword = String(formData.get("password") ?? "").trim();
  const expectedPassword = await fetchRevenueExpensePassword();

  if (!expectedPassword) {
    redirect("/gelir-gider");
  }

  if (enteredPassword !== expectedPassword) {
    redirect("/gelir-gider?hata=sifre");
  }

  const cookieStore = await cookies();
  cookieStore.set(REVENUE_EXPENSE_ACCESS_COOKIE, enteredPassword, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 12
  });

  redirect("/gelir-gider");
}
