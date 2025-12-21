// Kea DHCP API client using kubectl exec

import { kubectlExec } from "./kubernetes.ts";
import type { SegmentConfig } from "../config.ts";

export interface KeaLease {
  "ip-address": string;
  "hw-address": string;
  "hostname"?: string;
  "subnet-id": number;
  "valid-lft": number;
  "cltt": number;
  "state": number;
  "fqdn-fwd"?: boolean;
  "fqdn-rev"?: boolean;
  "client-id"?: string;
}

export interface KeaResponse {
  result: number;
  text: string;
  arguments?: {
    leases?: KeaLease[];
  };
}

export interface KeaApiResult {
  success: boolean;
  leases: KeaLease[];
  error?: string;
}

export async function getLeases(
  segment: SegmentConfig,
  context?: string,
): Promise<KeaApiResult> {
  // Build the Kea API command
  const keaCommand = JSON.stringify({
    command: "lease4-get-all",
    service: ["dhcp4"],
  });

  // Execute wget inside the pod to call Kea API
  const result = await kubectlExec({
    namespace: segment.namespace,
    pod: segment.pod,
    container: segment.container,
    command: [
      "wget",
      "-q",
      "-O",
      "-",
      `--post-data=${keaCommand}`,
      "--header=Content-Type: application/json",
      "http://127.0.0.1:8000/",
    ],
    context,
  });

  if (!result.success) {
    return {
      success: false,
      leases: [],
      error: result.stderr || "kubectl exec failed",
    };
  }

  try {
    const response: KeaResponse[] = JSON.parse(result.stdout);

    if (!response || response.length === 0) {
      return {
        success: false,
        leases: [],
        error: "Empty response from Kea API",
      };
    }

    const firstResponse = response[0];

    if (firstResponse.result !== 0) {
      return {
        success: false,
        leases: [],
        error: firstResponse.text || "Kea API error",
      };
    }

    const leases = firstResponse.arguments?.leases || [];

    return {
      success: true,
      leases,
    };
  } catch (error) {
    return {
      success: false,
      leases: [],
      error: error instanceof Error ? error.message : "Failed to parse Kea response",
    };
  }
}
