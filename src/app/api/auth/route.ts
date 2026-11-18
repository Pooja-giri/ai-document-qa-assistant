import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, password } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();

    if (action === "signup") {
      // Create confirmed user via admin to avoid SMTP verification rate limits during testing/production
      const { data: newUser, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
        });

      if (createError) {
        if (createError.message.includes("already registered") || createError.message.includes("unique")) {
          return NextResponse.json(
            { error: "An account with this email already exists. Please log in." },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: createError.message || "Failed to create account." },
          { status: 400 },
        );
      }

      // Automatically sign in the newly registered user
      const { data: signInData, error: signInError } =
        await supabaseAdmin.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (signInError || !signInData.session) {
        return NextResponse.json({
          success: true,
          message: "Account created successfully. Please log in.",
          user: {
            id: newUser.user?.id,
            email: newUser.user?.email,
          },
        });
      }

      const response = NextResponse.json({
        success: true,
        message: "Signed up successfully!",
        user: {
          id: signInData.user.id,
          email: signInData.user.email,
        },
        token: signInData.session.access_token,
      });

      // Set auth cookie
      response.cookies.set("auth_token", signInData.session.access_token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return response;
    }

    if (action === "login") {
      const { data: signInData, error: signInError } =
        await supabaseAdmin.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

      if (signInError || !signInData.session) {
        return NextResponse.json(
          { error: "Invalid email or password." },
          { status: 401 },
        );
      }

      const response = NextResponse.json({
        success: true,
        message: "Logged in successfully!",
        user: {
          id: signInData.user.id,
          email: signInData.user.email,
        },
        token: signInData.session.access_token,
      });

      response.cookies.set("auth_token", signInData.session.access_token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      return response;
    }

    if (action === "logout") {
      const response = NextResponse.json({
        success: true,
        message: "Logged out successfully.",
      });

      response.cookies.delete("auth_token");
      return response;
    }

    return NextResponse.json(
      { error: "Invalid action. Supported actions: signup, login, logout" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Auth API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Authentication error." },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    let token: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "").trim();
    }

    if (!token) {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(/auth_token=([^;]+)/);
      if (match) {
        token = match[1];
      }
    }

    if (!token) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json({ authenticated: false, user: null });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      token,
    });
  } catch (error) {
    console.error("Auth status error:", error);
    return NextResponse.json({ authenticated: false, user: null });
  }
}
