/**
 * BrandLogo component that renders the canonical Kaizen Care mark
 * from the landing page.
 */
export default function BrandLogo({
  className = "h-8 w-auto",
  iconClassName = "h-8 w-auto shrink-0",
  showText = true,
  textColor = "text-white",
  textSize = "text-xl",
  subtitle = null,
  subtitleColor = "text-[#F0F5F7]/80",
}) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width="34"
        height="38"
        viewBox="0 0 35 42"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={iconClassName}
        aria-hidden="true"
      >
        <path
          d="M14.451 5.223A7.466 7.466 0 0 1 24.9 15.891q-.3.293-.584.512L13.933 5.802q.22-.285.518-.579M7.093 25.239A7.466 7.466 0 0 0 17.607 35.84a7 7 0 0 0 .518-.574L7.675 24.73a6 6 0 0 0-.582.508"
          fill="currentColor"
        />
        <rect
          width="12.629"
          height="32.626"
          rx="6.315"
          transform="rotate(-45 16.202 6.711)"
          fill="currentColor"
        />
      </svg>
      {showText && (
        <div className="flex flex-col min-w-0">
          <span
            className={`font-bold tracking-tight leading-tight truncate ${textSize} ${textColor}`}
          >
            Kaizen Care
          </span>
          {subtitle && (
            <span
              className={`text-[10px] tracking-widest uppercase font-semibold mt-0.5 truncate ${subtitleColor}`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
