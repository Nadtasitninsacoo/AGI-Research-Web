// Parser for DARK AGI's own shorthand command line:
//
//   dagi net:osfingerprint targets=127.0.0.2 maxRate=5000 keng
//   dagi fs:hash path="C:\Program Files\app.exe" keng
//
// The same language dark-agi-frontend accepts (src/lib/commands.ts). The alias
// table below mirrors it — if DARK AGI gains a new verb, add it there and here.
// Field TYPES (integer / list / text) are NOT copied: they come from the live
// /operations catalogue passed to parseDagiCommand(), so they can't drift.
// Side-effect-free so it's testable without the hook or network.

export const DAGI_PREFIX = "dagi";
export const DAGI_SUFFIX = "keng";

export type DagiField = { name: string; type: string };
export type DagiOperation = { toolId: string; operationId: string; fields: DagiField[] };

/** Branded verb for each operation, keyed by `${toolId}:${operationId}`. */
export const DAGI_ALIASES: Record<string, string> = {
  'nmap:host-discovery': 'net:ping',
  'nmap:port-inventory': 'net:ports',
  'nmap:service-identification': 'net:services',
  'nmap:os-fingerprint': 'net:osfingerprint',
  'nmap:script-scan': 'net:nse',
  'masscan:rate-limited-port-scan': 'net:masscan',
  'powershell:dns-inspection': 'net:dns',
  'powershell:arp-discovery': 'net:arp',
  'powershell:tcp-connect-scan': 'net:scan',
  'powershell:ip-configuration': 'net:ipconfig',
  'powershell:routing-table': 'net:route',
  'powershell:traceroute': 'net:trace',
  'powershell:http-security-headers': 'web:headers',
  'powershell:http-request': 'web:get',
  'powershell:tls-inspection': 'crypto:tls',
  'powershell:certificate-inspector': 'crypto:cert',
  'powershell:process-inventory': 'win:procs',
  'powershell:service-inventory': 'win:services',
  'powershell:network-connections': 'win:netstat',
  'defender:status': 'win:defender',
  'powershell:firewall-profiles': 'win:firewall',
  'powershell:scheduled-tasks': 'win:tasks',
  'powershell:startup-items': 'win:startup',
  'powershell:installed-software': 'win:software',
  'powershell:system-info': 'win:sysinfo',
  'powershell:event-log-query': 'win:events',
  'powershell:file-hash': 'fs:hash',
  'powershell:file-metadata': 'fs:meta',
  'trivy:filesystem-scan': 'vuln:trivyfs',
  'trivy:image-scan': 'vuln:trivyimage',
  'grype:filesystem-scan': 'vuln:grype',
  'osv-scanner:lockfile-scan': 'vuln:osv',
  'nuclei:template-scan': 'vuln:nuclei',
  'capa:capabilities': 'malware:capa',
  'floss:strings': 'malware:floss',
  'clamav:scan': 'malware:clamav',
  'gnupg:verify-signature': 'crypto:gpgverify',
  'gnupg:key-inspection': 'crypto:gpgkey',
  'tshark:pcap-summary': 'net:pcapsummary',
  'tshark:traffic-analysis': 'net:pcapanalyze',
  'naabu:port-inventory': 'net:naabu',
  'dnsx:dns-resolve': 'net:dnsx',
  'httpx:probe': 'web:probe',
  'subfinder:subdomain-enum': 'intel:subdomains',
  'gau:url-collect': 'web:urls',
  'tlsx:tls-scan': 'crypto:tlsx',
  'ncat:tcp-connect-check': 'net:ncat',
  'rustscan:port-sweep': 'net:rustscan',
  'nping:probe': 'net:nping',
  'openssl:certificate-inspection': 'crypto:osslcert',
  'openssl:tls-handshake': 'crypto:osslhandshake',
  'cfssl:cert-inspect': 'crypto:cfssl',
  'mkcert:local-ca': 'crypto:mkcertca',
  'exiftool:metadata': 'fs:exif',
  'yara:scan': 'malware:yara',
  'detect-it-easy:identify': 'malware:identify',
  'radare2:analyze': 'malware:r2',
  'rizin:analyze': 'malware:rizin',
  'semgrep:sast-scan': 'vuln:semgrep',
  'retire-js:js-scan': 'vuln:retirejs',
  'gobuster:content-discovery': 'web:gobuster',
  'feroxbuster:content-discovery': 'web:ferox',
  'katana:crawl': 'web:katana',
  'autoruns:startup-inventory': 'win:autoruns',
  'sysmon:event-query': 'win:sysmon',
  'event-viewer:event-query': 'win:eventquery',
  'event-viewer:security-log-summary': 'win:secsummary',
  'defender:custom-scan': 'win:defenderscan',
  'osquery:query': 'win:osquery',
  'chainsaw:hunt': 'forensics:chainsaw',
  'sleuthkit:file-listing': 'forensics:fls',
  'volatility3:process-list': 'forensics:volpslist',
  'volatility3:network-scan': 'forensics:volnetscan',
  'regripper:registry-parse': 'forensics:regripper',
  'amass:subdomain-enum': 'intel:amass',
  'cvemap:cve-lookup': 'vuln:cvemap',
  'ffuf:content-discovery': 'web:ffuf',
  'sigma:convert': 'intel:sigma',
  'john:test-hash-audit': 'crypto:john',
  'step-cli:cert-inspect': 'crypto:stepcli',
  'upx:unpack': 'malware:upx',
  'eric-zimmerman-tools:mft-parse': 'forensics:mftecmd',
  'eric-zimmerman-tools:prefetch-parse': 'forensics:pecmd',
  'bulk-extractor:feature-scan': 'forensics:bulkextractor',
  'hindsight:browser-history': 'forensics:hindsight',
  'dependency-check:dependency-scan': 'vuln:dependencycheck',
  'suricata:pcap-analysis': 'intel:suricata',
  'hayabusa:evtx-timeline': 'forensics:hayabusa',
  'process-monitor:import-pml': 'win:procmon',
  'velociraptor:collect': 'forensics:velociraptor',
  'metasploit:module-search': 'vuln:msfsearch',
  'sleuthkit-mmls:partition-layout': 'forensics:mmls',
  'sslyze:tls-assessment': 'crypto:sslyze',
  'hashcat:test-hash-audit': 'crypto:hashcat',
  'pev:pe-info': 'malware:pev',
  'retdec:decompile': 'malware:retdec',
  'sharphound:ad-collect': 'win:sharphound',
  'networkminer-cli:pcap-analysis': 'forensics:networkminer',
  'testdisk:partition-analysis': 'forensics:testdisk',
  'pingcastle:ad-health-check': 'win:pingcastle',
  'nessus:import-scan-results': 'vuln:nessus',
  'age-inspect:inspect': 'crypto:age',
  'mitmproxy:capture-flows': 'web:mitmproxy',
  'tshark:live-capture': 'net:tsharklive',
  'step-cli:remote-cert-inspect': 'crypto:stepcliremote',
  'yara:process-scan': 'malware:yaraproc',
  'radare2:process-attach': 'malware:r2attach',
  'rizin:process-attach': 'malware:rizinattach',
  'gnupg:keyring-list': 'crypto:gpgkeyring',
  'powershell:certificate-store-inspector': 'crypto:certstore',
  'owasp-zap:baseline-scan': 'web:zap',

  // Remote-execution siblings (remote-execution.ts's remoteVariant()) — same local verb, under a
  // dedicated "remote:" category so it's unmistakable at a glance that this runs on another machine.
  'powershell:process-inventory-remote': 'remote:procs',
  'powershell:service-inventory-remote': 'remote:services',
  'powershell:network-connections-remote': 'remote:netstat',
  'defender:status-remote': 'remote:defender',
  'powershell:firewall-profiles-remote': 'remote:firewall',
  'powershell:scheduled-tasks-remote': 'remote:tasks',
  'powershell:startup-items-remote': 'remote:startup',
  'powershell:installed-software-remote': 'remote:software',
  'powershell:system-info-remote': 'remote:sysinfo',
  'powershell:event-log-query-remote': 'remote:events',
  'powershell:file-hash-remote': 'remote:hash',
  'powershell:file-metadata-remote': 'remote:meta',
  'powershell:certificate-inspector-remote': 'remote:cert',
  'powershell:certificate-store-inspector-remote': 'remote:certstore',
  'powershell:arp-discovery-remote': 'remote:arp',
  'powershell:ip-configuration-remote': 'remote:ipconfig',
  'powershell:routing-table-remote': 'remote:route',
  'sysmon:event-query-remote': 'remote:sysmon',
  'event-viewer:event-query-remote': 'remote:eventquery',
  'event-viewer:security-log-summary-remote': 'remote:secsummary',

  'metasploit:exploit-launch': 'exploit:launch',
};

const KEY_BY_ALIAS = new Map(Object.entries(DAGI_ALIASES).map(([key, alias]) => [alias, key]));

export class DagiCommandError extends Error {}

/** True if the line is meant as a `dagi …` shorthand command. */
export function isDagiCommand(text: string): boolean {
  return /^dagi(\s|$)/i.test(text.trim());
}

/** Splits on whitespace, honouring double-quoted values (paths with spaces). */
export function tokenizeDagi(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let started = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
      started = true;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

function coerce(field: DagiField, value: string): unknown {
  if (field.type === "integer") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new DagiCommandError(`"${field.name}" ต้องเป็นตัวเลข`);
    return n;
  }
  if (field.type === "targets" || field.type === "list") {
    return value.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return value;
}

/** Pulls the operation array out of whatever shape /operations returned. */
export function operationsFrom(payload: unknown): DagiOperation[] {
  const list = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : [];
  return list.filter(
    (o): o is DagiOperation =>
      typeof o === "object" && o !== null &&
      typeof (o as DagiOperation).toolId === "string" &&
      typeof (o as DagiOperation).operationId === "string" &&
      Array.isArray((o as DagiOperation).fields),
  );
}

/**
 * Parses `dagi <verb> key=value … [keng]` into a job submission. The trailing
 * `keng` is optional here (forgiving, unlike dark-agi-frontend). `<verb>` may be
 * the branded alias or the full `toolId:operationId`.
 */
export function parseDagiCommand(
  line: string,
  operations: readonly DagiOperation[],
): { toolId: string; operationId: string; input: Record<string, unknown> } {
  const tokens = tokenizeDagi(line.trim());
  if (tokens.length < 2 || tokens[0].toLowerCase() !== DAGI_PREFIX) {
    throw new DagiCommandError(`รูปแบบคือ: ${DAGI_PREFIX} <คำสั่ง> key=value … ${DAGI_SUFFIX}`);
  }
  const verb = tokens[1];
  const opKey = KEY_BY_ALIAS.get(verb) ?? (verb in DAGI_ALIASES ? verb : undefined);
  if (!opKey) throw new DagiCommandError(`ไม่รู้จักคำสั่ง "${verb}" — ดูรายการใน Command Reference`);
  const op = operations.find((o) => `${o.toolId}:${o.operationId}` === opKey);
  if (!op) throw new DagiCommandError(`คำสั่ง "${verb}" ใช้ไม่ได้ในตอนนี้`);

  const rest = tokens.slice(2);
  if (rest.length > 0 && rest[rest.length - 1].toLowerCase() === DAGI_SUFFIX) rest.pop();

  const input: Record<string, unknown> = {};
  for (const token of rest) {
    const eq = token.indexOf("=");
    if (eq < 1) throw new DagiCommandError(`"${token}" ต้องเขียนเป็น key=value`);
    const name = token.slice(0, eq);
    const field = op.fields.find((f) => f.name === name);
    if (!field) {
      throw new DagiCommandError(
        `"${name}" ไม่ใช่ฟิลด์ของ ${verb} — ฟิลด์ที่มี: ${op.fields.map((f) => f.name).join(", ") || "(ไม่มี)"}`,
      );
    }
    input[name] = coerce(field, token.slice(eq + 1));
  }
  return { toolId: op.toolId, operationId: op.operationId, input };
}
