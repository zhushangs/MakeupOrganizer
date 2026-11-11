/** 踩雷 (not for me): a little round bomb with a lit fuse */
export function Bomb({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="10" cy="14.5" r="7" fill="currentColor" />
      <rect x="13.2" y="6.2" width="4.6" height="3.6" rx="0.8" transform="rotate(45 15.5 8)" fill="currentColor" />
      <path d="M17.3 6.2c.7-1.7 2-2.5 3.4-2.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M21.2 1.6l.4 1.3 1.3.4-1.3.4-.4 1.3-.4-1.3-1.3-.4 1.3-.4z" fill="#e8a33d" />
      <circle cx="7.4" cy="11.8" r="1.6" fill="#fff" opacity=".35" />
    </svg>
  )
}
