import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import type { KeaLease } from "../types/lease";
import { LEASE_STATES } from "../types/lease";

type SortField = "added" | "ip" | "mac" | "hostname" | "expires";
type SortDirection = "asc" | "desc";

interface LeaseTableProps {
  leases: KeaLease[];
  onIpClick?: (ip: string) => void;
  onHostnameClick?: (hostname: string) => void;
}

export function LeaseTable({ leases, onIpClick, onHostnameClick }: LeaseTableProps) {
  const [sortField, setSortField] = useState<SortField>("added");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const formatTimestamp = (cltt: number, validLft: number) => {
    const expiresAt = new Date((cltt + validLft) * 1000);
    const now = new Date();
    const isExpired = expiresAt < now;

    return {
      formatted: format(expiresAt, "yyyy-MM-dd HH:mm:ss"),
      isExpired,
    };
  };

  const formatAddedTime = (createdAt: number) => {
    const addedAt = new Date(createdAt * 1000);
    const now = new Date();
    const hoursSinceAdded = (now.getTime() - addedAt.getTime()) / (1000 * 60 * 60);

    return {
      formatted: format(addedAt, "yyyy-MM-dd HH:mm:ss"),
      relative: formatDistanceToNow(addedAt, { addSuffix: true }),
      isRecent: hoursSinceAdded < 24, // Recent if added within 24 hours
      isVeryRecent: hoursSinceAdded < 1, // Very recent if added within 1 hour
    };
  };

  const formatUpdatedTime = (updatedAt: number) => {
    const updated = new Date(updatedAt * 1000);
    return {
      formatted: format(updated, "yyyy-MM-dd HH:mm:ss"),
      relative: formatDistanceToNow(updated, { addSuffix: true }),
    };
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "added" ? "desc" : "asc");
    }
  };

  const sortedLeases = useMemo(() => {
    const sorted = [...leases].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortField) {
        case "added":
          aVal = a["created-at"] || a.cltt;
          bVal = b["created-at"] || b.cltt;
          break;
        case "ip":
          aVal = a["ip-address"];
          bVal = b["ip-address"];
          break;
        case "mac":
          aVal = a["hw-address"];
          bVal = b["hw-address"];
          break;
        case "hostname":
          aVal = a.hostname || "";
          bVal = b.hostname || "";
          break;
        case "expires":
          aVal = a.cltt + a["valid-lft"];
          bVal = b.cltt + b["valid-lft"];
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [leases, sortField, sortDirection]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="ml-1 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === "asc" ? (
      <svg className="ml-1 h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="ml-1 h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const exportToCSV = () => {
    const headers = ["Segment", "IP Address", "MAC Address", "Hostname", "Subnet ID", "Added", "Last Seen", "Expires", "State"];
    const rows = sortedLeases.map((lease) => {
      const { formatted: expiresFormatted } = formatTimestamp(lease.cltt, lease["valid-lft"]);
      const { formatted: addedFormatted } = formatAddedTime(lease["created-at"] || lease.cltt);
      const { formatted: updatedFormatted } = formatUpdatedTime(lease["updated-at"] || lease.cltt);
      return [
        lease.segment || "",
        lease["ip-address"],
        lease["hw-address"],
        lease.hostname || "",
        lease["subnet-id"].toString(),
        addedFormatted,
        updatedFormatted,
        expiresFormatted,
        LEASE_STATES[lease.state] || lease.state.toString(),
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kea-leases-${format(new Date(), "yyyy-MM-dd-HHmmss")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (sortedLeases.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg shadow">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No leases found</h3>
        <p className="mt-1 text-sm text-gray-500">No DHCP leases match your search criteria.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <h2 className="text-lg font-medium text-gray-900">
          {sortedLeases.length} Lease{sortedLeases.length !== 1 ? "s" : ""}
        </h2>
        <button
          onClick={exportToCSV}
          className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {sortedLeases.some((l) => l.segment) && (
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Segment
                </th>
              )}
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("ip")}
              >
                <div className="flex items-center">
                  IP Address
                  <SortIcon field="ip" />
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("mac")}
              >
                <div className="flex items-center">
                  MAC Address
                  <SortIcon field="mac" />
                </div>
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("hostname")}
              >
                <div className="flex items-center">
                  Hostname
                  <SortIcon field="hostname" />
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subnet
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("added")}
              >
                <div className="flex items-center">
                  First Seen
                  <SortIcon field="added" />
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Seen
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort("expires")}
              >
                <div className="flex items-center">
                  Expires
                  <SortIcon field="expires" />
                </div>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                State
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedLeases.map((lease, index) => {
              const { formatted: expiresFormatted, isExpired } = formatTimestamp(lease.cltt, lease["valid-lft"]);
              const { formatted: addedFormatted, relative: addedRelative, isRecent, isVeryRecent } = formatAddedTime(lease["created-at"] || lease.cltt);
              const { formatted: updatedFormatted, relative: updatedRelative } = formatUpdatedTime(lease["updated-at"] || lease.cltt);
              return (
                <tr key={`${lease["ip-address"]}-${index}`} className={`hover:bg-gray-50 ${
                  isVeryRecent ? "bg-blue-50" : isRecent ? "bg-green-50" : ""
                }`}>
                  {lease.segment && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {lease.segment}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {onIpClick ? (
                      <button
                        onClick={() => onIpClick(lease["ip-address"])}
                        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        {lease["ip-address"]}
                      </button>
                    ) : (
                      lease["ip-address"]
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                    {lease["hw-address"]}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {lease.hostname ? (
                      onHostnameClick ? (
                        <button
                          onClick={() => onHostnameClick(lease.hostname!)}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {lease.hostname}
                        </button>
                      ) : (
                        lease.hostname
                      )
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {lease["subnet-id"]}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <span className={isVeryRecent ? "text-blue-600 font-semibold" : isRecent ? "text-green-600 font-medium" : "text-gray-500"}>
                        {addedFormatted}
                      </span>
                      {isVeryRecent && (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {addedRelative}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {updatedFormatted}
                    <div className="text-xs text-gray-400 mt-1">
                      {updatedRelative}
                    </div>
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm ${isExpired ? "text-red-600" : "text-gray-500"}`}>
                    {expiresFormatted}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      lease.state === 0 ? "bg-green-100 text-green-800" :
                      lease.state === 1 ? "bg-red-100 text-red-800" :
                      "bg-gray-100 text-gray-800"
                    }`}>
                      {LEASE_STATES[lease.state] || lease.state}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
