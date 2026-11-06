"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";
import type { Agent, FormState } from "@/lib/types";
import { parseJsonObject, text } from "@/lib/validate";

export async function createAgentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = text(formData.get("name"));
  const description = text(formData.get("description"));
  const model = text(formData.get("model"));

  if (name.length < 1 || name.length > 120) return { ok: false, message: "Name is required (1-120 characters)." };
  if (description.length > 5000) return { ok: false, message: "Description is limited to 5000 characters." };
  if (model.length > 120) return { ok: false, message: "Model is limited to 120 characters." };

  const config = parseJsonObject(text(formData.get("config")));
  if (config.error) return { ok: false, message: config.error };

  const payload: Record<string, unknown> = { name };
  if (description) payload.description = description;
  if (model) payload.model = model;
  if (config.value) payload.config = config.value;

  const res = await apiPost<Agent>("/api/agents", payload);
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath("/agents");
  return { ok: true, message: `Agent ${res.data.name} registered.`, id: res.data.id };
}
