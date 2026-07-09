import { NextResponse } from "next/server";
import { REVENUE_EXPENSE_ACCESS_COOKIE } from "../constants";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(REVENUE_EXPENSE_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0
  });
  return response;
}
