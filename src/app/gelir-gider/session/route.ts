import { NextResponse } from "next/server";

// Older open tabs still call this endpoint when they close. Retire their Sheet cookie.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("revenue-expense-access", "", {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 0
  });
  return response;
}
