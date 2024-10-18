#!/bin/bash

PORT=${3:-22}

# Gather the public ssh host keys for the given host
# and for each key print the fingerprint in hex format using the given
# checksum command (e.g. md5sum, sha256sum, ...)

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 hostname checksum_command"
  exit 1
fi

ssh-keyscan -p $PORT $1  2>/dev/null | while read -r line; do
  echo "Scanned key:"
  echo $line
  echo "$2 fingerprint:"
  echo $line | awk '{print $3}' | base64 -d | $2 -b | awk '{print $1}' | sed 's/../&:/g' | sed 's/:$//'
  echo
done
