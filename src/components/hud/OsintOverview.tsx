// OSINT overview dashboard: aggregates IP and port scan telemetry straight from
// the local DB (saved_ips + saved_ports) — the retired :3001 backend is gone.
import React from "react";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

type Bar = {
  label: string;
  n: number;
};

type IpAgg = {
  total: number;
  countries: number;
  topCountry: Bar[];
  topCity: Bar[];
  scanned: number;
  unscanned: number;
};

type PortAgg = {
  total: number;
  ips: number;
  services: number;
  vulnHosts: number;
  safeHosts: number;
  topService: Bar[];
  topPort: Bar[];
};

interface OsintOverviewResponse {
  status: "ok";
  source: "mysql" | "unrestricted_live";
  ips: IpAgg;
  ports: PortAgg;
  generatedAt: string;
}

const EMPTY_IP: IpAgg = {
  total: 0,
  countries: 0,
  topCountry: [],
  topCity: [],
  scanned: 0,
  unscanned: 0,
};

const EMPTY_PORT: PortAgg = {
  total: 0,
  ips: 0,
  services: 0,
  vulnHosts: 0,
  safeHosts: 0,
  topService: [],
  topPort: [],
};

const bars = (rows: RowDataPacket[]): Bar[] =>
  rows.map((r) => ({ label: String(r.label), n: Number(r.n) }));

// IP aggregates from saved_ips. Returns zeros if the table is missing / DB down.
async function loadIpAgg(): Promise<IpAgg> {
  try {
    const [[c]] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT NULLIF(country, '')) AS countries FROM saved_ips`,
    );
    const [topCountry] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(country, ''), '?') AS label, COUNT(*) AS n
       FROM saved_ips GROUP BY label ORDER BY n DESC LIMIT 8`,
    );
    const [topCity] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(city, ''), '?') AS label, COUNT(*) AS n
       FROM saved_ips GROUP BY label ORDER BY n DESC LIMIT 8`,
    );
    return {
      total: Number(c?.total ?? 0),
      countries: Number(c?.countries ?? 0),
      topCountry: bars(topCountry),
      topCity: bars(topCity),
      scanned: 0,
      unscanned: 0,
    };
  } catch {
    return EMPTY_IP;
  }
}

// Port aggregates from saved_ports. Returns zeros if the table is missing / DB down.
async function loadPortAgg(): Promise<PortAgg> {
  try {
    const [[c]] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT ip) AS ips,
              COUNT(DISTINCT NULLIF(service, '')) AS services,
              COUNT(DISTINCT CASE WHEN cves > 0 THEN ip END) AS vulnHosts
       FROM saved_ports`,
    );
    const ips = Number(c?.ips ?? 0);
    const vulnHosts = Number(c?.vulnHosts ?? 0);
    const [topService] = await db.query<RowDataPacket[]>(
      `SELECT COALESCE(NULLIF(service, ''), '?') AS label, COUNT(*) AS n
       FROM saved_ports GROUP BY label ORDER BY n DESC LIMIT 8`,
    );
    const [topPort] = await db.query<RowDataPacket[]>(
      `SELECT CAST(port AS CHAR) AS label, COUNT(*) AS n
       FROM saved_ports GROUP BY port ORDER BY n DESC LIMIT 8`,
    );
    return {
      total: Number(c?.total ?? 0),
      ips,
      services: Number(c?.services ?? 0),
      vulnHosts,
      safeHosts: Math.max(0, ips - vulnHosts),
      topService: bars(topService),
      topPort: bars(topPort),
    };
  } catch {
    return EMPTY_PORT;
  }
}

async function loadOverview(): Promise<OsintOverviewResponse | null> {
  const [ips, ports] = await Promise.all([loadIpAgg(), loadPortAgg()]);
  return {
    status: "ok",
    source: "mysql",
    ips,
    ports,
    generatedAt: new Date().toISOString(),
  };
}

export async function OsintOverview() {
  const overview = await loadOverview();

  const activeIp = overview?.ips ?? EMPTY_IP;
  const activePort = overview?.ports ?? EMPTY_PORT;

  const vuln = activePort.vulnHosts;
  const safe = activePort.safeHosts;
  const vulnTotal = vuln + safe;

  const vulnPct = vulnTotal > 0 ? Math.round((vuln / vulnTotal) * 100) : 85;

  return (
    <section
      className="panel span-12"
      id="osint"
      aria-label="OSINT overview"
      style={{
        background: "#0a0a0a",
        border: "1px solid #f81e3666",
      }}
    >
      <header
        className="panel-head"
        style={{
          borderBottom: "1px solid #f81e3633",
          color: "#f81e36",
        }}
      >
        <span>
          OSINT Overview (ภาพรวมข้อมูลสำรวจ IP และพอร์ต)
        </span>
        <em style={{ color: "#ffb3bb" }}>
          OSINT · RECON
        </em>
      </header>

      <div className="oi-stats">
        <Stat
          label="IP ทั้งหมด (Total IPs)"
          value={activeIp.total}
          accent
        />

        <Stat
          label="พอร์ตที่สแกน (Scanned Ports)"
          value={activePort.total}
        />

        <Stat
          label="โฮสต์ที่พบช่องโหว่ (Vulnerable Hosts)"
          value={vuln}
          danger
        />

        <Stat
          label="จำนวนประเทศ (Countries)"
          value={activeIp.countries}
        />

        <Stat
          label="บริการที่ตรวจพบ (Discovered Services)"
          value={activePort.services}
        />
      </div>

      {vulnTotal > 0 && (
        <div
          className="oi-split"
          role="img"
          aria-label={`โฮสต์ที่พบช่องโหว่ ${vuln} จาก ${vulnTotal}`}
          style={{
            background: "#111",
            border: "1px solid #f81e3644",
          }}
        >
          <div className="oi-split-head">
            <span className="oi-split-title" style={{ color: "#f81e36" }}>
              สัดส่วนโฮสต์ที่ตรวจพบช่องโหว่
            </span>

            <span className="oi-split-pct" style={{ color: "#f81e36" }}>
              {vulnPct}%
            </span>
          </div>

          <div className="oi-split-bar" style={{ background: "#222" }}>
            <span
              className="oi-seg oi-vuln"
              style={{
                width: `${vulnPct}%`,
                background: "#f81e36",
                boxShadow: "0 0 10px #f81e36",
              }}
              title={`พบช่องโหว่ ${vuln.toLocaleString()} โฮสต์`}
            />

            <span
              className="oi-seg oi-safe"
              style={{
                width: `${100 - vulnPct}%`,
                background: "#3a080f",
              }}
              title={`ปลอดภัย ${safe.toLocaleString()}`}
            />
          </div>

          <div className="oi-split-legend" style={{ color: "#ffb3bb" }}>
            <span>
              <i
                className="oi-dot oi-dvuln"
                style={{ background: "#f81e36" }}
              />{" "}
              พบช่องโหว่ <b>{vuln.toLocaleString()} โฮสต์</b>
            </span>

            <span>
              <i
                className="oi-dot oi-dsafe"
                style={{ background: "#3a080f" }}
              />{" "}
              สถานะอื่นๆ <b>{safe.toLocaleString()}</b>
            </span>
          </div>
        </div>
      )}

      <div className="oi-charts">
        <BarChart
          title="บริการที่พบบ่อย (Top Services)"
          data={activePort.topService}
          unit="รายการ"
        />

        <BarChart
          title="พอร์ตที่พบบ่อย (Top Ports)"
          data={activePort.topPort}
          unit="ครั้ง"
        />

        <BarChart
          title="เมืองที่พบบ่อย (Top Cities)"
          data={activeIp.topCity}
          unit="IP"
        />

        <BarChart
          title="ประเทศที่พบบ่อย (Top Countries)"
          data={activeIp.topCountry}
          unit="IP"
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`oi-stat ${accent ? "is-accent" : ""} ${danger ? "is-danger" : ""}`}
      style={{
        background: "#111",
        border: "1px solid #f81e3644",
      }}
    >
      <small style={{ color: "#ffb3bb" }}>{label}</small>

      <b
        style={{ color: "#f81e36", textShadow: "0 0 6px rgba(248,30,54,0.4)" }}
      >
        {value.toLocaleString()}
      </b>
    </div>
  );
}

function BarChart({
  title,
  data,
  unit,
}: {
  title: string;
  data: Bar[];
  unit: string;
}) {
  const max = data.reduce((m, d) => Math.max(m, d.n), 0) || 1;

  return (
    <figure
      className="oi-chart"
      style={{
        background: "#111",
        border: "1px solid #f81e3644",
        padding: "12px",
      }}
    >
      <figcaption
        className="oi-chart-title"
        style={{
          color: "#f81e36",
          fontWeight: "bold",
        }}
      >
        {title}
      </figcaption>

      <div className="oi-bars">
        {data.map((d) => (
          <div
            className="oi-barrow"
            key={d.label}
            title={`${d.label}: ${d.n.toLocaleString()} ${unit}`}
          >
            <span className="oi-barlabel" style={{ color: "#ffb3bb" }}>
              {d.label}
            </span>

            <span className="oi-bartrack" style={{ background: "#222" }}>
              <span
                className="oi-barfill"
                style={{
                  width: `${Math.max(5, (d.n / max) * 100)}%`,
                  background: "#f81e36",
                  boxShadow: "0 0 10px rgba(248,30,54,0.7)",
                }}
              />
            </span>

            <span className="oi-barval" style={{ color: "#f81e36" }}>
              {d.n.toLocaleString()} {unit}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}
