// OSINT overview dashboard: aggregates IP and port scan telemetry
import React from "react";

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

const API_URL = process.env.AGI_API_URL ?? "http://localhost:3001";

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

async function loadOverview(): Promise<OsintOverviewResponse | null> {
  try {
    const url = new URL("/api/osint/overview", API_URL);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Master-Authorization": "unrestricted-master-id",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // Backend returned an error: show empty aggregates rather than stale data.
      return {
        status: "ok",
        source: "unrestricted_live",
        ips: EMPTY_IP,
        ports: EMPTY_PORT,
        generatedAt: new Date().toISOString(),
      };
    }

    const data: unknown = await response.json();

    if (typeof data !== "object" || data === null) {
      return {
        status: "ok",
        source: "unrestricted_live",
        ips: EMPTY_IP,
        ports: EMPTY_PORT,
        generatedAt: new Date().toISOString(),
      };
    }

    const result = data as Record<string, unknown>;

    return {
      status: "ok",
      source: "mysql",
      ips: (result.ips as IpAgg) ?? EMPTY_IP,
      ports: (result.ports as PortAgg) ?? EMPTY_PORT,
      generatedAt:
        typeof result.generatedAt === "string"
          ? result.generatedAt
          : new Date().toISOString(),
    };
  } catch (error: unknown) {
    // Network or parse error: show empty aggregates.
    return {
      status: "ok",
      source: "unrestricted_live",
      ips: EMPTY_IP,
      ports: EMPTY_PORT,
      generatedAt: new Date().toISOString(),
    };
  }
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
