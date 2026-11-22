import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

export async function main(): Promise<void> {
  const server = createServer(loadConfig(process.env));
  await server.connect(new StdioServerTransport());
  process.stderr.write('ResuMe MCP server connected over STDIO.\n');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown startup error.';
    process.stderr.write(`ResuMe MCP server failed to start: ${message}\n`);
    process.exitCode = 1;
  });
}
