#!/bin/bash

# Params:
# {1} VM Name
# {2} SFTP Username
# {3} SFTP Host
# {4} SFTP Password
# {5} Remote destination directory
# {6} SFTP Port 

VM_NAME="{1}"
SFTP_USER="{2}"
SFTP_HOST="{3}"
SFTP_PASS="{4}"
DEST_DIR="{5}"
SFTP_PORT="{6}"

function exitFailed() {
    echo Error: $1
    echo Failed
    exit 1
}

if [ -z "$VM_NAME" ] || [ -z "$SFTP_USER" ] || [ -z "$SFTP_PASS" ] || [ -z "$SFTP_HOST" ] || [ -z "$DEST_DIR" ] || [ -z "$SFTP_PORT"]; then
    echo "Usage: $0 <vm-name> <sftp-user> <sftp-password> <sftp-host> <remote-dir> <sftp-port>"
    exit 1
fi

DISK_PATH=$(virsh domblklist "$VM_NAME" --details | awk '/disk/ {print $4}' | head -n 1)
echo "Disk path for VM '$VM_NAME': $DISK_PATH"

if [ -z "$DISK_PATH" ]; then
    exitFailed "Error: Unable to locate disk path for VM '$VM_NAME'."
fi

if [ ! -f "$DISK_PATH" ]; then
    exitFailed "Error: Disk file not found at '$DISK_PATH'."
fi

echo "Streaming VM XML definition..."
virsh dumpxml "$VM_NAME" | sshpass -p "$SFTP_PASS" ssh -o StrictHostKeyChecking=no -p "$SFTP_PORT" "$SFTP_USER@$SFTP_HOST" \
    "mkdir -p '$DEST_DIR/$VM_NAME' && cat > '$DEST_DIR/$VM_NAME/$VM_NAME.xml'" || exitFailed "Failed to stream VM XML to remote host."

echo "Transferring disk: $DISK_PATH"
sshpass -p "$SFTP_PASS" scp -P "$SFTP_PORT" -o StrictHostKeyChecking=no "$DISK_PATH" "$SFTP_USER@$SFTP_HOST:$DEST_DIR/$VM_NAME/" \
    || exitFailed "Failed to transfer disk file to remote host."

echo "VM '$VM_NAME' export completed successfully to '$SFTP_HOST:$DEST_DIR/$VM_NAME'"
