import type { ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";

export type GitPanelMode = "sheet" | "sidebar";

function getHeaderRowClassName(mode: GitPanelMode) {
  const shouldUseDragRegion = isElectron && mode !== "sheet";
  return cn(
    "flex items-center justify-between gap-2 px-3",
    shouldUseDragRegion ? "drag-region h-[52px] border-b border-border" : "h-11",
  );
}

export function GitPanelShell(props: {
  mode: GitPanelMode;
  header: ReactNode;
  children: ReactNode;
}) {
  const shouldUseDragRegion = isElectron && props.mode !== "sheet";

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {shouldUseDragRegion ? (
        <div className={getHeaderRowClassName(props.mode)}>{props.header}</div>
      ) : (
        <div className="border-b border-border">
          <div className={getHeaderRowClassName(props.mode)}>{props.header}</div>
        </div>
      )}
      {props.children}
    </div>
  );
}
