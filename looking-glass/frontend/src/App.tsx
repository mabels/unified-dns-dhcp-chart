import { useState, useEffect } from "react";
import { Layout } from "./components/Layout";
import { SegmentSelector } from "./components/SegmentSelector";
import { LeaseFilters } from "./components/LeaseFilters";
import { LeaseTable } from "./components/LeaseTable";
import { getAllLeases, getSegmentLeases, getSegments } from "./api/client";
import type { KeaLease, Segment } from "./types/lease";

function App() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<Segment | "all">("all");
  const [leases, setLeases] = useState<KeaLease[]>([]);
  const [filteredLeases, setFilteredLeases] = useState<KeaLease[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);

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

  // Load leases when segment changes
  useEffect(() => {
    loadLeases();
  }, [selectedSegment]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadLeases();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, selectedSegment]);

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

  return (
    <Layout>
      <div className="space-y-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Segment
              </label>
              <SegmentSelector
                segments={segments}
                selected={selectedSegment}
                onChange={setSelectedSegment}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Auto-refresh
              </label>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    autoRefresh ? "bg-blue-600" : "bg-gray-200"
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
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="block rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
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
                onClick={loadLeases}
                disabled={loading}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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

        <LeaseFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <LeaseTable leases={filteredLeases} />
      </div>
    </Layout>
  );
}

export default App;
