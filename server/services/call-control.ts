/**
 * Call Control Service
 * 
 * Manages an in-memory command queue for remote call control operations.
 * Commands are enqueued by the admin UI (via tRPC) and delivered to PBX agents
 * via the heartbeat response. The PBX agent executes them locally via AMI.
 * 
 * Supported commands:
 * - hangup: Terminate an active call
 * - transfer: Redirect an active call to another extension
 * - park: Park an active call in a parking lot slot
 */

export interface CallControlCommand {
  id: string;
  type: "hangup" | "transfer" | "park";
  /** The call queue item ID */
  queueId: number;
  /** The SIP channel to act on (from active_calls) */
  channel?: string;
  /** Phone number of the call (for display/matching) */
  phoneNumber?: string;
  /** Target extension for transfer */
  transferExtension?: string;
  /** Park lot number for park */
  parkSlot?: string;
  /** Which PBX agent should execute this (agentId) */
  targetAgentId?: string;
  /** When the command was created */
  createdAt: number;
  /** Status tracking */
  status: "pending" | "delivered" | "executed" | "failed";
  /** Result message from PBX agent */
  resultMessage?: string;
  /** Who issued the command */
  issuedBy?: string;
}

// In-memory command queue (keyed by agentId for fast lookup)
const pendingCommands = new Map<string, CallControlCommand[]>();

// Command history (last 100 commands for audit trail)
const commandHistory: CallControlCommand[] = [];
const MAX_HISTORY = 100;

// Command expiry: commands older than 30 seconds are discarded
const COMMAND_TTL_MS = 30000;

let commandCounter = 0;

function generateCommandId(): string {
  return `cmd-${++commandCounter}-${Date.now()}`;
}

/**
 * Enqueue a command for a specific PBX agent.
 * If no targetAgentId is specified, the command is broadcast to all agents.
 */
export function enqueueCommand(cmd: Omit<CallControlCommand, "id" | "createdAt" | "status">): CallControlCommand {
  const command: CallControlCommand = {
    ...cmd,
    id: generateCommandId(),
    createdAt: Date.now(),
    status: "pending",
  };

  const agentId = cmd.targetAgentId || "__broadcast__";
  if (!pendingCommands.has(agentId)) {
    pendingCommands.set(agentId, []);
  }
  pendingCommands.get(agentId)!.push(command);

  // Also add to history
  commandHistory.push(command);
  if (commandHistory.length > MAX_HISTORY) {
    commandHistory.shift();
  }

  console.log(`[CallControl] Enqueued ${command.type} command ${command.id} for agent ${agentId} (queue item ${command.queueId})`);
  return command;
}

/**
 * Get and drain pending commands for a specific PBX agent.
 * Called from the heartbeat response handler.
 * Returns commands targeted at this agent + any broadcast commands.
 */
export function drainCommandsForAgent(agentId: string): CallControlCommand[] {
  const now = Date.now();
  const commands: CallControlCommand[] = [];

  // Get agent-specific commands
  const agentCmds = pendingCommands.get(agentId) || [];
  const broadcastCmds = pendingCommands.get("__broadcast__") || [];

  // Filter out expired commands and collect valid ones
  for (const cmd of [...agentCmds, ...broadcastCmds]) {
    if (now - cmd.createdAt > COMMAND_TTL_MS) {
      cmd.status = "failed";
      cmd.resultMessage = "Command expired (TTL exceeded)";
      continue;
    }
    cmd.status = "delivered";
    commands.push(cmd);
  }

  // Clear the queues
  pendingCommands.delete(agentId);
  pendingCommands.delete("__broadcast__");

  return commands;
}

/**
 * Report command execution result from PBX agent.
 */
export function reportCommandResult(commandId: string, success: boolean, message?: string): void {
  const cmd = commandHistory.find(c => c.id === commandId);
  if (cmd) {
    cmd.status = success ? "executed" : "failed";
    cmd.resultMessage = message || (success ? "OK" : "Failed");
    console.log(`[CallControl] Command ${commandId} ${cmd.status}: ${cmd.resultMessage}`);
  }
}

/**
 * Get recent command history for the admin UI.
 */
export function getCommandHistory(limit = 50): CallControlCommand[] {
  return commandHistory.slice(-limit).reverse();
}

/**
 * Get pending command count per agent (for UI display).
 */
export function getPendingCommandCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  pendingCommands.forEach((cmds, agentId) => {
    counts[agentId] = cmds.filter((c: CallControlCommand) => c.status === "pending").length;
  });
  return counts;
}
