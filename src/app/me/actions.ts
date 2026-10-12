"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** 이 기기에서만 로그아웃 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
