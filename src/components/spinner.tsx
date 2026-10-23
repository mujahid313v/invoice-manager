// Standalone module: keeps client components that only need the spinner
// out of a dependency cycle through ui.tsx (which renders AppNav).
export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
