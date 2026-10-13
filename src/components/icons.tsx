import type { SVGProps } from 'react';

/** Small inline icon set (24px grid, 2px stroke). No icon font, works offline. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 22, ...rest }: IconProps) {
  return { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...rest };
}

export const IconHome = (p: IconProps) => <svg {...base(p)}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></svg>;
export const IconPlus = (p: IconProps) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>;
export const IconReport = (p: IconProps) => <svg {...base(p)}><path d="M7 3.5h7l4 4v13H7z" /><path d="M14 3.5v4h4M10 12h5M10 15.5h5" /></svg>;
export const IconSettings = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></svg>;
export const IconCamera = (p: IconProps) => <svg {...base(p)}><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>;
export const IconPin = (p: IconProps) => <svg {...base(p)}><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>;
export const IconCompass = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>;
export const IconCheck = (p: IconProps) => <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
export const IconX = (p: IconProps) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const IconAlert = (p: IconProps) => <svg {...base(p)}><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></svg>;
export const IconChevron = (p: IconProps) => <svg {...base(p)}><path d="m9 5.5 6.5 6.5L9 18.5" /></svg>;
export const IconBack = (p: IconProps) => <svg {...base(p)}><path d="M15 5.5 8.5 12 15 18.5" /></svg>;
export const IconTrash = (p: IconProps) => <svg {...base(p)}><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></svg>;
export const IconNavigate = (p: IconProps) => <svg {...base(p)}><path d="M20.5 3.5 3.5 10.5l7 2.5 2.5 7z" /></svg>;
export const IconWrench = (p: IconProps) => <svg {...base(p)}><path d="M14.5 6.5a4 4 0 0 0 5.2 5.2L12 19.4a2 2 0 0 1-2.8-2.8z" /><path d="M14.5 6.5 17 4l3 3-2.5 2.5" /></svg>;
export const IconImages = (p: IconProps) => <svg {...base(p)}><rect x="3" y="5" width="13" height="13" rx="1.5" /><path d="M8 3h13v13M3 15l4-4 4 4 2-2 3 3" /></svg>;
export const IconLogout = (p: IconProps) => <svg {...base(p)}><path d="M14 4.5H5v15h9M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" /></svg>;
export const IconKey = (p: IconProps) => <svg {...base(p)}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5" /></svg>;
export const IconSearch = (p: IconProps) => <svg {...base(p)}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5.5 5.5" /></svg>;
export const IconMap = (p: IconProps) => <svg {...base(p)}><path d="M3.5 6.5 9 4l6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></svg>;
export const IconList = (p: IconProps) => <svg {...base(p)}><path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M3.5 6.5h.1M3.5 12h.1M3.5 17.5h.1" /></svg>;
export const IconRotateRight = (p: IconProps) => <svg {...base(p)}><path d="M19 12a7 7 0 1 1-2.1-5" /><path d="M19.5 3.5V8H15" /></svg>;
export const IconRotateLeft = (p: IconProps) => <svg {...base(p)}><path d="M5 12a7 7 0 1 0 2.1-5" /><path d="M4.5 3.5V8H9" /></svg>;
export const IconRefresh = (p: IconProps) => <svg {...base(p)}><path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5" /><path d="M5 3v4h4M19 21v-4h-4" /></svg>;
export const IconHelp = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.1" /></svg>;
export const IconArrowUp = (p: IconProps) => <svg {...base(p)}><path d="M12 20V5M6 11l6-6 6 6" /></svg>;
export const IconUser = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3" /></svg>;
export const IconCheckCircle = (p: IconProps) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.8 2.8L16.2 9.6" /></svg>;
export const IconFilter = (p: IconProps) => <svg {...base(p)}><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
export const IconMail = (p: IconProps) => <svg {...base(p)}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>;
export const IconLock = (p: IconProps) => <svg {...base(p)}><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>;
