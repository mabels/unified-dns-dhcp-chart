#!/bin/bash
# Tail DHCP requests from Kea DHCP servers
# Usage: ./tail-dhcp-requests.sh [segment]
# Example: ./tail-dhcp-requests.sh 128

set -e

NAMESPACE="dns-dhcp"
SEGMENT="${1:-128}"  # Default to segment 128
POD_NAME="unified-dns-dhcp-${SEGMENT}-0"
CONTAINER="kea-dhcp4"

# Function to get hostname for IP address from lease database (CSV format)
get_hostname() {
    local ip="$1"

    local hostname=""

    if [ -n "$ip" ] && [ "$ip" != "unknown" ]; then
        # Lease file is CSV: address,hwaddr,client_id,valid_lifetime,expire,subnet_id,fqdn_fwd,fqdn_rev,hostname,state,user_context,pool_id
        # Hostname is field 9, we grep for lines with the IP and hostname (state=0 means active)
        hostname=$(kubectl exec "$POD_NAME" -n "$NAMESPACE" -c "$CONTAINER" -- sh -c \
            "grep '^$ip,' /var/lib/kea/dhcp4.leases 2>/dev/null | grep ',0,' | head -1 | cut -d',' -f9" 2>/dev/null || echo "")
    fi

    echo "$hostname"
}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}DHCP Request Monitor - Segment ${SEGMENT}${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

# Check if pod exists
if ! kubectl get pod "$POD_NAME" -n "$NAMESPACE" &>/dev/null; then
    echo -e "${RED}Error: Pod $POD_NAME not found in namespace $NAMESPACE${NC}"
    exit 1
fi

echo -e "${GREEN}Monitoring DHCP requests on segment ${SEGMENT}...${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Tail logs and parse DHCP events
kubectl logs -f "$POD_NAME" -n "$NAMESPACE" -c "$CONTAINER" 2>/dev/null | while read -r line; do
    timestamp=$(echo "$line" | awk '{print $1, $2}')

    # DHCPDISCOVER - Client looking for DHCP server
    if echo "$line" | grep -q "DHCP4_PACKET_RECEIVED.*DHCPDISCOVER"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        echo -e "${BLUE}[$timestamp]${NC} ${CYAN}DISCOVER${NC} from MAC: ${YELLOW}$mac${NC}"

    # DHCPOFFER - Server offering an IP
    elif echo "$line" | grep -q "DHCP4_LEASE_OFFER"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        ip=$(echo "$line" | sed -n 's/.*lease \([0-9.]*\) .*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        [ -z "$ip" ] && ip="unknown"
        hostname=$(get_hostname "$ip")
        if [ -n "$hostname" ]; then
            echo -e "${BLUE}[$timestamp]${NC} ${GREEN}OFFER${NC}    $ip to ${YELLOW}$mac${NC} (${CYAN}$hostname${NC})"
        else
            echo -e "${BLUE}[$timestamp]${NC} ${GREEN}OFFER${NC}    $ip to ${YELLOW}$mac${NC}"
        fi

    # DHCPREQUEST - Client requesting specific IP
    elif echo "$line" | grep -q "DHCP4_PACKET_RECEIVED.*DHCPREQUEST"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        echo -e "${BLUE}[$timestamp]${NC} ${MAGENTA}REQUEST${NC}  from MAC: ${YELLOW}$mac${NC}"

    # DHCPACK - Server acknowledging lease
    elif echo "$line" | grep -q "DHCP4_LEASE_ALLOC"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        ip=$(echo "$line" | sed -n 's/.*lease \([0-9.]*\) has.*/\1/p')
        duration=$(echo "$line" | sed -n 's/.*for \([0-9]*\) seconds.*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        [ -z "$ip" ] && ip="unknown"
        [ -z "$duration" ] && duration="unknown"
        hostname=$(get_hostname "$ip")
        if [ -n "$hostname" ]; then
            echo -e "${BLUE}[$timestamp]${NC} ${GREEN}ACK${NC}      $ip to ${YELLOW}$mac${NC} (${CYAN}$hostname${NC}) for ${duration}s"
        else
            echo -e "${BLUE}[$timestamp]${NC} ${GREEN}ACK${NC}      $ip to ${YELLOW}$mac${NC} for ${duration}s"
        fi

    # DHCP INIT-REBOOT - Client requesting existing lease
    elif echo "$line" | grep -q "DHCP4_INIT_REBOOT"; then
        ip=$(echo "$line" | sed -n 's/.*requests address \([0-9.]*\).*/\1/p')
        [ -z "$ip" ] && ip="unknown"
        echo -e "${BLUE}[$timestamp]${NC} ${CYAN}REBOOT${NC}   requesting $ip"

    # DHCPNAK - Server denying request
    elif echo "$line" | grep -q "DHCPNAK"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        echo -e "${BLUE}[$timestamp]${NC} ${RED}NAK${NC}      to ${YELLOW}$mac${NC}"

    # DHCPRELEASE - Client releasing IP
    elif echo "$line" | grep -q "DHCP4_RELEASE"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        ip=$(echo "$line" | sed -n 's/.*address \([0-9.]*\).*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        [ -z "$ip" ] && ip="unknown"
        echo -e "${BLUE}[$timestamp]${NC} ${YELLOW}RELEASE${NC}  $ip from ${YELLOW}$mac${NC}"

    # Lease renewals
    elif echo "$line" | grep -q "DHCP4_LEASE_RENEW"; then
        mac=$(echo "$line" | sed -n 's/.*\[hwtype=1 \([0-9a-fA-F:]*\)\].*/\1/p')
        ip=$(echo "$line" | sed -n 's/.*lease \([0-9.]*\).*/\1/p')
        [ -z "$mac" ] && mac="unknown"
        [ -z "$ip" ] && ip="unknown"
        echo -e "${BLUE}[$timestamp]${NC} ${CYAN}RENEW${NC}    $ip by ${YELLOW}$mac${NC}"

    # Errors
    elif echo "$line" | grep -q "ERROR"; then
        error_msg=$(echo "$line" | sed 's/^.*ERROR/ERROR/')
        echo -e "${BLUE}[$timestamp]${NC} ${RED}ERROR:${NC} $error_msg"
    fi
done
