import Link from "next/link";
import { connection } from "next/server";
import { PageFrame, PageHero, Shell } from "@/components/hud/Shell";
import { one, toPage } from "@/lib/format";
import { Recon } from "./Recon";
import { PortsVault } from "./PortsVault";

export const metadata = { title: "Recon // AGI Research" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ReconPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell label="LOADING RECON">
      <Content searchParams={searchParams} />
    </Shell>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  await connection();
  const sp = await searchParams;
  const tab = one(sp.tab) === "ports" ? "ports" : "scan";

  return (
    <PageFrame title="RECON" online>
      <PageHero
        kicker="AGI RESEARCH // BATCH RECON"
        title={tab === "ports" ? "Port" : "Batch"}
        strong={tab === "ports" ? "Vault" : "Recon"}
        note="OSINT · READ-ONLY"
      />

      <nav className="rc-tabs" aria-label="Recon sections" style={{ marginBottom: 16 }}>
        <Link
          href="/recon"
          className={`rc-tab ${tab === "scan" ? "is-active" : ""}`}
          aria-current={tab === "scan" ? "page" : undefined}
        >
          สแกน (Recon)
        </Link>
        <Link
          href="/recon?tab=ports"
          className={`rc-tab ${tab === "ports" ? "is-active" : ""}`}
          aria-current={tab === "ports" ? "page" : undefined}
        >
          คลังพอร์ต
        </Link>
      </nav>

      {tab === "ports" ? (
        <PortsVault
          q={(one(sp.q) ?? "").trim()}
          service={(one(sp.service) ?? "").trim()}
          port={(one(sp.port) ?? "").trim()}
          hasCve={one(sp.cve) === "1"}
          page={toPage(one(sp.page))}
        />
      ) : (
        <Recon />
      )}
    </PageFrame>
  );
}
