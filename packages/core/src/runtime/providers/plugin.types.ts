import { AgentContext } from "../pipeline/agent";

// type Success<T> = {
//   data: T;
//   error: null;
// };

// type Failure<E> = {
//   data: null;
//   error: E;
// };

// type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Result of a plugin execution
 */
export interface PluginResult {
  success: boolean;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

/**
 * Implementation of an executor for a plugin.
 */
export interface Executor {
  /**
   * Unique identifier for the executor.
   */
  name: string;

  /**
   * Human-readable description of what the executor does.
   */
  description: string;

  /**
   * Executes the plugin logic with the given agent context.
   *
   * @param {AgentContext} context - The execution context for the agent.
   * @returns {Promise<PluginResult>} A promise resolving to the result of execution.
   */
  fn: (context: AgentContext) => Promise<PluginResult> | PluginResult;

  /**
   * Executes the plugin logic with the given agent context.
   *
   * @template T The expected successful result type.
   * @template E The error type, defaults to `Error`.
   * @param {AgentContext} context - The execution context for the agent.
   * @returns {Promise<Result<T, E>>} A promise resolving to the result of execution.
   */
  // execute<T, E = Error>(context: AgentContext): Promise<Result<T, E>>;
}

/**
 * Implementation of a trigger for a plugin.
 * Listens for events and creates an event to trigger the MAIAR agent
 */
export interface Trigger {
  name: string;
  start: (context: AgentContext) => Promise<void> | void;
}
