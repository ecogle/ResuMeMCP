import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ApiCall {
  url: string;
  init?: RequestInit;
}

export async function withMcpClient<T>(
  server: McpServer,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'resume-mcp-test-client', version: '1.0.0' });
  let serverConnected = false;
  let clientConnected = false;

  try {
    await server.connect(serverTransport);
    serverConnected = true;
    await client.connect(clientTransport);
    clientConnected = true;
    return await operation(client);
  } finally {
    try {
      if (clientConnected) {
        await client.close();
      }
    } finally {
      if (serverConnected) {
        await server.close();
      }
    }
  }
}

export function createApiFetch(responses: Array<Response | Error> = []): {
  fetchImpl: typeof fetch;
  calls: ApiCall[];
} {
  const calls: ApiCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    const response = responses.shift();
    if (response instanceof Error) {
      throw response;
    }
    if (response === undefined) {
      throw new Error('No mocked API response remains.');
    }

    return response;
  };

  return { fetchImpl, calls };
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
