/**
 * The Quals mark: the app's white Q with a gold tail.
 *
 * Inline SVG rather than a file in `public/`, for two measured reasons rather than taste. This
 * deployment does not serve static files at all - every unknown path comes back as the app itself,
 * which turned the file reference into a broken image - and the paths that do have a file behind them
 * are served with a year-long shared cache under a fixed name, so a redrawn mark would sit unseen
 * behind the old one. Six lines of SVG cost less than either problem.
 *
 * The Q takes its colour from its surroundings so it reads on the black sidebar the way the app draws
 * it, and the tail is the brand gold, always.
 */
export default function QualsMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Quals"
    >
      <circle cx="31" cy="28" r="17" fill="none" stroke="currentColor" strokeWidth={8.5} />
      <rect
        x="33"
        y="38"
        width="26"
        height="9"
        rx="4.5"
        transform="rotate(45 46 42.5)"
        fill="#ffc400"
      />
    </svg>
  );
}
