/**
 * Custom error types for Adobe Premiere Pro MCP
 *
 * These errors provide better categorization and context for debugging
 * and error handling throughout the codebase.
 */

/**
 * Error codes for categorizing different failure types
 */
export enum PremiereErrorCode {
  // Bridge errors
  BRIDGE_NOT_INITIALIZED = 'BRIDGE_NOT_INITIALIZED',
  BRIDGE_INITIALIZATION_FAILED = 'BRIDGE_INITIALIZATION_FAILED',
  PREMIERE_NOT_FOUND = 'PREMIERE_NOT_FOUND',

  // Communication errors
  SCRIPT_EXECUTION_FAILED = 'SCRIPT_EXECUTION_FAILED',
  RESPONSE_TIMEOUT = 'RESPONSE_TIMEOUT',
  RESPONSE_PARSE_ERROR = 'RESPONSE_PARSE_ERROR',

  // Project errors
  NO_OPEN_PROJECT = 'NO_OPEN_PROJECT',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_OPERATION_FAILED = 'PROJECT_OPERATION_FAILED',

  // Sequence errors
  SEQUENCE_NOT_FOUND = 'SEQUENCE_NOT_FOUND',
  SEQUENCE_OPERATION_FAILED = 'SEQUENCE_OPERATION_FAILED',

  // Clip errors
  CLIP_NOT_FOUND = 'CLIP_NOT_FOUND',
  CLIP_OPERATION_FAILED = 'CLIP_OPERATION_FAILED',

  // Effect errors
  EFFECT_NOT_FOUND = 'EFFECT_NOT_FOUND',
  EFFECT_APPLICATION_FAILED = 'EFFECT_APPLICATION_FAILED',

  // Track errors
  TRACK_NOT_FOUND = 'TRACK_NOT_FOUND',

  // Tool errors
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  INVALID_TOOL_ARGUMENTS = 'INVALID_TOOL_ARGUMENTS',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',

  // File errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_OPERATION_FAILED = 'FILE_OPERATION_FAILED',

  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Base error class for Premiere Pro MCP errors
 */
export class PremiereError extends Error {
  public readonly code: PremiereErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly cause?: Error;

  constructor(
    code: PremiereErrorCode,
    message: string,
    options?: {
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'PremiereError';
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PremiereError);
    }
  }

  /**
   * Convert to a JSON-serializable object for error responses
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      // Don't include stack in production responses for security
    };
  }

  /**
   * Create a detailed string representation for logging
   */
  toDetailedString(): string {
    const parts = [`[${this.code}] ${this.message}`];
    if (this.context) {
      parts.push(`Context: ${JSON.stringify(this.context)}`);
    }
    if (this.cause) {
      parts.push(`Caused by: ${this.cause.message}`);
    }
    return parts.join('\n');
  }
}

/**
 * Error thrown when the bridge is not properly initialized
 */
export class BridgeNotInitializedError extends PremiereError {
  constructor(operation?: string) {
    super(
      PremiereErrorCode.BRIDGE_NOT_INITIALIZED,
      `Bridge not initialized${operation ? ` for operation: ${operation}` : ''}. Call initialize() first.`
    );
    this.name = 'BridgeNotInitializedError';
  }
}

/**
 * Error thrown when bridge initialization fails
 */
export class BridgeInitializationError extends PremiereError {
  constructor(reason: string, cause?: Error) {
    super(
      PremiereErrorCode.BRIDGE_INITIALIZATION_FAILED,
      `Failed to initialize Adobe Premiere Pro bridge: ${reason}`,
      { cause }
    );
    this.name = 'BridgeInitializationError';
  }
}

/**
 * Error thrown when Premiere Pro installation is not found
 */
export class PremiereNotFoundError extends PremiereError {
  constructor(searchedPaths?: string[]) {
    super(
      PremiereErrorCode.PREMIERE_NOT_FOUND,
      'Adobe Premiere Pro installation not found',
      { context: searchedPaths ? { searchedPaths } : undefined }
    );
    this.name = 'PremiereNotFoundError';
  }
}

/**
 * Error thrown when script execution fails
 */
export class ScriptExecutionError extends PremiereError {
  constructor(message: string, context?: Record<string, unknown>, cause?: Error) {
    super(
      PremiereErrorCode.SCRIPT_EXECUTION_FAILED,
      message,
      { context, cause }
    );
    this.name = 'ScriptExecutionError';
  }
}

/**
 * Error thrown when waiting for a response times out
 */
export class ResponseTimeoutError extends PremiereError {
  constructor(timeoutMs: number, operation?: string) {
    super(
      PremiereErrorCode.RESPONSE_TIMEOUT,
      `Response timeout after ${timeoutMs}ms${operation ? ` for operation: ${operation}` : ''}`,
      { context: { timeoutMs, operation } }
    );
    this.name = 'ResponseTimeoutError';
  }
}

/**
 * Error thrown when response parsing fails
 */
export class ResponseParseError extends PremiereError {
  constructor(reason: string, cause?: Error) {
    super(
      PremiereErrorCode.RESPONSE_PARSE_ERROR,
      `Failed to parse response: ${reason}`,
      { cause }
    );
    this.name = 'ResponseParseError';
  }
}

/**
 * Error thrown when a tool is not found
 */
export class ToolNotFoundError extends PremiereError {
  constructor(toolName: string, availableTools?: string[]) {
    super(
      PremiereErrorCode.TOOL_NOT_FOUND,
      `Tool '${toolName}' not found`,
      { context: availableTools ? { availableTools } : undefined }
    );
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Error thrown when tool arguments are invalid
 */
export class InvalidToolArgumentsError extends PremiereError {
  constructor(toolName: string, validationError: string) {
    super(
      PremiereErrorCode.INVALID_TOOL_ARGUMENTS,
      `Invalid arguments for tool '${toolName}': ${validationError}`,
      { context: { toolName } }
    );
    this.name = 'InvalidToolArgumentsError';
  }
}

/**
 * Helper to safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Helper to wrap an unknown error in a PremiereError
 */
export function wrapError(
  code: PremiereErrorCode,
  message: string,
  error: unknown,
  context?: Record<string, unknown>
): PremiereError {
  const cause = error instanceof Error ? error : new Error(String(error));
  return new PremiereError(code, message, { context, cause });
}
