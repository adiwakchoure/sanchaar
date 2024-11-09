#!/bin/bash

# Function to create a random file of a specified size
create_random_file() {
    local filename=$1
    local size_mb=$2
    dd if=/dev/urandom of="$filename" bs=1M count="$size_mb" iflag=fullblock
}

# Create files of specified sizes
create_random_file "random_1MB.bin" 1
create_random_file "random_5MB.bin" 5
create_random_file "random_25MB.bin" 25
dd if=/dev/urandom of="random_125MB.bin" bs=1000000 count=125 iflag=fullblock
