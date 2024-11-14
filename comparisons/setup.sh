#!/bin/bash
set -e  # Exit on any error

echo "Creating test file..."
# Create a 10MB test file with specific content for verification
dd if=/dev/urandom of=test-file.dat bs=1M count=10
FILE_HASH=$(sha256sum test-file.dat | cut -d' ' -f1)
FILE_SIZE=$(stat -f%z test-file.dat 2>/dev/null || stat -c%s test-file.dat)
echo "Test file created: Size ${FILE_SIZE} bytes, Hash: ${FILE_HASH}"

echo "Creating nginx config..."
cat > nginx.conf <<EOF
events {
    worker_connections 1024;
}
http {
    server {
        listen 80;
        location /test-file {
            alias /usr/share/nginx/html/test-file.dat;
            add_header Content-Type application/octet-stream;
            add_header X-Server "nginx";
        }
        location /health {
            return 200 'OK';
            add_header Content-Type text/plain;
        }
    }
}
EOF

echo "Creating Apache config..."
cat > apache.conf <<EOF
<VirtualHost *:80>
    DocumentRoot /var/www/html
    <Directory /var/www/html>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>
    <Location "/test-file">
        Header set Content-Type "application/octet-stream"
        Header set X-Server "apache"
    </Location>
    <Location "/health">
        SetHandler server-status
    </Location>
</VirtualHost>
LoadModule headers_module modules/mod_headers.so
EOF

echo "Creating Caddy config..."
cat > Caddyfile <<EOF
:80 {
    root * /srv
    file_server
    header /test-file Content-Type "application/octet-stream"
    header /test-file X-Server "caddy"
    handle /health {
        respond "OK" 200
    }
}
EOF

echo "Creating docker-compose.yml..."
cat > docker-compose.yml <<EOF
version: '3'
services:
  nginx:
    image: nginx:latest
    ports:
      - "8081:80"
    volumes:
      - ./test-file.dat:/usr/share/nginx/html/test-file.dat:ro
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  apache:
    image: httpd:latest
    ports:
      - "8082:80"
    volumes:
      - ./test-file.dat:/var/www/html/test-file.dat:ro
      - ./apache.conf:/usr/local/apache2/conf/httpd.conf:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  caddy:
    image: caddy:latest
    ports:
      - "8083:80"
    volumes:
      - ./test-file.dat:/srv/test-file.dat:ro
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  express:
    build: .
    ports:
      - "8084:3000"
    volumes:
      - ./test-file.dat:/app/test-file.dat:ro
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
EOF

echo "Creating Dockerfile for Express..."
cat > Dockerfile <<EOF
FROM node:16
WORKDIR /app
COPY server.js package.json ./
RUN npm install
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
EOF

echo "Creating package.json..."
cat > package.json <<EOF
{
  "dependencies": {
    "express": "^4.17.1"
  }
}
EOF

echo "Starting containers..."
docker-compose down -v  # Clean up any existing containers
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 10

# Verify file serving
echo "Verifying file serving..."
for port in 8081 8082 8083 8084; do
    response_hash=$(curl -s http://localhost:$port/test-file | sha256sum | cut -d' ' -f1)
    if [ "$response_hash" = "$FILE_HASH" ]; then
        echo "Port $port: File verified ✓"
    else
        echo "Port $port: File verification failed ✗"
        echo "Expected: $FILE_HASH"
        echo "Got: $response_hash"
    fi
done

echo "Setup complete! All servers should be running."
