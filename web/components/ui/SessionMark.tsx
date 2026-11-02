import s from "./ui.module.css";

/**
 * A session's icon (LSSessionMark in Core/PocketLiveShortly/LSLogo.swift): the
 * LS mark in a rounded square — green tint and a slow pulse while live, sunken
 * grey once ended. Geometry is BrandMark's (32 grid), cropped to the glyph.
 */
export default function SessionMark({ live, size = 22 }: { live: boolean; size?: number }) {
  return (
    <span
      className={`${s.mark}${live ? ` ${s.markLive}` : ""}`}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
      role="img"
      aria-label={live ? "LiveShortly session, live" : "LiveShortly session, ended"}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 19 17" aria-hidden>
        <rect x="0" y="1" width="6.5" height="15" rx="1.5" fill="currentColor" />
        <rect
          x="9.5"
          y="1"
          width="8.5"
          height="15"
          rx="1.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}
