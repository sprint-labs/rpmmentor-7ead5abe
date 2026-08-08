type Handler = (...args: unknown[]) => Response | Promise<Response>;

const disabledMcpHandler: Handler = async () =>
  new Response("Lovable MCP endpoints are disabled for this Vercel build.", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

export const auth = {
  oauth: {
    issuer: (config: unknown) => config,
  },
};

export function defineMcp(config: unknown) {
  return config;
}

export function defineTool(config: unknown) {
  return config;
}

export function createTanStackMcpHandler(): Handler {
  return disabledMcpHandler;
}

export function createTanStackOAuthProtectedResourceMetadataHandler(): Handler {
  return disabledMcpHandler;
}

export function createTanStackListToolsHandler(): Handler {
  return disabledMcpHandler;
}

export function createTanStackInvokeToolHandler(): Handler {
  return disabledMcpHandler;
}
