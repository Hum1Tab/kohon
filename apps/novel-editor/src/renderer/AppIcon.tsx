import { useId, type ReactNode, type SVGProps } from "react";

export type IconName =
  | "logo" | "files" | "lens" | "search" | "history" | "settings" | "layout"
  | "sun" | "moon" | "new" | "open" | "checkpoint" | "export" | "add"
  | "import" | "focus" | "panel" | "edit" | "close" | "check"
  | "splitRight" | "splitDown" | "more";

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number | string;
  tile?: boolean;
  title?: string;
}

const paths: Record<Exclude<IconName, "logo">, ReactNode> = {
  files: <><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H14l5 5v8.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5Z" /><path d="M14 4v5h5M8.5 13h7M8.5 16h5" /></>,
  lens: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z" /><path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.5 4.5" /></>,
  history: <><path d="M4 11a8 8 0 1 0 2.4-5.7" /><path d="M4 5v6h6M12 7v5l3.5 2" /></>,
  settings: <><path d="m12 3 1.2 2.1 2.3.5 2-1.1 1.9 1.9-1.1 2 .5 2.3L21 12l-2.1 1.2-.5 2.3 1.1 2-1.9 1.9-2-1.1-2.3.5L12 21l-1.2-2.1-2.3-.5-2 1.1-1.9-1.9 1.1-2L5.2 13 3 12l2.2-1.1.5-2.3-1.1-2 1.9-1.9 2 1.1 2.3-.5Z" /><circle cx="12" cy="12" r="3" /></>,
  layout: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M9 11h11" /></>,
  sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M19.5 15.2A7.8 7.8 0 0 1 8.8 4.5 8.2 8.2 0 1 0 19.5 15.2Z" />,
  new: <><path d="M5 4.5h9l5 5v10H5Z" /><path d="M14 4.5v5h5M12 12v6M9 15h6" /></>,
  open: <><path d="M3.5 6.5h6l1.8 2H20a1 1 0 0 1 1 1v8.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V7a.5.5 0 0 1 .5-.5Z" /><path d="M3.5 9h17" /></>,
  checkpoint: <><path d="M6 4h12v17l-6-3-6 3Z" /><path d="m9 11 2 2 4-4" /></>,
  export: <><path d="M12 15V3M8 7l4-4 4 4M5 12v7h14v-7" /></>,
  add: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8v8M8 12h8" /></>,
  import: <><path d="M12 3v12M8 11l4 4 4-4M5 14v5h14v-5" /></>,
  focus: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /><circle cx="12" cy="12" r="3" /></>,
  panel: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M8.5 4v16M12 8h5M12 12h5M12 16h3" /></>,
  edit: <><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5Z" /><path d="m13.5 7 3.5 3.5" /></>,
  close: <><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6M15 9l-6 6" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12 2.7 2.7L16.5 9" /></>,
  splitRight: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M12 4v16" /></>,
  splitDown: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 12h17" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>
};

export function AppIcon({ name, size = 20, tile = false, title, className, ...props }: AppIconProps) {
  const id = useId().replace(/:/gu, "");
  const label = title ?? (name === "logo" ? "KOHON" : undefined);
  return <svg
    {...props}
    className={className}
    width={size}
    height={size}
    viewBox={tile ? "0 0 64 64" : "0 0 24 24"}
    fill="none"
    stroke="currentColor"
    strokeWidth={tile ? 0 : 1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label ? "img" : "presentation"}
    aria-hidden={label ? undefined : true}
    aria-label={label}
  >
    {label && <title>{label}</title>}
    {tile ? <>
      <defs>
        <linearGradient id={`app-icon-bg-${id}`} x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#3f7164" /><stop offset="1" stopColor="#203f38" /></linearGradient>
        <filter id={`app-icon-shadow-${id}`} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#10231f" floodOpacity=".3" /></filter>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="17" fill={`url(#app-icon-bg-${id})`} filter={`url(#app-icon-shadow-${id})`} />
      <g filter={`url(#app-icon-shadow-${id})`}>
        <path d="M14 17c7-2 13-.5 18 4v28c-5-4-11-5.5-18-3.5V17Z" fill="#fffaf0" />
        <path d="M50 17c-7-2-13-.5-18 4v28c5-4 11-5.5 18-3.5V17Z" fill="#f1e5cf" />
        <path d="M32 21v28" stroke="#d5c4a7" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18 25h9M18 30h10M18 35h8" stroke="#8c8172" strokeWidth="1.5" strokeLinecap="round" opacity=".72" />
      </g>
      <circle cx="43" cy="31" r="8" fill="#d49a48" stroke="#fff7e7" strokeWidth="2" />
      <circle cx="43" cy="31" r="4" fill="#315d51" />
      <path d="m49 37 8 8" stroke="#d49a48" strokeWidth="4" strokeLinecap="round" />
    </> : name === "logo" ? <><path d="M3 6c4-1.4 7-.5 9 2.2V20c-2.4-2.1-5.4-2.8-9-1.7V6ZM21 6c-4-1.4-7-.5-9 2.2V20c2.4-2.1 5.4-2.8 9-1.7V6Z" /><circle cx="17" cy="11" r="3" /><path d="m19.2 13.2 2.8 2.8" /></> : paths[name]}
  </svg>;
}
