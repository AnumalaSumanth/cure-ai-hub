import { supabase } from "@/integrations/supabase/client";
import { summarizeTip } from "@/lib/tips-ai.functions";
import type { TipFormValues } from "@/components/dashboard/TipForm";

async function unfeatureOthers(userId: string, exceptId?: string) {
  const q = supabase.from("tips").update({ is_featured: false }).eq("user_id", userId).eq("is_featured", true);
  const { error } = exceptId ? await q.neq("id", exceptId) : await q;
  if (error) throw error;
}

async function updateSummary(id: string, content: string) {
  try {
    const { summary } = await summarizeTip({ data: { content } });
    await supabase.from("tips").update({ ai_summary: summary }).eq("id", id);
  } catch {
    // best-effort; summary is optional
  }
}

export async function createTip(userId: string, values: TipFormValues) {
  if (values.is_featured) await unfeatureOthers(userId);
  const { data, error } = await supabase
    .from("tips")
    .insert({ user_id: userId, ...values })
    .select("id")
    .single();
  if (error) throw error;
  void updateSummary(data.id, values.content);
  return data.id as string;
}

export async function updateTip(id: string, userId: string, values: TipFormValues, prevContent?: string) {
  if (values.is_featured) await unfeatureOthers(userId, id);
  const { error } = await supabase.from("tips").update(values).eq("id", id);
  if (error) throw error;
  if (values.content !== prevContent) void updateSummary(id, values.content);
}
