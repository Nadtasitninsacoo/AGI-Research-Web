import { Clock } from "./Clock";
import { BackButton } from "./BackButton";

type NavbarProps = {
  online: boolean;
  title?: string;
  /** chip prefix for the link status, e.g. DB or API */
  link?: string;
  agentsActive?: number;
  runsInFlight?: number;
};

export function Navbar({ online, title = "OVERVIEW", link = "DB", agentsActive, runsInFlight }: NavbarProps) {
  return (
    <header className="navbar">
      <div className="crumbs">
        <BackButton />
        <span>AGI</span>
        <i>/</i>
        <b>{title}</b>
      </div>

      <div className="chips">
        <span className="chip">
          <span className={`led ${online ? "led-on" : "led-off"}`} />
          {link} {online ? "ONLINE" : "OFFLINE"}
        </span>
        {agentsActive !== undefined && (
          <span className="chip">{agentsActive} AGENT{agentsActive === 1 ? "" : "S"} ACTIVE</span>
        )}
        {runsInFlight !== undefined && (
          <span className="chip">{runsInFlight} RUN{runsInFlight === 1 ? "" : "S"} IN FLIGHT</span>
        )}
      </div>

      <div className="nav-right">
        <span className="clock"><Clock /></span>
        <span className="avatar" title="Overseer">OV</span>
      </div>
    </header>
  );
}
