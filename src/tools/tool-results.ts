import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiError, ApiTransportError } from '../api/errors.js';

export class ToolInputError extends Error {
  constructor(
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export async function runTool(operation: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await operation();
    const content = isRecord(result) ? result : { data: result };
    return {
      content: [{ type: 'text', text: JSON.stringify(content) }],
      structuredContent: content,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      const details: Record<string, unknown> = {
        code: error.code,
        message: error.message,
        status: error.status,
      };
      if (error.details !== undefined) {
        details.details = error.details;
      }
      return errorResult(details);
    }
    if (error instanceof ApiTransportError) {
      return errorResult({ code: 'api_transport_error', message: error.message });
    }
    if (error instanceof ToolInputError) {
      const details: Record<string, unknown> = {
        code: 'validation_error',
        message: error.message,
      };
      if (error.details !== undefined) {
        details.details = error.details;
      }
      return errorResult(details);
    }

    throw error;
  }
}

function errorResult(error: Record<string, unknown>): CallToolResult {
  const structuredContent = { error };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
