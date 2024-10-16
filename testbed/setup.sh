sudo apt-install tcptraceroute

sudo apt-get install libpcap-dev

curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | \
  sudo gpg --dearmor -o /etc/apt/keyrings/ngrok.gpg && \
  echo "deb [signed-by=/etc/apt/keyrings/ngrok.gpg] https://ngrok-agent.s3.amazonaws.com buster main" | \
  sudo tee /etc/apt/sources.list.d/ngrok.list && \
sudo apt update && sudo apt install ngrok
ngrok config add-authtoken 2mMC3VPnQwGgg8TIn6PZ7uIb6TN_28RN6VaNDHGYrKfajwQVY

wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
./cloudflared-linux-amd64 tunnel login
./cloudflared-linux-amd64 tunnel run sanchaar

curl -O https://pagekite.net/pk/pagekite.py
chmod +x pagekite.py