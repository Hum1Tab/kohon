import { type ReactNode, type SVGProps } from "react";

export type IconName =
  | "story" | "logo" | "files" | "lens" | "search" | "history" | "settings" | "layout"
  | "sun" | "moon" | "new" | "open" | "checkpoint" | "export" | "add"
  | "import" | "focus" | "panel" | "edit" | "close" | "check"
  | "splitRight" | "splitDown" | "more" | "menu" | "commands";

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number | string;
  tile?: boolean;
  title?: string;
}

const paths: Record<Exclude<IconName, "logo">, ReactNode> = {
  story: <><path d="M3 19h18M3 19V4M5 14l5-7 4 5 6-8M5 17l5-5 4 4 6-6" /><circle cx="10" cy="7" r="1.5" /></>,
  files: <><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H14l5 5v8.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5Z" /><path d="M14 4v5h5M8.5 13h7M8.5 16h5" /></>,
  lens: <><rect x="3" y="9" width="7" height="7" rx="2.5" /><rect x="14" y="9" width="7" height="7" rx="2.5" /><path d="M10 11h4M3 11l1-6M21 11l-1-6" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.5 4.5" /></>,
  history: <><path d="M4 11a8 8 0 1 0 2.4-5.7" /><path d="M4 5v6h6M12 7v5l3.5 2" /></>,
  settings: <><path d="M9.48 5.58Q9.95 5.31 10.08 4.77L10.42 3.4Q10.55 2.86 11.1 2.86L12.9 2.86Q13.45 2.86 13.58 3.4L13.92 4.77Q14.05 5.31 14.52 5.58L16.3 6.61Q16.77 6.88 17.3 6.73L18.66 6.33Q19.19 6.18 19.46 6.66L20.36 8.21Q20.64 8.69 20.24 9.07L19.22 10.04Q18.82 10.43 18.82 10.98L18.82 13.02Q18.82 13.57 19.22 13.96L20.24 14.93Q20.64 15.31 20.36 15.79L19.46 17.34Q19.19 17.82 18.66 17.67L17.3 17.27Q16.77 17.12 16.3 17.39L14.52 18.42Q14.05 18.69 13.92 19.23L13.58 20.6Q13.45 21.14 12.9 21.14L11.1 21.14Q10.55 21.14 10.42 20.6L10.08 19.23Q9.95 18.69 9.48 18.42L7.7 17.39Q7.23 17.12 6.7 17.27L5.34 17.67Q4.81 17.82 4.54 17.34L3.64 15.79Q3.36 15.31 3.76 14.93L4.78 13.96Q5.18 13.57 5.18 13.02L5.18 10.98Q5.18 10.43 4.78 10.04L3.76 9.07Q3.36 8.69 3.64 8.21L4.54 6.66Q4.81 6.18 5.34 6.33L6.7 6.73Q7.23 6.88 7.7 6.61Z" /><circle cx="12" cy="12" r="3" /></>,
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
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  commands: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></>
};

export function AppIcon({ name, size = 20, tile = false, title, className, ...props }: AppIconProps) {
  const logo = name === "logo";
  const label = title ?? (name === "logo" ? "KOHON" : undefined);
  return <svg
    {...props}
    className={[logo ? "kohon-logo" : "", tile ? "kohon-logo-tile" : "", className].filter(Boolean).join(" ")}
    width={size}
    height={size}
    viewBox={logo ? "0 0 1024 1024" : "0 0 24 24"}
    fill="none"
    stroke="currentColor"
    strokeWidth={logo ? 0 : 1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label ? "img" : "presentation"}
    aria-hidden={label ? undefined : true}
    aria-label={label}
  >
    {label && <title>{label}</title>}
    {logo ? <image href={new URL("../../build/icon.svg", import.meta.url).href} width="1024" height="1024" /> : paths[name]}
  </svg>;
}
