import { useCallback, useEffect, useState } from "react";

import { getTakeoverData } from "../actions";
import type { TakeoverAgent, TakeoverData } from "../types";
import type { SavedPortTarget } from "@/app/recon/actions";

export function useTakeoverData() {
  const [targets, setTargets] = useState<SavedPortTarget[]>([]);
  const [agents, setAgents] = useState<TakeoverAgent[]>([]);
  const [targetMessage, setTargetMessage] = useState("");
  const [agentMessage, setAgentMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const applyData = useCallback((result: TakeoverData) => {
    setTargets(result.targets);
    setAgents(result.agents);
    setTargetMessage(result.targetMessage ?? "");
    setAgentMessage(result.agentMessage ?? "");
  }, []);

  const applyLoadFailure = useCallback(() => {
  setTargets([]);
  setAgents([]);
  setTargetMessage("โหลด Saved Ports จากฐานข้อมูลไม่สำเร็จ");
  setAgentMessage("โหลด Agent ไม่สำเร็จ");
}, []);

  const hydrate = useCallback(async () => {
    try {
      const result = await getTakeoverData();
      applyData(result);
    } catch {
      applyLoadFailure();
    } finally {
      setLoading(false);
    }
  }, [applyData, applyLoadFailure]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const refreshData = useCallback(async () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);

    try {
      const result = await getTakeoverData();
      applyData(result);
    } catch {
      applyLoadFailure();
    } finally {
      setRefreshing(false);
    }
  }, [applyData, applyLoadFailure, refreshing]);

  return {
    targets,
    agents,
    targetMessage,
    agentMessage,
    loading,
    refreshing,
    setTargets,
    setAgents,
    applyData,
    applyLoadFailure,
    refreshData,
  };
}

export default useTakeoverData;
