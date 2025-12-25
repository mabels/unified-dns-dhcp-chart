// TypeScript interfaces for DNS zones

export interface DnsRecord {
  name: string;
  type: string;
  ttl?: number;
  value: string;
  forwardIp?: string;  // Forward IP for PTR records
  fqdn?: string;       // FQDN for PTR records
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
