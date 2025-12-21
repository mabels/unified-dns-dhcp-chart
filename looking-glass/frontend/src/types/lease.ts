// TypeScript interfaces for Kea DHCP leases

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
  segment?: string;
  "created-at"?: number; // Unix timestamp when first seen
  "updated-at"?: number; // Unix timestamp when last renewed
}

export interface Segment {
  name: string;
  namespace: string;
  statefulset: string;
}

export interface LeasesResponse {
  leases: KeaLease[];
  errors?: Array<{ segment: string; error: string }>;
  timestamp: string;
}

export interface SegmentLeasesResponse {
  segment: string;
  leases: KeaLease[];
  timestamp: string;
  error?: string;
}

export const LEASE_STATES: Record<number, string> = {
  0: "Default",
  1: "Declined",
  2: "Expired-Reclaimed",
};
