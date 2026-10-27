"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";
import type { FormState, RunDetail } from "@/lib/types";
import { posInt } from "@/lib/validate";

export async function cancelRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = posInt(formData.get("runId"));
  if (id === null) return { ok: false, message: "Run is invalid." };

  const res = await apiPost<RunDetail>(`/api/runs/${id}/cancel`);
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath("/runs");
  revalidatePath(`/runs/${id}`);
  return { ok: true, message: `Run #${id} cancelled.`, id };
}
