// Defensive risk model for the Network Vulnerability Analysis view.
//
// IMPORTANT: The saved_ports table only stores a CVE *count* per record
// (no CVE-ID / CVSS detail). This model therefore derives a conservative,
// transparent risk estimate from two real signals only:
//   1. Service / port exposure sensitivity
//   2. Number of known CVEs recorded for that service
//
// It never claims a CVSS score it does not have. Scores here are a
// prioritization heuristic for remediation, not an authoritative CVSS rating.

import type { SavedPortTarget } from "@/app/recon/actions";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export type ExposureTier = "critical" | "high" | "medium" | "low";

export interface RiskAssessment {
  target: SavedPortTarget;
  key: string;
  exposureTier: ExposureTier;
  severity: Severity;
  score: number; // 0 - 100 prioritization score
  serviceLabel: string;
  reasons: string[];
  remediation: string;
}

// Well-known sensitive ports → exposure tier.
// Remote access, management, and data-store services carry the highest weight.
const PORT_TIER: Record<number, ExposureTier> = {
  23: "critical", // telnet (cleartext)
  445: "critical", // smb
  3389: "critical", // rdp
  5900: "critical", // vnc
  3306: "critical", // mysql
  5432: "critical", // postgresql
  1433: "critical", // mssql
  27017: "critical", // mongodb
  6379: "critical", // redis
  9200: "critical", // elasticsearch
  11211: "critical", // memcached
  2049: "critical", // nfs
  389: "high", // ldap
  636: "high", // ldaps
  21: "high", // ftp
  22: "high", // ssh
  5985: "high", // winrm http
  5986: "high", // winrm https
  161: "high", // snmp
  25: "high", // smtp
  53: "high", // dns
  80: "medium", // http
  443: "medium", // https
  8080: "medium", // http-proxy
  8443: "medium", // https-alt
  8000: "medium",
  8008: "medium",
};

const SERVICE_TIER: Record<string, ExposureTier> = {
  telnet: "critical",
  smb: "critical",
  "microsoft-ds": "critical",
  rdp: "critical",
  "ms-wbt-server": "critical",
  vnc: "critical",
  mysql: "critical",
  postgres: "critical",
  postgresql: "critical",
  mssql: "critical",
  "ms-sql-s": "critical",
  mongodb: "critical",
  mongo: "critical",
  redis: "critical",
  elasticsearch: "critical",
  memcached: "critical",
  nfs: "critical",
  ldap: "high",
  ldaps: "high",
  ftp: "high",
  ssh: "high",
  winrm: "high",
  snmp: "high",
  smtp: "high",
  dns: "high",
  http: "medium",
  https: "medium",
  "http-proxy": "medium",
  "http-alt": "medium",
};

const TIER_WEIGHT: Record<ExposureTier, number> = {
  critical: 45,
  high: 30,
  medium: 18,
  low: 8,
};

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

export const SEVERITY_META: Record<
  Severity,
  { label: string; text: string; bg: string; border: string; dot: string }
> = {
  CRITICAL: {
    label: "CRITICAL",
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/40",
    dot: "bg-red-400",
  },
  HIGH: {
    label: "HIGH",
    text: "text-orange-300",
    bg: "bg-orange-500/10",
    border: "border-orange-500/40",
    dot: "bg-orange-400",
  },
  MEDIUM: {
    label: "MEDIUM",
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/40",
    dot: "bg-amber-400",
  },
  LOW: {
    label: "LOW",
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    border: "border-sky-500/40",
    dot: "bg-sky-400",
  },
  INFO: {
    label: "INFO",
    text: "text-slate-300",
    bg: "bg-slate-500/10",
    border: "border-slate-500/30",
    dot: "bg-slate-400",
  },
};

export const SEVERITIES: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];

function exposureTier(target: SavedPortTarget): ExposureTier {
  const svc = (target.service ?? "").trim().toLowerCase();
  if (svc && SERVICE_TIER[svc]) return SERVICE_TIER[svc];
  if (PORT_TIER[target.port]) return PORT_TIER[target.port];
  return "low";
}

function remediationFor(
  severity: Severity,
  tier: ExposureTier,
  svcLabel: string,
  hasCves: boolean,
): string {
  if (severity === "CRITICAL") {
    return `เร่งด่วน: จำกัดการเข้าถึง ${svcLabel} ให้เหลือเฉพาะเครือข่ายภายใน/VPN, แพตช์ช่องโหว่ที่ทราบทันที และเปิดใช้ MFA + การบันทึก log`;
  }
  if (severity === "HIGH") {
    return hasCves
      ? `แพตช์ ${svcLabel} ให้เป็นเวอร์ชันล่าสุด, ปิดการเข้าถึงจากอินเทอร์เน็ตหากไม่จำเป็น และตรวจสอบ credential ที่อ่อนแอ`
      : `จำกัดการเข้าถึง ${svcLabel} ด้วย firewall/allow-list และบังคับการยืนยันตัวตนที่แข็งแรง`;
  }
  if (severity === "MEDIUM") {
    return tier === "critical"
      ? `บริการสำคัญ (${svcLabel}) เปิดสู่สาธารณะ: ย้ายไว้หลัง VPN หรือจำกัด IP ที่เข้าถึงได้`
      : `ตรวจสอบการตั้งค่า ${svcLabel}, ปิด header/endpoint ที่ไม่จำเป็น และติดตามแพตช์`;
  }
  if (severity === "LOW") {
    return `ตรวจสอบว่า ${svcLabel} จำเป็นต้องเปิดจริง และตั้งค่าความปลอดภัยพื้นฐาน (TLS, auth)`;
  }
  return `บันทึกไว้เป็นข้อมูล asset inventory — ไม่มีสัญญาณความเสี่ยงเด่นชัดจากข้อมูลที่มี`;
}

export function assessTarget(
  target: SavedPortTarget,
  key: string,
): RiskAssessment {
  const tier = exposureTier(target);
  const cves = Math.max(0, Number(target.cves ?? 0));
  const hasCves = cves > 0;

  // Base score from exposure sensitivity.
  let score = TIER_WEIGHT[tier];

  // CVE contribution (capped so a single huge count cannot dominate).
  const cveFactor = Math.min(cves, 20);
  score += cveFactor * 2.5; // up to +50

  score = Math.min(100, Math.round(score));

  // Severity bucketing — combines exposure tier with presence of CVEs.
  let severity: Severity;
  if (hasCves && tier === "critical") severity = "CRITICAL";
  else if (hasCves && tier === "high") severity = "HIGH";
  else if (hasCves && tier === "medium") severity = "MEDIUM";
  else if (hasCves) severity = "MEDIUM";
  else if (tier === "critical") severity = "MEDIUM";
  else if (tier === "high") severity = "LOW";
  else severity = "INFO";

  const svcLabel =
    (target.service ?? "").trim() || `port ${target.port}`;

  const reasons: string[] = [];
  reasons.push(
    tier === "critical"
      ? "บริการระดับวิกฤต (remote access / data store) เปิดให้เข้าถึง"
      : tier === "high"
        ? "บริการระดับสูง (management / auth) เปิดให้เข้าถึง"
        : tier === "medium"
          ? "บริการเว็บ/แอปพลิเคชันเปิดสาธารณะ"
          : "บริการทั่วไป",
  );
  if (hasCves) {
    reasons.push(
      `พบ ${cves} ช่องโหว่ที่ทราบ (recorded CVEs) บนบริการนี้`,
    );
  } else {
    reasons.push("ไม่มี CVE ที่บันทึกไว้ — ประเมินจากระดับการเปิดเผยบริการ");
  }

  return {
    target,
    key,
    exposureTier: tier,
    severity,
    score,
    serviceLabel: svcLabel,
    reasons,
    remediation: remediationFor(severity, tier, svcLabel, hasCves),
  };
}

export function compareBySeverity(a: RiskAssessment, b: RiskAssessment): number {
  const s = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
  if (s !== 0) return s;
  return b.score - a.score;
}
