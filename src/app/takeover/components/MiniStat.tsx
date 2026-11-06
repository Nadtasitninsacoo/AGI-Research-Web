
type MiniStatProps = {
  label: string;
  value: number;
};

export function MiniStat({ label, value }: MiniStatProps) {
  return (
    <div className="rounded border border-[#252b3b] bg-[#090a0f] p-1.5">
      <div className="text-[8px] text-slate-500">{label}</div>
      <div className="font-mono text-[10px] font-bold text-white">
        {value}
      </div>
    </div>
  );
}
