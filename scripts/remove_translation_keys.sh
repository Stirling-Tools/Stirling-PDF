#!/bin/bash

# Check if a key was provided
if [ $# -eq 0 ]; then
    echo "Please provide a key to remove."
    exit 1
fi

key_to_remove="$1"

for file in ../src/main/resources/messages_*.properties; do
    # If the key ends with a dot, remove all keys starting with it
    if [[ "$key_to_remove" == *. ]]; then
        sed -i "/^${key_to_remove//./\\.}/d" "$file"
    else
        # Otherwise, remove only the exact key match
        sed -i "/^${key_to_remove//./\\.}=/d" "$file"
    fi
    echo "Updated $file"
done