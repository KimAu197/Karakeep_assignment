import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import LoadingSpinner from "@/components/ui/spinner";
import useRelativeTime from "@/lib/hooks/relative-time";
import { useTranslation } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronRight } from "lucide-react";

import type { ZBookmarkHistoryEntry } from "@karakeep/shared/types/bookmarkHistory";
import { useTRPC } from "@karakeep/shared-react/trpc";

interface HistoryChange {
  changeId: string;
  createdAt: Date;
  rows: ZBookmarkHistoryEntry[];
}

/** One save writes one row per field; this puts them back together, keeping the server's newest-first order. */
function groupByChange(rows: ZBookmarkHistoryEntry[]): HistoryChange[] {
  const changes = new Map<string, HistoryChange>();
  for (const row of rows) {
    const change = changes.get(row.changeId);
    if (change) {
      change.rows.push(row);
    } else {
      changes.set(row.changeId, {
        changeId: row.changeId,
        createdAt: row.createdAt,
        rows: [row],
      });
    }
  }
  return [...changes.values()];
}

function HistoryValue({
  value,
  className,
}: {
  value: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  if (value === null || value === "") {
    return (
      <span className="italic text-muted-foreground">
        {t("preview.history.empty_value")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "line-clamp-3 min-w-0 whitespace-pre-wrap break-words",
        className,
      )}
    >
      {value}
    </span>
  );
}

function HistoryEntry({ change }: { change: HistoryChange }) {
  const { t, i18n } = useTranslation();
  const { fromNow, localCreatedAt } = useRelativeTime(
    change.createdAt,
    i18n.language,
  );

  return (
    <li className="flex flex-col gap-2">
      <time
        dateTime={change.createdAt.toISOString()}
        title={localCreatedAt}
        className="text-xs text-muted-foreground"
      >
        {fromNow}
      </time>
      {change.rows.map((row) => (
        <div key={row.id} className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium">
            {t(`preview.history.fields.${row.field}`)}
          </span>
          <p className="flex min-w-0 text-muted-foreground">
            <span className="sr-only">{t("preview.history.before")}: </span>
            <HistoryValue value={row.oldValue} />
          </p>
          <p className="flex min-w-0 items-start gap-1.5">
            <ArrowRight
              aria-hidden
              className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
            />
            <span className="sr-only">{t("preview.history.after")}: </span>
            <HistoryValue value={row.newValue} />
          </p>
        </div>
      ))}
    </li>
  );
}

export default function HistoryBox({ bookmarkId }: { bookmarkId: string }) {
  const api = useTRPC();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);

  const { data, isPending, isError } = useQuery(
    api.bookmarks.getBookmarkHistory.queryOptions({ bookmarkId }),
  );
  const changes = data ? groupByChange(data.history) : [];

  let content;
  if (isPending) {
    content = (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <LoadingSpinner className="size-4" />
        {t("preview.history.loading")}
      </p>
    );
  } else if (isError) {
    content = (
      <p className="text-xs text-destructive">
        {t("preview.history.load_failed")}
      </p>
    );
  } else if (changes.length === 0) {
    content = (
      <p className="text-xs text-muted-foreground">
        {t("preview.history.none_yet")}
      </p>
    );
  } else {
    content = (
      <ol className="flex flex-col gap-4">
        {changes.map((change) => (
          <HistoryEntry key={change.changeId} change={change} />
        ))}
      </ol>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 max-sm:min-h-11 [@media(pointer:coarse)]:min-h-11">
        <span className="flex items-center gap-2">
          {t("preview.history.title")}
          {changes.length > 0 && (
            <span className="font-normal tabular-nums">{changes.length}</span>
          )}
        </span>
        <ChevronRight
          className={cn("size-4 transition-transform", isOpen && "rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="py-3 text-sm">
        {content}
      </CollapsibleContent>
    </Collapsible>
  );
}
