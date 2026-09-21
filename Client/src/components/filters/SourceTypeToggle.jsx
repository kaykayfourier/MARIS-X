export function SourceTypeToggle({ label, options, selected, onToggle }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = selected.includes(option);

          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-2.5 py-1.5 text-xs font-medium capitalize transition ${
                isActive
                  ? "border-violet-400 bg-violet-500/20 text-violet-100"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-500"
              }`}
            >
              {option.replace("_", " ")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
