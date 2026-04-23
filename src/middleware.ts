import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth for webhook endpoints (they need to be publicly accessible)
  if (pathname.startsWith("/api/webhook")) {
    return NextResponse.next();
  }

  // Skip auth for the login page and login API
  if (pathname === "/login" || pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  // Skip auth for static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get("netchex-auth");
  if (!authCookie || authCookie.value !== "authenticated") {
    // Redirect to login for page requests, 401 for API requests
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
