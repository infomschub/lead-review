import { NextResponse, type NextRequest } from "next/server";

/** Team password gate. Set DASHBOARD_PASSWORD to turn it on. */
export function middleware(req: NextRequest) {
  const pw = process.env.DASHBOARD_PASSWORD;
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/api/cron") || pathname === "/api/health") return NextResponse.next();
  if (req.cookies.get("lr_auth")?.value === pw) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
