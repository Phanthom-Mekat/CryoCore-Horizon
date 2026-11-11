/** The CryoCore Horizon mark: radar wavefronts rising over the ice horizon. Same drawing as app/icon.svg and the OG image. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden="true">
      <path d="M4 22h24M12.5 26h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 22a7 7 0 0 1 14 0" stroke="var(--ice)" strokeWidth="2" />
      <path d="M5 22a11 11 0 0 1 22 0" stroke="var(--ice)" strokeWidth="1.5" opacity=".5" />
    </svg>
  );
}
