/** Shared CryoCore mark across the project and data workspaces. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
    <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".35" />
    <path d="M5.5 20.5h21" stroke="currentColor" strokeWidth="1.5" />
    <path d="M16 20.5 9 9.5" stroke="var(--ice)" strokeWidth="1.5" />
    <path d="M16 20.5l-4.2-6.6a8 8 0 0 1 8.4 0z" fill="var(--ice)" opacity=".35" />
  </svg>;
}
