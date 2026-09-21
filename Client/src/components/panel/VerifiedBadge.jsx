export function VerifiedBadge({ reviewed }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        reviewed
          ? "border-[#8acbb6] bg-[#e1f1e8] text-[#33705d]"
          : "border-[#c8d2cd] bg-[#e7e8df] text-[#718083]"
      }`}
    >
      {reviewed ? "Verified" : "Unverified"}
    </span>
  );
}
