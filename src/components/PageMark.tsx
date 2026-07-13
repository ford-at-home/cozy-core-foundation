/**
 * Hardcopy Tools brand mark — three stacked page-edge bars with a folded
 * corner, vectorized from the supplied logo. Uses currentColor so the mark
 * inherits its color from the surrounding text (typically the amber primary).
 */
export function PageMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 186.023523"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={className}
    >
      <g transform="translate(-10,196) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M202 1939 c-85 -42 -102 -93 -102 -300 l0 -159 1280 0 1280 0 0 240 0 240 -1207 0 -1208 0 -43 -21z" />
        <path d="M107 1263 c-4 -3 -7 -111 -7 -240 l0 -233 893 0 894 0 -31 62 c-29 59 -31 69 -31 178 0 111 1 119 32 178 l32 62 -888 0 c-488 0 -891 -3 -894 -7z" />
        <path d="M100 417 c0 -154 1 -166 25 -213 14 -28 40 -59 62 -74 l37 -25 1218 -3 1218 -2 0 240 0 240 -1280 0 -1280 0 0 -163z" />
      </g>
    </svg>
  );
}
