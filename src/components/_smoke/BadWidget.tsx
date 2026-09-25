"use client";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export function BadWidget() {
  async function loadUsage() {
    const { data } = await supabase.from("usage_events").select("*");
    console.log(data);
  }

  return <button onClick={loadUsage}>Load</button>;
}
