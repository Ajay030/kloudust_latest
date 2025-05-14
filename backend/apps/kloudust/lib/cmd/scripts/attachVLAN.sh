#!/bin/sh

#########################################################################################################
# VLAN master script for Kloudust. Re-entry safe. 
# (C) 2024 Tekmonks. All rights reserved.
# LICENSE: See LICENSE file.
#########################################################################################################
# Init section - check params, and assigns defaults if missing
#########################################################################################################
VLAN_NAME=$1
VLAN_ID=$2
PEER_HOSTS=$3
ETH_DEV_NAME=$4
ETH_VLAN_IP=$5
DEFAULT_ETH=$6
VM_NAME=$7
BR_NAME="$1"_br
DEFAULT_BR_VLAN_ID=10                                                                 # Not really used
if [ "$#" -lt 4 ] ; then
    echo 'Usage: attachVLAN.sh VLAN_NAME   VLAN_ID   "Peer hosts as a list with spaces in a single quoted argument"'
    echo "                     NEW_ETH_DEVICE_NAME   [NEW_ETH_VLAN_IP=192.168.10.10]   [DEFAULT_VxLAN_ETH_DEVICE=auto]   [VM_NAME]"
    exit 1
fi
if [ -z "$DEFAULT_ETH" ] || [ "$DEFAULT_ETH" == "auto" ]; then                        # Assume default ethernet isthe local VTEP if not given
    DEFAULT_ETH=`ip route | grep default | grep -o 'dev.*' | cut -d" " -f2`
fi
if [ -z "$ETH_VLAN_IP" ]; then ETH_VLAN_IP=192.168.10.10; fi                          # Default IP to 192.168.10.10 if not provided


#########################################################################################################
# This section creates the VxLAN tunnel and VTEPs and the bridge for the VLAN
#########################################################################################################
if [ ! "`sudo ip link | grep "$VLAN_NAME":`" ]; then                                  # this creates the VxLAN to match VLAN name 
    sudo ip link add $VLAN_NAME type vxlan id $VLAN_ID dev $DEFAULT_ETH dstport 0 	
fi
if [ -n "$PEER_HOSTS" ]; then 
	for PEER_HOST in $PEER_HOSTS; do
        sudo bridge fdb append to 00:00:00:00:00:00 dst $PEER_HOST dev $VLAN_NAME     # VxLAN unicast to the VTEPs
    done 
fi

if [ ! "`sudo ip link | grep "$BR_NAME":`" ]; then                                    # creates the default VLAN cbridge if it doesn't exist
    sudo ip link add $BR_NAME type bridge vlan_filtering 1                            # Create a new bridge to connect all VLAN participants
    sudo ip link set $VLAN_NAME master $BR_NAME                                       # Adds the VxLAN VTEP to the bridge - L2 tunnel 
fi

sudo ip link set up dev $VLAN_NAME                                                    # Bring the VxLAN up
sudo ip link set up dev $BR_NAME                                                      # Bring the Bridge up


#########################################################################################################
# This section adds a new ethernet pair to the VLAN and attaches to the existing VM
#########################################################################################################
if [ ! "`sudo ip link | grep "$ETH_DEV_NAME"a:`" ]; then    
    sudo ip link add "$ETH_DEV_NAME"a type veth peer name "$ETH_DEV_NAME"b            # Create the new Ethernet pair a and b
    sudo ip link set "$ETH_DEV_NAME"b master $BR_NAME                                 # Connect the b-side to the bridge
    sudo bridge vlan add dev "$ETH_DEV_NAME"b vid $DEFAULT_BR_VLAN_ID                 # Tag VLAN ID for this Ethernet (not needed)
    sudo ip link set "$ETH_DEV_NAME"a up                                              # Bring up a-side
    sudo ip link set "$ETH_DEV_NAME"b up                                              # Bring up b-side
    sudo ip addr add "$ETH_VLAN_IP/24" dev "$ETH_DEV_NAME"a                           # Assign IP to the a-side
fi

if [ -n "$VM_NAME" ]; then                                                            # If VM name not provided then side-a is left dangling
    sudo virsh attach-interface --domain $VM_NAME \                                   # Add a-side of the new ethernet to the VM
        --type direct --source "$ETH_DEV_NAME"a --model virtio --config --live
fi