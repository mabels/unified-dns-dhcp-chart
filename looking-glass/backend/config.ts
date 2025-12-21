// Configuration for the Looking Glass backend

export interface EndpointConfig {
  name: string;
  url: string;
}

export interface Config {
  port: number;
  endpoints: EndpointConfig[];
}

// Load configuration from environment variables
export function loadConfig(): Config {
  const port = parseInt(Deno.env.get("PORT") || "3000", 10);

  // Parse endpoints from environment variable (JSON array)
  // Format: ENDPOINTS='[{"name":"128","url":"http://localhost:8000"},{"name":"129","url":"http://localhost:8001"}]'
  const endpointsEnv = Deno.env.get("ENDPOINTS");

  let endpoints: EndpointConfig[] = [];

  if (endpointsEnv) {
    try {
      const parsed = JSON.parse(endpointsEnv);
      endpoints = parsed.map((e: any) => ({
        name: e.name,
        url: e.url,
      }));
    } catch (error) {
      console.error("Failed to parse ENDPOINTS environment variable:", error);
    }
  }

  // Default endpoint if not configured (single localhost)
  if (endpoints.length === 0) {
    endpoints = [
      {
        name: "default",
        url: "http://127.0.0.1:8000",
      },
    ];
  }

  return {
    port,
    endpoints,
  };
}
