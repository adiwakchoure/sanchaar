#!/bin/bash

# Start ngrok in the background
ngrok http 8080 > /dev/null &

# Wait a few seconds to allow ngrok to initialize
sleep 5

# Fetch the public URL from ngrok's local API
NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[0].public_url')

# Print the URL or use it in your script
echo "Ngrok public URL: $NGROK_URL"
