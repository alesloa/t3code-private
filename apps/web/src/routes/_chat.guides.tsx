import { createFileRoute } from "@tanstack/react-router";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import GuidesSidebar from "../components/GuidesSidebar";
import { useGuideStore } from "../guideStore";

function GuidesRouteView() {
  const openGenerateDialog = useGuideStore((s) => s.openGenerateDialog);

  return (
    <SidebarInset className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <SidebarTrigger />
        <h1 className="text-sm font-medium">Guides</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <GuidesSidebar
          onRequestNewGuide={(projectCwd) => {
            openGenerateDialog(projectCwd ? { initialProjectCwd: projectCwd } : undefined);
          }}
        />
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/guides")({
  component: GuidesRouteView,
});
