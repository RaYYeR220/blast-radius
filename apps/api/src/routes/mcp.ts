import { createBlastMcp } from '@blast/server';
import { deps, offline } from '../http';

let handler: ((req: Request) => Promise<Response>) | null = null;

/** The remote MCP endpoint (Streamable HTTP). */
export default async function mcp(req: Request): Promise<Response> {
  const d = deps();
  if (!d) return offline();
  handler ??= createBlastMcp(d);
  return handler(req);
}
