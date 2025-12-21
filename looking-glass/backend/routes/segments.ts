// Segments endpoint

import type { Config } from "../config.ts";

export function handleSegments(_req: Request, config: Config): Response {
  const segments = config.endpoints.map((e) => ({
    name: e.name,
    url: e.url,
  }));

  return new Response(JSON.stringify(segments), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
