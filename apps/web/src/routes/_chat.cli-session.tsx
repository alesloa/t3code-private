import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CliSessionView } from "../components/CliSessionView";
import { SidebarInset } from "../components/ui/sidebar";

const cliSessionSearchSchema = z.object({
  source: z.enum(["claude", "codex"]),
  filePath: z.string(),
  title: z.string().optional(),
});

function CliSessionRouteView() {
  const { source, filePath, title } = Route.useSearch();
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <CliSessionView source={source} filePath={filePath} title={title} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/cli-session")({
  component: CliSessionRouteView,
  validateSearch: cliSessionSearchSchema,
});
