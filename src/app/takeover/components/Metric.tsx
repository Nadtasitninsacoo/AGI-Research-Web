
import type { ReactNode } from "react";

type MetricProps = {
  label: string;
  value: string | number;
  icon: ReactNode;
};

export function Metric({ label, value, icon }: MetricProps) {
  return (
    <div className="flex items-center gap-3 rounded border border-[#252b3b] bg-[#0e1017] p-3">
      <div className="rounded border border-[#303649] bg-[#090a0f] p-2">
        {icon}
      </div>

      <div>
        <div className="text-[9px] font-bold tracking-widest text-slate-500">
          {label}
        </div>

        <div className="mt-0.5 font-mono text-sm font-bold text-white">
          {value}
        </div>
      </div>
    </div>
  );
}
