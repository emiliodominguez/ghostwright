import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './index';

const server = buildServer();
await server.connect(new StdioServerTransport());
