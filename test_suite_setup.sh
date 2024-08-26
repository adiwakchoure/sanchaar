#!/bin/bash
if ! dpkg -L nodejs &> /dev/null; then
    sudo apt install nodejs
fi

if ! command -v pnpm &> /dev/null; then
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    source /root/.bashrc
fi

# Define the base directory
BASE_DIR="test-suite"

# Create base directory
mkdir -p $BASE_DIR
cd $BASE_DIR

# 1. Set up Client Directory

# Create client directory structure
mkdir -p client/src client/test
cd client

# Initialize pnpm project
pnpm init    

# Install necessary client dependencies
pnpm install axios browsertime ws pino

# Create source files
touch src/index.js src/utils.js

# Back to base directory
cd ..

# 2. Set up Server Directory

# Create server directory structure
mkdir -p server/src server/static server/test
cd server

# Initialize pnpm project
pnpm init

# Install necessary server dependencies
pnpm install express ws morgan pino

# Create source files
touch src/index.js src/utils.js

# Create static files of specified sizes if they don't exist
# Placeholder for file generation logic
for size in 100KB 500KB 1MB 5MB 10MB 50MB 100MB
do
    if [ ! -f "static/file_$size" ]; then
        dd if=/dev/zero of=static/file_$size bs=$size count=1
    fi
done

# Back to base directory
cd ..

# 3. Set up Config Directory

# Create config directory and files
mkdir -p config
touch config/client-config.yaml config/server-config.yaml

# 4. Set up Results Directory

# Create results directory structure with placeholder JSON files
mkdir -p results/tool_name/date
touch results/tool_name/date/run_{1,2,3}.json

# 5. Set up Common Directory

# Create common directory structure
mkdir -p common/utils common/scripts

# 6. Additional Setup (if needed)


# Optional: Create a .gitignore file to exclude unnecessary files from version control
echo "**/node_modules/" > .gitignore
echo "**/pnpm-lock.yaml" >> .gitignore
echo "**/results/" >> .gitignore
echo "**/static" >> .gitignore

# 7. Final Output
echo "Test Suite setup completed successfully at $BASE_DIR"
