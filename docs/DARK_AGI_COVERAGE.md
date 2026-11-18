# DARK AGI operation coverage

Generated 2026-11-18T14:36:13.745Z from `GET /operations` — 147 operations, 71 available on this host.

`available` = the tool is installed on the DARK AGI host. An unavailable operation cannot run no matter what the console does; the reason is shown.

## cryptographic-audit (19)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `age-inspect:inspect` | local | no | no — age-inspect is not found | ติดตั้ง tool ก่อน |
| `cfssl:cert-inspect` | local | no | no — cfssl is not found | ติดตั้ง tool ก่อน |
| `gnupg:key-inspection` | local | no | no — gnupg is not found | ติดตั้ง tool ก่อน |
| `gnupg:keyring-list` | local | no | no — gnupg is not found | ติดตั้ง tool ก่อน |
| `gnupg:verify-signature` | local | no | no — gnupg is not found | ติดตั้ง tool ก่อน |
| `hashcat:test-hash-audit` | local | yes | no — hashcat is not found | ติดตั้ง tool ก่อน |
| `john:test-hash-audit` | local | yes | no — john is not found | ติดตั้ง tool ก่อน |
| `mkcert:local-ca` | local | no | no — mkcert is not found | ติดตั้ง tool ก่อน |
| `openssl:certificate-inspection` | local | no | yes | Terminal / รันทันที |
| `openssl:tls-handshake` | network | no | yes | Terminal / รันทันที |
| `powershell:certificate-inspector` | local | no | yes | Terminal / รันทันที |
| `powershell:certificate-inspector-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:certificate-store-inspector` | local | no | yes | Terminal / รันทันที |
| `powershell:certificate-store-inspector-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:tls-inspection` | network | no | yes | Terminal / รันทันที |
| `sslyze:tls-assessment` | network | no | no — sslyze is not found | ติดตั้ง tool ก่อน |
| `step-cli:cert-inspect` | local | no | no — step-cli is not found | ติดตั้ง tool ก่อน |
| `step-cli:remote-cert-inspect` | network | no | no — step-cli is not found | ติดตั้ง tool ก่อน |
| `tlsx:tls-scan` | network | no | no — tlsx is not found | ติดตั้ง tool ก่อน |

## digital-forensics (18)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `bulk-extractor:feature-scan` | local | no | no — bulk-extractor is not found | ติดตั้ง tool ก่อน |
| `chainsaw:hunt` | local | no | no — chainsaw is not found | ติดตั้ง tool ก่อน |
| `eric-zimmerman-tools:mft-parse` | local | no | no — eric-zimmerman-tools is not found | ติดตั้ง tool ก่อน |
| `eric-zimmerman-tools:prefetch-parse` | local | no | no — eric-zimmerman-tools is not found | ติดตั้ง tool ก่อน |
| `exiftool:metadata` | local | no | no — exiftool is not found | ติดตั้ง tool ก่อน |
| `hindsight:browser-history` | local | no | no — hindsight is not found | ติดตั้ง tool ก่อน |
| `networkminer-cli:pcap-analysis` | local | no | no — networkminer-cli is not found | ติดตั้ง tool ก่อน |
| `powershell:file-hash` | local | no | yes | Terminal / รันทันที |
| `powershell:file-hash-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:file-metadata` | local | no | yes | Terminal / รันทันที |
| `powershell:file-metadata-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `regripper:registry-parse` | local | no | no — regripper is not found | ติดตั้ง tool ก่อน |
| `sleuthkit-mmls:partition-layout` | local | no | no — sleuthkit-mmls is not found | ติดตั้ง tool ก่อน |
| `sleuthkit:file-listing` | local | no | no — sleuthkit is not found | ติดตั้ง tool ก่อน |
| `testdisk:partition-analysis` | local | no | no — testdisk is not found | ติดตั้ง tool ก่อน |
| `velociraptor:collect` | local | no | no — velociraptor is not found | ติดตั้ง tool ก่อน |
| `volatility3:network-scan` | local | no | no — volatility3 is not found | ติดตั้ง tool ก่อน |
| `volatility3:process-list` | local | no | no — volatility3 is not found | ติดตั้ง tool ก่อน |

## external-intelligence (14)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `earth-imagery:daily-view` | local | no | yes | Terminal / รันทันที |
| `earth-imagery:high-res-view` | local | no | yes | Terminal / รันทันที |
| `iss-tracker:live-position` | local | no | yes | Terminal / รันทันที |
| `iss-tracker:live-video-feed` | local | no | yes | Terminal / รันทันที |
| `ligo-gwosc:recent-detections` | local | no | yes | Terminal / รันทันที |
| `misp:attribute-search` | local | no | yes | Terminal (ต้องตั้ง credential — ยังไม่มี UI) |
| `nasa-dsn:live-status` | local | no | yes | Terminal / รันทันที |
| `nasa-epic:latest-earth-image` | local | no | yes | Terminal / รันทันที |
| `nasa-image-library:random-deep-space-image` | local | no | yes | Terminal / รันทันที |
| `nasa-neows:close-approaches-today` | local | no | yes | Terminal (ต้องตั้ง credential — ยังไม่มี UI) |
| `spacex:starlink-elements` | local | no | yes | Terminal / รันทันที |
| `spacex:starship-launches` | local | no | yes | Terminal / รันทันที |
| `threat-feed:active-c2-servers` | local | no | yes | Terminal / รันทันที |
| `virustotal-api:indicator-lookup` | local | no | yes | Terminal (ต้องตั้ง credential — ยังไม่มี UI) |

## malware-analysis (13)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `capa:capabilities` | local | no | no — capa is not found | ติดตั้ง tool ก่อน |
| `clamav:scan` | local | no | no — clamav is not found | ติดตั้ง tool ก่อน |
| `detect-it-easy:identify` | local | no | no — detect-it-easy is not found | ติดตั้ง tool ก่อน |
| `floss:strings` | local | no | no — floss is not found | ติดตั้ง tool ก่อน |
| `pev:pe-info` | local | no | no — pev is not windows native | ติดตั้ง tool ก่อน |
| `radare2:analyze` | local | no | no — radare2 is not found | ติดตั้ง tool ก่อน |
| `radare2:process-attach` | local | yes | no — radare2 is not found | ติดตั้ง tool ก่อน |
| `retdec:decompile` | local | no | no — retdec is not found | ติดตั้ง tool ก่อน |
| `rizin:analyze` | local | no | no — rizin is not found | ติดตั้ง tool ก่อน |
| `rizin:process-attach` | local | yes | no — rizin is not found | ติดตั้ง tool ก่อน |
| `upx:unpack` | local | no | no — upx is not found | ติดตั้ง tool ก่อน |
| `yara:process-scan` | local | yes | no — yara is not found | ติดตั้ง tool ก่อน |
| `yara:scan` | local | no | no — yara is not found | ติดตั้ง tool ก่อน |

## network-intelligence (23)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `dnsx:dns-resolve` | network | no | no — dnsx is not found | ติดตั้ง tool ก่อน |
| `masscan:rate-limited-port-scan` | network | yes | no — masscan is not found | ติดตั้ง tool ก่อน |
| `naabu:port-inventory` | network | yes | no — naabu is not found | ติดตั้ง tool ก่อน |
| `ncat:tcp-connect-check` | network | no | yes | Terminal / รันทันที |
| `nmap:host-discovery` | network | no | yes | Terminal / รันทันที |
| `nmap:os-fingerprint` | network | yes | yes | Terminal / รันทันที |
| `nmap:port-inventory` | network | yes | yes | Terminal / รันทันที |
| `nmap:script-scan` | network | yes | yes | Terminal / รันทันที |
| `nmap:service-identification` | network | yes | yes | Terminal / รันทันที |
| `nping:probe` | network | yes | yes | Terminal / รันทันที |
| `powershell:arp-discovery` | local | no | yes | Terminal / รันทันที |
| `powershell:arp-discovery-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:dns-inspection` | network | no | yes | Terminal / รันทันที |
| `powershell:ip-configuration` | local | no | yes | Terminal / รันทันที |
| `powershell:ip-configuration-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:routing-table` | local | no | yes | Terminal / รันทันที |
| `powershell:routing-table-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:tcp-connect-scan` | network | yes | yes | Terminal / รันทันที |
| `powershell:traceroute` | network | yes | yes | Terminal / รันทันที |
| `rustscan:port-sweep` | network | yes | no — rustscan is not found | ติดตั้ง tool ก่อน |
| `tshark:live-capture` | network | yes | no — tshark is not found | ติดตั้ง tool ก่อน |
| `tshark:pcap-summary` | local | no | no — tshark is not found | ติดตั้ง tool ก่อน |
| `tshark:traffic-analysis` | local | no | no — tshark is not found | ติดตั้ง tool ก่อน |

## threat-intelligence (5)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `amass:subdomain-enum` | network | no | no — amass is not found | ติดตั้ง tool ก่อน |
| `hayabusa:evtx-timeline` | local | no | no — hayabusa is not found | ติดตั้ง tool ก่อน |
| `sigma:convert` | local | no | no — sigma is not found | ติดตั้ง tool ก่อน |
| `subfinder:subdomain-enum` | network | no | no — subfinder is not found | ติดตั้ง tool ก่อน |
| `suricata:pcap-analysis` | local | no | no — suricata is not found | ติดตั้ง tool ก่อน |

## vulnerability-assessment (12)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `cvemap:cve-lookup` | local | no | no — cvemap is not found | ติดตั้ง tool ก่อน |
| `dependency-check:dependency-scan` | local | no | no — dependency-check is not found | ติดตั้ง tool ก่อน |
| `grype:filesystem-scan` | local | no | no — grype is not found | ติดตั้ง tool ก่อน |
| `metasploit:exploit-launch` | network | yes | no — metasploit is not found | ติดตั้ง tool ก่อน |
| `metasploit:module-search` | local | no | no — metasploit is not found | ติดตั้ง tool ก่อน |
| `nessus:import-scan-results` | local | no | yes | Terminal / รันทันที |
| `nuclei:template-scan` | network | yes | no — nuclei is not found | ติดตั้ง tool ก่อน |
| `osv-scanner:lockfile-scan` | local | no | no — osv-scanner is not found | ติดตั้ง tool ก่อน |
| `retire-js:js-scan` | local | no | no — retire-js is not found | ติดตั้ง tool ก่อน |
| `semgrep:sast-scan` | local | no | no — semgrep is not found | ติดตั้ง tool ก่อน |
| `trivy:filesystem-scan` | local | no | no — trivy is not found | ติดตั้ง tool ก่อน |
| `trivy:image-scan` | local | no | no — trivy is not found | ติดตั้ง tool ก่อน |

## web-security (10)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `feroxbuster:content-discovery` | network | yes | no — feroxbuster is not found | ติดตั้ง tool ก่อน |
| `ffuf:content-discovery` | network | yes | no — ffuf is not found | ติดตั้ง tool ก่อน |
| `gau:url-collect` | network | no | no — gau is not found | ติดตั้ง tool ก่อน |
| `gobuster:content-discovery` | network | yes | no — gobuster is not found | ติดตั้ง tool ก่อน |
| `httpx:probe` | network | no | no — httpx is not found | ติดตั้ง tool ก่อน |
| `katana:crawl` | network | yes | no — katana is not found | ติดตั้ง tool ก่อน |
| `mitmproxy:capture-flows` | local | no | no — mitmproxy is not found | ติดตั้ง tool ก่อน |
| `owasp-zap:baseline-scan` | network | yes | no — owasp-zap is not found | ติดตั้ง tool ก่อน |
| `powershell:http-request` | network | no | yes | Terminal / รันทันที |
| `powershell:http-security-headers` | network | no | yes | Terminal / รันทันที |

## windows-security (33)

| operation | kind | approval | available | launch path |
|---|---|---|---|---|
| `autoruns:startup-inventory` | local | yes | no — autoruns is not found | ติดตั้ง tool ก่อน |
| `defender:custom-scan` | local | yes | yes | Terminal / รันทันที |
| `defender:status` | local | no | yes | Terminal / รันทันที |
| `defender:status-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `event-viewer:event-query` | local | no | yes | Terminal / รันทันที |
| `event-viewer:event-query-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `event-viewer:security-log-summary` | local | yes | yes | Terminal / รันทันที |
| `event-viewer:security-log-summary-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `osquery:query` | local | no | no — osquery is not found | ติดตั้ง tool ก่อน |
| `pingcastle:ad-health-check` | network | yes | no — pingcastle is not found | ติดตั้ง tool ก่อน |
| `powershell:event-log-query` | local | no | yes | Terminal / รันทันที |
| `powershell:event-log-query-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:firewall-profiles` | local | no | yes | Terminal / รันทันที |
| `powershell:firewall-profiles-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:installed-software` | local | no | yes | Terminal / รันทันที |
| `powershell:installed-software-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:network-connections` | local | no | yes | Terminal / รันทันที |
| `powershell:network-connections-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:process-inventory` | local | no | yes | Terminal / รันทันที |
| `powershell:process-inventory-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:scheduled-tasks` | local | no | yes | Terminal / รันทันที |
| `powershell:scheduled-tasks-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:service-inventory` | local | no | yes | Terminal / รันทันที |
| `powershell:service-inventory-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:startup-items` | local | no | yes | Terminal / รันทันที |
| `powershell:startup-items-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `powershell:system-info` | local | no | yes | Terminal / รันทันที |
| `powershell:system-info-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
| `process-monitor:import-pml` | local | no | no — process-monitor is not found | ติดตั้ง tool ก่อน |
| `rubeus:kerberoast` | network | yes | no — rubeus has not been discovered yet — run Tool discovery | ติดตั้ง tool ก่อน |
| `sharphound:ad-collect` | network | yes | no — sharphound is not found | ติดตั้ง tool ก่อน |
| `sysmon:event-query` | local | no | yes | Terminal / รันทันที |
| `sysmon:event-query-remote` | network | yes | yes | Terminal (ต้องมี Remote Host อนุมัติ) |
