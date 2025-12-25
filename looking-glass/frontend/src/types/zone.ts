// TypeScript interfaces for DNS zones

export interface DnsRecord {
  name: string;
  type: string;
  ttl?: number;
  value: string;
}

export interface ZoneData {
  zone: string;
  records: DnsRecord[];
  error?: string;
}

export interface ZonesResponse {
  zones: ZoneData[];
  timestamp: string;
}

export interface ZoneResponse extends ZoneData {
  timestamp: string;
}
