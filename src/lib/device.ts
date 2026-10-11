/** Non-identifying device/browser context stored with each capture. */
export function deviceMetadata(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string; mobile?: boolean } };
  return {
    user_agent: nav.userAgent.slice(0, 300),
    platform: nav.userAgentData?.platform ?? nav.platform ?? null,
    mobile: nav.userAgentData?.mobile ?? null,
    language: nav.language,
    screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio },
    screen_orientation: screen.orientation?.type ?? null,
    screen_angle: screen.orientation?.angle ?? null,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: nav.onLine,
    ...extra,
  };
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
