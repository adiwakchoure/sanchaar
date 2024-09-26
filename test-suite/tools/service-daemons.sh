#!/bin/bash

# List of services to manage
services=(
    "cotunnel.service"
    "demuxer.service"
    "remoteit@117969f.service"
    "remoteit@1fc38d3.service"
    "schannel.service"
    "socketxp.service"
    "tailscaled.service"
    "tor@default.service"
)

# Function to manage services
manage_services() {
    local action=$1
    local service=$2

    if [ "$service" == "all" ]; then
        for svc in "${services[@]}"; do
            echo "${action^} $svc..."
            sudo systemctl $action --now $svc
            if [ $? -eq 0 ]; then
                echo "$svc ${action}d successfully."
            else
                echo "Failed to $action $svc."
            fi
        done
    else
        echo "${action^} $service..."
        sudo systemctl $action --now $service
        if [ $? -eq 0 ]; then
            echo "$service ${action}d successfully."
        else
            echo "Failed to $action $service."
        fi
    fi
}

# Check for correct usage
if [ $# -lt 2 ]; then
    echo "Usage: $0 <enable|disable> <all|service_name>"
    exit 1
fi

# Get action and service from arguments
action=$1
service=$2

# Validate action
if [[ "$action" != "enable" && "$action" != "disable" ]]; then
    echo "Invalid action: $action. Use 'enable' or 'disable'."
    exit 1
fi

# Validate service
if [[ "$service" != "all" && ! " ${services[@]} " =~ " ${service} " ]]; then
    echo "Invalid service: $service. Use 'all' or one of: ${services[*]}"
    exit 1
fi

# Manage services
manage_services $action $service