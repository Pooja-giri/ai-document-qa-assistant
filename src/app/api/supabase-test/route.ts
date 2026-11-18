import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { error } = await supabaseAdmin
      .from("documents")
      .select("id")
      .limit(1);

    if (error) {
      console.error("Supabase connection error:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Supabase database connection failed.",
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Supabase database connected successfully!",
    });
  } catch (error) {
    console.error("Supabase test error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to connect to Supabase.",
      },
      { status: 500 },
    );
  }
}
