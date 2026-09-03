import type { ReactNode } from "react";

export function SafeText({ value, className }: { value: string; className?: string }): ReactNode {
  return <p {...(className === undefined ? {} : { className })}>{value}</p>;
}

