#!/bin/bash

# Params
# {1} VM Name - no spaces
# {2} New disk or size of exisitng disk in GB; set to empty to not add additional disk or set in-place resize for in place resizing
# {3} Disk name - must be provided if a new disk is to be added, attached or detached


NAME="{1}"
ADDITIONAL_DISK={2}
DISK_NAME="{3}"

function exitFailed() {
    echo "Error: $1"
    echo "Failed"
    exit 1
}

function testDiskNameProvided() {
    if [ -z "$DISK_NAME" ]; then
        exitFailed "Disk name must be provided."
    fi
}

# Check for spaces in VM name
if [[ "$NAME" =~ [[:space:]] ]]; then 
    exitFailed "VM name '$NAME' can't have spaces."
fi

# Begin processing
echo "Adding disk for VM '$NAME'. Requested size: '$ADDITIONAL_DISK' GB"

# Attach existing disk (no resize or creation)
if [ -z "$ADDITIONAL_DISK" ]; then
    testDiskNameProvided

    # Get number of mapped drives
    NUM_OF_DRIVES_MAPPED=$(virsh dumpxml "$NAME" | grep -Pnzo "<disk(.|\n)*?/kloudust/disks(.|\n)*?</disk>" | \
        xargs --null | grep -oP "<target.*?dev='\K\w+'" | nl | tail -n1 | awk '{print $1}')
    if [ -z "$NUM_OF_DRIVES_MAPPED" ]; then
        exitFailed "Unable to find number of drives mapped."
    fi

    # Get drive prefix (e.g., vd, sd)
    DRIVE_START_LETTERS=$(virsh dumpxml "$NAME" | grep -Pnzo "<disk(.|\n)*?/kloudust/disks(.|\n)*?</disk>" | \
        xargs --null | grep -oP "<target.*?dev='\K\w+'" | nl | tail -n1 | awk '{print $2}' | cut -c1-2)
    if [ -z "$DRIVE_START_LETTERS" ]; then
        exitFailed "Unable to parse domain XML for drive letter patterns."
    fi

    # Calculate next drive name
    ALPHABET=({a..z})
    NEXT_DRIVE_LETTER="${ALPHABET[$NUM_OF_DRIVES_MAPPED]}"
    NEXT_DRIVE_NAME="${DRIVE_START_LETTERS}${NEXT_DRIVE_LETTER}"

    # Build disk file path
    DISK_FILE="/kloudust/disks/${NAME}_${DISK_NAME}.qcow2"

    # Attach the disk
    if ! virsh attach-disk "$NAME" "$DISK_FILE" "$NEXT_DRIVE_NAME" --persistent --config --subdriver qcow2; then 
        exitFailed "Attachment of the disk '$DISK_NAME' to '$NAME' failed."
    fi
else
    testDiskNameProvided

    # Build disk file path
    DISK_FILE="/kloudust/disks/${NAME}_${DISK_NAME}.qcow2"

    # Check if disk already exists
    if [ -f "$DISK_FILE" ]; then
        exitFailed "Disk file '$DISK_FILE' already exists."
    fi

    # Create new disk
    echo "Creating new disk at $DISK_FILE with size ${ADDITIONAL_DISK}G..."
    if ! qemu-img create -f qcow2 "$DISK_FILE" "${ADDITIONAL_DISK}G"; then
        exitFailed "Failed to create disk file."
    fi

    # Get number of mapped drives
    NUM_OF_DRIVES_MAPPED=$(virsh dumpxml "$NAME" | grep -Pnzo "<disk(.|\n)*?/kloudust/disks(.|\n)*?</disk>" | \
        xargs --null | grep -oP "<target.*?dev='\K\w+'" | nl | tail -n1 | awk '{print $1}')
    NUM_OF_DRIVES_MAPPED=${NUM_OF_DRIVES_MAPPED:-0}  # Default to 0 if no drives found

    # Get drive prefix
    DRIVE_START_LETTERS=$(virsh dumpxml "$NAME" | grep -oP "<target dev='\K\w\w(?=')")
    DRIVE_START_LETTERS=${DRIVE_START_LETTERS:-vd}  # Fallback to 'vd' if none found

    # Calculate next drive letter
    ALPHABET=({a..z})
    NEXT_DRIVE_LETTER="${ALPHABET[$NUM_OF_DRIVES_MAPPED]}"
    NEXT_DRIVE_NAME="${DRIVE_START_LETTERS}${NEXT_DRIVE_LETTER}"

    # Attach new disk
    echo "Attaching new disk $DISK_FILE as $NEXT_DRIVE_NAME to VM $NAME..."
    if ! virsh attach-disk "$NAME" "$DISK_FILE" "$NEXT_DRIVE_NAME" --persistent --config --subdriver qcow2; then 
        exitFailed "Failed to attach new disk to VM."
    fi
fi

echo -e "Disk operation for '$NAME' completed successfully."
exit 0