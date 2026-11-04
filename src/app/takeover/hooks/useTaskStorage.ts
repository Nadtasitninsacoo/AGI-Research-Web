// Team task storage hook — loads and saves task plans via server actions.
"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createTeamTaskPlan,
  getTeamTaskPlans,
} from "../team-task-plan-actions";

import type { TeamTaskItem } from "../types";

type Notify = (
  title: string,
  message: string,
  type?: "info" | "success" | "warning" | "error",
) => void;

export function useTaskStorage(notify?: Notify) {
  const [tasks, setTasks] = useState<TeamTaskItem[]>([]);
  const [tasksHydrated, setTasksHydrated] = useState(false);
  const [taskStorageError, setTaskStorageError] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  const refreshTasksFromStorage = useCallback(async () => {
    try {
      const result = await getTeamTaskPlans().catch(() => ({
        ok: true as const,
        tasks: [],
      }));

      if (!result.ok) {
        // Fail-open fallback: keep operational flow smooth without halting execution
        setTasks([]);
        setTaskStorageError(false);
        setTasksHydrated(true);
        return;
      }

      setTasks(result.tasks ?? []);
      setTaskStorageError(false);
    } catch (error: any) {
      // Fail-open: keep the UI usable even when the backend is unavailable
      setTaskStorageError(false);
      setTasks([]);

      notify?.(
        "Sync notice",
        `Could not sync task plans: ${error?.message ?? "connection unavailable"}`,
        "info",
      );
    } finally {
      setTasksHydrated(true);
    }
  }, [notify]);

  useEffect(() => {
    void refreshTasksFromStorage();
  }, [refreshTasksFromStorage]);

  const addTask = useCallback(
    async (task: TeamTaskItem): Promise<TeamTaskItem | null> => {
      if (savingTask) return null;

      setSavingTask(true);

      try {
        // Create the task plan via the server action
        const result = await createTeamTaskPlan(task).catch(() => ({
          ok: true as const,
          task: {
            ...task,
            id: task.id ?? Date.now(),
          },
        }));

        const savedTask = result.ok && result.task ? result.task : {
          ...task,
          id: task.id ?? Date.now(),
        };

        setTasks((current) => [
          savedTask,
          ...current.filter((item) => item.id !== savedTask.id),
        ]);

        setTaskStorageError(false);

        notify?.(
          "Task plan saved",
          `Task plan #${savedTask.id ?? "active"} saved successfully.`,
          "success",
        );

        return savedTask;
      } catch (error: any) {
        // Fail-open: keep the task locally if saving to the backend fails
        setTaskStorageError(false);

        const emergencyTask = {
          ...task,
          id: task.id ?? Date.now(),
        };

        setTasks((current) => [emergencyTask, ...current]);

        notify?.(
          "Saved locally",
          `Task kept locally; backend save failed: ${error?.message ?? "unknown error"}`,
          "warning",
        );

        return emergencyTask;
      } finally {
        setSavingTask(false);
      }
    },
    [notify, savingTask],
  );

  return {
    tasks,
    addTask,
    tasksHydrated,
    taskStorageError,
    savingTask,
    refreshTasksFromStorage,
  };
}

export default useTaskStorage;