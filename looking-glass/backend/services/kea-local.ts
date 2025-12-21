// Kea DHCP API client using direct HTTP endpoints

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

export async function getLeasesDirect(
  url: string,
): Promise<KeaApiResult> {
  const keaCommand = {
    command: "lease4-get-all",
    service: ["dhcp4"],
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(keaCommand),
    });

    if (!response.ok) {
      return {
        success: false,
        leases: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data: KeaResponse[] = await response.json();

    if (!data || data.length === 0) {
      return {
        success: false,
        leases: [],
        error: "Empty response from Kea API",
      };
    }

    const firstResponse = data[0];

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
      error: error instanceof Error ? error.message : "Failed to connect to Kea API",
    };
  }
}
