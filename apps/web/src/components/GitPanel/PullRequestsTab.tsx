import { type ThreadId } from "@t3tools/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLinkIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestIcon,
  LoaderIcon,
} from "lucide-react";
import { memo, useState } from "react";

import { gitPullRequestsQueryOptions } from "~/lib/gitReactQuery";
import { ensureNativeApi } from "~/nativeApi";

type PrStateFilter = "open" | "closed" | "all";

const STATE_FILTERS: { value: PrStateFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

function PrStateIcon({ state }: { state: "open" | "closed" | "merged" }) {
  switch (state) {
    case "open":
      return <GitPullRequestIcon className="size-3 shrink-0 text-success" />;
    case "merged":
      return <GitMergeIcon className="size-3 shrink-0 text-purple-500" />;
    case "closed":
      return <GitPullRequestClosedIcon className="size-3 shrink-0 text-destructive" />;
  }
}

function PullRequestRow({
  number: prNumber,
  title,
  url,
  state,
  headBranch,
  authorLogin,
}: {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  headBranch: string;
  authorLogin: string;
}) {
  const handleOpenUrl = () => {
    const api = ensureNativeApi();
    void api.shell.openExternal(url);
  };

  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/40">
      <PrStateIcon state={state} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-muted-foreground">#{prNumber}</span>
          <span className="truncate font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="truncate font-mono">{headBranch}</span>
          {authorLogin && (
            <>
              <span>&middot;</span>
              <span>{authorLogin}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          className="rounded p-0.5 hover:bg-accent"
          onClick={handleOpenUrl}
          title="Open in browser"
        >
          <ExternalLinkIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}

export default memo(function PullRequestsTab({
  gitCwd,
  threadId: _threadId,
}: {
  gitCwd: string | null;
  threadId: ThreadId;
}) {
  const [stateFilter, setStateFilter] = useState<PrStateFilter>("open");

  const { data, isLoading, isError } = useQuery(gitPullRequestsQueryOptions(gitCwd, stateFilter));

  if (!gitCwd) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
        No git repository available.
      </div>
    );
  }

  const pullRequests = data?.pullRequests ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <div className="flex gap-0.5">
          {STATE_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStateFilter(filter.value)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                stateFilter === filter.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pull request list */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Failed to load pull requests. Is the GitHub CLI (`gh`) installed and authenticated?
          </p>
        )}

        {!isLoading &&
          !isError &&
          pullRequests.map((pr) => (
            <PullRequestRow
              key={pr.number}
              number={pr.number}
              title={pr.title}
              url={pr.url}
              state={pr.state}
              headBranch={pr.headBranch}
              authorLogin={pr.authorLogin}
            />
          ))}

        {!isLoading && !isError && pullRequests.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            No {stateFilter === "all" ? "" : stateFilter} pull requests found.
          </p>
        )}
      </div>
    </div>
  );
});
