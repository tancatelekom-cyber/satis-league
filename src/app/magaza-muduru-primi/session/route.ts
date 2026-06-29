import { NextResponse } from "next/server";
import { MANAGER_PRIME_ACCESS_COOKIE } from "../constants";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(MANAGER_PRIME_ACCESS_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 0
  });
  return response;
}
