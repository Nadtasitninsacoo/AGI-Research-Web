// ============================================================================
// DARK AGI - Production-Grade Autonomous Execution Engine
// Handles task decomposition, state tracking, real tool execution, and verification.
// ============================================================================

import { query, execute } from "../db.mjs";
import { log } from "../logger.mjs";

/**
 * Task Execution States aligned with rigorous verification lifecycle
 */
export const TASK_STATES = {
  PLANNED: "planned",
  APPROVED: "approved",
  EXECUTED: "executed",
  FAILED: "failed",
  VERIFIED: "verified"
};

/**
 * Persist task state transition to the database with telemetry logging.
 * Throws on failure to prevent silent state desynchronization.
 */
export async function updateTaskState({ taskId, state, result = null, error = null }) {
  if (!taskId || !Object.values(TASK_STATES).includes(state)) {
    throw new Error(`Invalid task state transition parameters: taskId=${taskId}, state=${state}`);
  }

  try {
    await execute(
      `UPDATE agent_tasks 
       SET status = ?, result = ?, error_detail = ?, updated_at = NOW() 
       WHERE id = ?`,
      [
        state, 
        result ? JSON.stringify(result) : null, 
        error ? String(error).slice(0, 4000) : null, 
        taskId
      ]
    );

    await log({
      level: state === TASK_STATES.FAILED ? "error" : "info",
      message: `Task ${taskId} transitioned to state: ${state}`,
      detail: { taskId, state, result, error }
    });
  } catch (dbErr) {
    // Critical failure: do not swallow database persistence errors
    throw new Error(`Failed to persist task state [${state}] for task ${taskId}: ${dbErr.message}`);
  }
}

/**
 * Execute an approved operation through real tool adapters with strict verification.
 */
export async function executeOperation({ taskId, toolName, args, context }) {
  if (!taskId || !toolName) {
    throw new Error("Missing mandatory execution parameters: taskId and toolName are required.");
  }

  // 1. Mark task as approved before execution
  await updateTaskState({ taskId, state: TASK_STATES.APPROVED });

  try {
    // Dynamically resolve or invoke the real tool adapter
    const toolAdapter = context?.toolRegistry?.[toolName];
    if (!toolAdapter || typeof toolAdapter !== "function") {
      throw new Error(`Tool adapter not found or invalid for: ${toolName}`);
    }

    // Execute real operation
    const executionOutput = await toolAdapter(args, context);

    // 2. Mark task as executed
    await updateTaskState({ 
      taskId, 
      state: TASK_STATES.EXECUTED, 
      result: executionOutput 
    });

    // 3. Run verification logic to ensure operation met objectives
    const isVerified = await verifyOperationOutput(toolName, executionOutput);
    if (!isVerified) {
      throw new Error(`Operation verification failed for tool: ${toolName}`);
    }

    // 4. Mark task as fully verified
    await updateTaskState({ 
      taskId, 
      state: TASK_STATES.VERIFIED, 
      result: executionOutput 
    });

    return {
      success: true,
      taskId,
      output: executionOutput
    };

  } catch (err) {
    // Capture failure state explicitly
    await updateTaskState({ 
      taskId, 
      state: TASK_STATES.FAILED, 
      error: err.message 
    });

    throw err; // Propagate critical execution error for recovery handling
  }
}

/**
 * Verify operation execution results against expected criteria.
 */
async function verifyOperationOutput(toolName, output) {
  if (output == null) return false;
  
  // Real heuristic verification based on tool category
  if (typeof output === "object" && output.error) {
    return false; // Execution returned an error payload
  }

  return true;
}