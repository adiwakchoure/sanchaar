# TODOS

- Tunnel Interface
- Web Rendering vs CURL for CSR and SSR
- Results visualiser tool for json parsing / Table View
- File Upload speed
- Filetypes w/ integrity checking - pdf, binaries (exe and more), jpeg, normal vs zip
- Make sure ot handle partial file downloads and subeuent fairlure flags etc
- Ping for the RP's digged static IP as well!

- ICMP as well as TCP traceroute
- pcaps offsite
- pcaps analysis for packet loss
- Nmap the URL
- Uptime Kuma


<!-- IN my network measurments testing script here, add a few things.

Let it be able to handle partial file downloads. I am referring to the curl fiel downlaods that happen N times every run! Basically even if here is an rerror you incldue that as an infrimation point in the results, what haooened how muh was downlaoded etc! THis could eman anythgin form having top level boolean flags o additional data points in th final report json! Because theres a hgih changce of being blocked or rate limited and i dont want that to interrup a run. At th every top level also have a flag for allsuccess that means everything went smoothly. 

DO ICMP as well as TCP traceroute

Remove the pcap librayr and its use! At the start of each run you start tcp dump and then at the end you end it andy ou save that alongisde the results (lets have a flag t keep pcaps on or off)

Ping to the static IP/s that you get after doing dig on the tunnel domain! Keep the results of that too.

For the web tests you will do curl vs web rendering of the /csr and /ssr route from the server and compare the timing. Make an interfae for this, forget about th exact implmentation for now (i willl use playwright)

We have N number of file downloads but lets also do filee uploads! I want to see uload speed as well

Lets do an nma of th edomain also! Add that as a CLI tool and do the whole shebag that was doen witht he rest of them (parsed and unparsed) -->