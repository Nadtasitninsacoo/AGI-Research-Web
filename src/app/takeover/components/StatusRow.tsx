
type StatusRowProps = {
  label: string;
  value: string;
  good: boolean;
};

export function StatusRow({
  label,
  value,
  good,
}: StatusRowProps) {
  return (
    <div className="flex items-center justify-between border-b border-[#252b3b] py-2 text-[10px] last:border-b-0">
      <span className="text-slate-400">{label}</span>

      <span
        className={`font-mono font-bold ${
          good ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
