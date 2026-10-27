"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";
import type { FormState } from "@/lib/types";
import { jsonBytes, MAX_JSON_BYTES, posInt, text } from "@/lib/validate";

interface Created { id: number }

export async function createExperimentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const projectId = posInt(formData.get("projectId"));
  const rawAgent = text(formData.get("agentId"));
  const agentId = rawAgent ? posInt(formData.get("agentId")) : null;
  const name = text(formData.get("name"));
  const hypothesis = text(formData.get("hypothesis"));

  if (projectId === null) return { ok: false, message: "Choose a project." };
  if (rawAgent && agentId === null) return { ok: false, message: "Agent selection is invalid." };
  if (name.length < 1 || name.length > 120) return { ok: false, message: "Name is required (1-120 characters)." };
  if (hypothesis.length > 5000) return { ok: false, message: "Hypothesis is limited to 5000 characters." };

  const payload: Record<string, unknown> = { projectId, name };
  if (agentId !== null) payload.agentId = agentId;
  if (hypothesis) payload.hypothesis = hypothesis;

  const res = await apiPost<Created>("/api/experiments", payload);
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath("/experiments");
  return { ok: true, message: `Experiment #${res.data.id} created.`, id: res.data.id };
}

export async function launchRunAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const experimentId = posInt(formData.get("experimentId"));
  const prompt = text(formData.get("prompt"));

  if (experimentId === null) return { ok: false, message: "Experiment is invalid." };
  if (prompt.length < 1) return { ok: false, message: "Enter a prompt." };

  const params = { prompt };
  if (jsonBytes(params) > MAX_JSON_BYTES) return { ok: false, message: "Prompt exceeds the 16KB limit." };

  const res = await apiPost<{ id: number }>(`/api/experiments/${experimentId}/runs`, { params });
  if (!res.ok) return { ok: false, message: res.message };

  revalidatePath("/experiments");
  revalidatePath("/runs");
  return { ok: true, message: `Run #${res.data.id} queued.`, id: res.data.id };
}
