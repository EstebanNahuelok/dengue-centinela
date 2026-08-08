export function CentinelaIcon({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 56" className={className} role="img" aria-label="Dengue Centinela">
      <defs>
        <linearGradient id="heat-icon" x1="8" y1="8" x2="40" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2DD4BF" />
          <stop offset=".55" stopColor="#34D399" />
          <stop offset=".8" stopColor="#FBBF24" />
          <stop offset="1" stopColor="#F87171" />
        </linearGradient>
      </defs>
      <path
        d="M24 6 L37.86 14 L37.86 30 L24 50 L10.14 30 L10.14 14 Z"
        fill="none"
        stroke="url(#heat-icon)"
        strokeWidth="3.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M21.60 20.03 C 23.72 16.14, 28.67 15.08, 31.49 16.14 C 29.02 18.26, 24.78 19.67, 22.02 20.31 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.85"
        opacity=".9"
      />
      <path
        d="M22.02 21.02 C 24.42 17.98, 29.37 17.27, 32.20 18.68 C 29.37 20.17, 25.13 21.09, 22.30 21.37 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.85"
        opacity=".9"
      />
      <g
        stroke="currentColor"
        strokeWidth="0.85"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".95"
      >
        <path d="M20.18 22.22 L17.71 25.33 L18.77 28.86" />
        <path d="M21.31 22.50 L20.61 26.74 L22.73 29.99" />
        <path d="M22.30 22.22 L24.42 26.03 L23.72 30.28" />
      </g>
      <path
        d="M19.12 23.35 C 18.91 22.22, 21.60 20.24, 28.67 14.72 C 29.02 15.43, 27.39 18.40, 23.36 21.37 C 21.31 22.85, 20.04 23.63, 19.12 23.35 Z"
        fill="currentColor"
      />
      <circle cx="18.77" cy="23.21" r="1.56" fill="currentColor" />
      <path d="M17.78 23.91 L15.80 27.09" stroke="currentColor" strokeWidth="1.05" strokeLinecap="round" />
    </svg>
  );
}

export function CentinelaLockup({
  size = "md",
  showLocation = false,
}: {
  size?: "md" | "lg";
  showLocation?: boolean;
}) {
  return (
    <span className="flex items-center gap-3 text-foreground">
      <CentinelaIcon className={size === "lg" ? "h-16 w-auto" : "h-9 w-auto"} />
      <span className="leading-none">
        <span
          className={`block font-normal tracking-[0.32em] text-muted-foreground ${
            size === "lg" ? "text-base" : "text-[11px]"
          }`}
        >
          DENGUE
        </span>
        <span
          className={`block font-extrabold tracking-[0.06em] ${
            size === "lg" ? "text-4xl sm:text-5xl" : "text-lg"
          }`}
        >
          CENTINELA
        </span>
        {showLocation && (
          <span
            className={`mt-1 block font-normal text-muted-foreground ${
              size === "lg" ? "text-sm" : "text-[11px]"
            }`}
          >
            Salta, Argentina
          </span>
        )}
      </span>
    </span>
  );
}
