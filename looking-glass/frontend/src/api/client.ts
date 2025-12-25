// API client for backend

import type { LeasesResponse, SegmentLeasesResponse, Segment } from "../types/lease";
import type { ZonesResponse, ZoneResponse } from "../types/zone";

const API_BASE = "/api";

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export async function getSegments(): Promise<Segment[]> {
  return fetchApi<Segment[]>("/segments");
}

export async function getAllLeases(): Promise<LeasesResponse> {
  return fetchApi<LeasesResponse>("/leases");
}

export async function getSegmentLeases(segment: string): Promise<SegmentLeasesResponse> {
  return fetchApi<SegmentLeasesResponse>(`/leases/${segment}`);
}

export async function getAllZones(): Promise<ZonesResponse> {
  return fetchApi<ZonesResponse>("/zones");
}

export async function getZone(zoneName: string): Promise<ZoneResponse> {
  return fetchApi<ZoneResponse>(`/zones/${zoneName}`);
}
