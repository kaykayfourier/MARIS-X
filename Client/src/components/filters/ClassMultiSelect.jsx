export function ClassMultiSelect({ label, options, selected, onToggle }) {
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
                  ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
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
