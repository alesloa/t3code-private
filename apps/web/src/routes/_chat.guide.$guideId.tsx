import { createFileRoute } from "@tanstack/react-router";

import GuideViewer from "../components/GuideViewer";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";

export const Route = createFileRoute("/_chat/guide/$guideId")({
  component: GuideViewerRoute,
});

function GuideViewerRoute() {
  const { guideId } = Route.useParams();

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
            </div>
          </header>
        )}
        <GuideViewer guideId={guideId} />
      </div>
    </SidebarInset>
  );
}
