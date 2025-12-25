import { useState, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Layout } from "./components/Layout";
import { SegmentSelector } from "./components/SegmentSelector";
import { ZoneSelector } from "./components/ZoneSelector";
import { LeaseFilters } from "./components/LeaseFilters";
import { LeaseTable } from "./components/LeaseTable";
import { ZoneTable } from "./components/ZoneTable";
import { getAllLeases, getSegmentLeases, getSegments, getAllZones } from "./api/client";
import type { KeaLease, Segment } from "./types/lease";
import type { ZoneData, DnsRecord } from "./types/zone";
import { IPAddress } from "ipaddress";

// Helper function to convert IP address to reverse DNS format
function ipToReverseDNS(ip: string): string | null {
  try {
    const addr = IPAddress.parse(ip);
    return addr.dns_reverse();
  } catch (e) {
    return null;
  }
}

function App() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const searchParams = routerState.location.search as any;

  const viewMode = currentPath === '/zones' ? 'zones' : 'leases';
  const searchTerm = searchParams?.search || '';
  const zoneSearchTerm = searchParams?.search || '';
  const autoRefresh = searchParams?.autoRefresh || false;
  const refreshInterval = searchParams?.interval || 30;

  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | "all">("all");
  const [leases, setLeases] = useState<KeaLease[]>([]);
  const [filteredLeases, setFilteredLeases] = useState<KeaLease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Zones state
  const [zones, setZones] = useState<ZoneData[]>([]);
  const [selectedZone, setSelectedZone] = useState<ZoneData | "all">("all");
  const [filteredRecords, setFilteredRecords] = useState<DnsRecord[]>([]);

  // Load segments on mount
  useEffect(() => {
    getSegments()
      .then(setSegments)
      .catch((err) => console.error("Failed to load segments:", err));
  }, []);

  // Load leases
  const loadLeases = async () => {
    setLoading(true);
    setError(null);

    try {
      if (selectedSegment === "all") {
        const response = await getAllLeases();
        setLeases(response.leases);
        if (response.errors && response.errors.length > 0) {
          console.warn("Some segments failed:", response.errors);
        }
      } else {
        const response = await getSegmentLeases(selectedSegment.name);
        setLeases(response.leases);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leases");
    } finally {
      setLoading(false);
    }
  };

  // Load zones
  const loadZones = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await getAllZones();
      setZones(response.zones);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load zones");
    } finally {
      setLoading(false);
    }
  };

  // Load data when mode or selection changes
  useEffect(() => {
    if (viewMode === "leases") {
      loadLeases();
    } else {
      loadZones();
    }
  }, [selectedSegment, viewMode]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (viewMode === "leases") {
        loadLeases();
      } else {
        loadZones();
      }
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedSegment, viewMode]);

  // Filter leases based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredLeases(leases);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = leases.filter(
      (lease) =>
        lease["ip-address"].toLowerCase().includes(term) ||
        lease["hw-address"].toLowerCase().includes(term) ||
        (lease.hostname && lease.hostname.toLowerCase().includes(term))
    );
    setFilteredLeases(filtered);
  }, [leases, searchTerm]);

  // Filter zone records based on search term
  useEffect(() => {
    if (selectedZone === "all") {
      const allRecords = zones.flatMap(z => z.records.map(r => ({ ...r, zone: z.zone })));
      if (!zoneSearchTerm.trim()) {
        setFilteredRecords(allRecords);
        return;
      }
      const term = zoneSearchTerm.toLowerCase();
      // Try to convert search term to reverse DNS if it's an IP address
      const reverseDNS = ipToReverseDNS(zoneSearchTerm);
      const filtered = allRecords.filter(
        (record) =>
          record.name.toLowerCase().includes(term) ||
          record.type.toLowerCase().includes(term) ||
          record.value.toLowerCase().includes(term) ||
          (record.forwardIp && record.forwardIp.toLowerCase().includes(term)) ||
          (record.fqdn && record.fqdn.toLowerCase().includes(term)) ||
          (reverseDNS && record.name.toLowerCase().includes(reverseDNS.toLowerCase()))
      );
      setFilteredRecords(filtered);
    } else {
      if (!zoneSearchTerm.trim()) {
        setFilteredRecords(selectedZone.records);
        return;
      }
      const term = zoneSearchTerm.toLowerCase();
      // Try to convert search term to reverse DNS if it's an IP address
      const reverseDNS = ipToReverseDNS(zoneSearchTerm);
      const filtered = selectedZone.records.filter(
        (record) =>
          record.name.toLowerCase().includes(term) ||
          record.type.toLowerCase().includes(term) ||
          record.value.toLowerCase().includes(term) ||
          (record.forwardIp && record.forwardIp.toLowerCase().includes(term)) ||
          (record.fqdn && record.fqdn.toLowerCase().includes(term)) ||
          (reverseDNS && record.name.toLowerCase().includes(reverseDNS.toLowerCase()))
      );
      setFilteredRecords(filtered);
    }
  }, [zones, selectedZone, zoneSearchTerm]);

  function handleRecordClick(record: DnsRecord) {
    // If clicking on an IP, switch to leases view and filter by that IP
    if (record.type === "A" || record.type === "AAAA") {
      navigate({
        to: '/',
        search: {
          search: record.value,
          segment: 'all',
          autoRefresh: autoRefresh,
          interval: refreshInterval
        }
      });
    }
  }

  function handleLeaseIpClick(ip: string) {
    // Switch to zones view and search for this IP
    navigate({
      to: '/zones',
      search: {
        search: ip,
        zone: 'all',
        autoRefresh: autoRefresh,
        interval: refreshInterval
      }
    });
  }

  function handleLeaseHostnameClick(hostname: string) {
    // Switch to zones view and search for this hostname
    navigate({
      to: '/zones',
      search: {
        search: hostname,
        zone: 'all',
        autoRefresh: autoRefresh,
        interval: refreshInterval
      }
    });
  }

  function handleRefresh() {
    if (viewMode === "leases") {
      loadLeases();
    } else {
      loadZones();
    }
  }

  function handleSearchChange(search: string) {
    const currentSearch = { ...searchParams };
    if (search) {
      currentSearch.search = search;
    } else {
      delete currentSearch.search;
    }
    navigate({ search: currentSearch });
  }

  function handleAutoRefreshToggle() {
    const currentSearch = { ...searchParams };
    if (!autoRefresh) {
      currentSearch.autoRefresh = 'true';
      currentSearch.interval = String(refreshInterval);
    } else {
      delete currentSearch.autoRefresh;
      delete currentSearch.interval;
    }
    navigate({ search: currentSearch });
  }

  function handleIntervalChange(interval: number) {
    navigate({ search: { ...searchParams, interval: String(interval) } });
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8 px-4" aria-label="Tabs">
              <button
                onClick={() => navigate({
                  to: '/',
                  search: {
                    search: searchTerm,
                    segment: 'all',
                    autoRefresh: autoRefresh,
                    interval: refreshInterval
                  }
                })}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  viewMode === "leases"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                DHCP Leases
              </button>
              <button
                onClick={() => navigate({
                  to: '/zones',
                  search: {
                    search: zoneSearchTerm,
                    zone: 'all',
                    autoRefresh: autoRefresh,
                    interval: refreshInterval
                  }
                })}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  viewMode === "zones"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                DNS Zones
              </button>
            </nav>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {viewMode === "leases" ? "Segment" : "Zone"}
              </label>
              {viewMode === "leases" ? (
                <SegmentSelector
                  segments={segments}
                  selected={selectedSegment}
                  onChange={setSelectedSegment}
                />
              ) : (
                <ZoneSelector
                  zones={zones}
                  selected={selectedZone}
                  onChange={setSelectedZone}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Auto-refresh
              </label>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleAutoRefreshToggle}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoRefresh ? "bg-blue-600 dark:bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      autoRefresh ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                {autoRefresh && (
                  <select
                    value={refreshInterval}
                    onChange={(e) => handleIntervalChange(Number(e.target.value))}
                    className="block rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value={10}>10s</option>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Search/Filters */}
        {viewMode === "leases" ? (
          <div className="flex gap-2">
            <div className="flex-1">
              <LeaseFilters searchTerm={searchTerm} onSearchChange={handleSearchChange} />
            </div>
            {searchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <input
                type="text"
                placeholder="Search zones by name, type, or value..."
                value={zoneSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:placeholder-gray-400 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {zoneSearchTerm && (
              <button
                onClick={() => handleSearchChange("")}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2 self-center"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Content */}
        {viewMode === "leases" ? (
          <LeaseTable
            leases={filteredLeases}
            onIpClick={handleLeaseIpClick}
            onHostnameClick={handleLeaseHostnameClick}
          />
        ) : selectedZone === "all" ? (
          zones.map((zone) => {
            const reverseDNS = ipToReverseDNS(zoneSearchTerm);
            return (
            <ZoneTable
              key={zone.zone}
              records={zone.records.filter(r => {
                if (!zoneSearchTerm.trim()) return true;
                const term = zoneSearchTerm.toLowerCase();
                return (
                  r.name.toLowerCase().includes(term) ||
                  r.type.toLowerCase().includes(term) ||
                  r.value.toLowerCase().includes(term) ||
                  (r.forwardIp && r.forwardIp.toLowerCase().includes(term)) ||
                  (r.fqdn && r.fqdn.toLowerCase().includes(term)) ||
                  (reverseDNS && r.name.toLowerCase().includes(reverseDNS.toLowerCase()))
                );
              })}
              zoneName={zone.zone}
              onRecordClick={handleRecordClick}
            />
          );
          })
        ) : (
          <ZoneTable
            records={filteredRecords}
            zoneName={selectedZone.zone}
            onRecordClick={handleRecordClick}
          />
        )}
      </div>
    </Layout>
  );
}

export default App;
