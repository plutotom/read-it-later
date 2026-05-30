"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { Layout } from "~/app/_components/layout";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { AlertTriangle, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { PARA_SIZE_WARNING_BYTES } from "~/lib/paraConstants";
import { toast } from "~/hooks/use-toast";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ParaPage() {
  const utils = api.useUtils();
  const { data: exports = [], isLoading } = api.para.list.useQuery();
  const { data: totalBytes = 0 } = api.para.getTotalBytes.useQuery();

  const remove = api.para.remove.useMutation({
    onSuccess: (_data, variables) => {
      void utils.para.list.invalidate();
      void utils.para.getTotalBytes.invalidate();

      const removed = exports.find((item) => item.id === variables.exportId);
      if (removed?.articleId) {
        void utils.para.isOnPara.invalidate({ articleId: removed.articleId });
        void utils.para.getArticleStatuses.invalidate();
      }

      toast({
        title: "Removed from Para",
        description: removed
          ? `"${removed.title}" will be deleted from your device on the next sync.`
          : "Your device will delete this article on the next sync.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Could not remove from Para",
        description: "Something went wrong. Please try again.",
      });
    },
  });

  return (
    <Layout pageTitle="Para">
      <div className="container mx-auto max-w-3xl p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Para Device</h1>
          <p className="text-gray-400">
            Articles synced to your e-reader. Remove items here to free device
            storage on the next sync.
          </p>
        </div>

        <Card className="bg-card mb-6 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-white">Storage</CardTitle>
            <CardDescription>
              Total size of all Para exports:{" "}
              <span className="font-medium text-foreground">
                {formatBytes(totalBytes)}
              </span>
              {totalBytes > PARA_SIZE_WARNING_BYTES && (
                <span className="ml-2 text-amber-400">
                  — some articles exceed the 3 MB device warning threshold
                </span>
              )}
            </CardDescription>
          </CardHeader>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : exports.length === 0 ? (
          <Card className="bg-card border-gray-700">
            <CardContent className="py-12 text-center">
              <p className="text-gray-400">
                No articles on Para yet. Mark articles with &quot;Add to
                Para&quot; from your inbox or reader.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="divide-y divide-gray-700 rounded-lg border border-gray-700">
            {exports.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{item.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>{formatBytes(item.bytes)}</span>
                    <span>·</span>
                    <span>
                      Added {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    {item.isLarge && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-amber-400">
                          <AlertTriangle className="h-3 w-3" />
                          Over 3 MB
                        </span>
                      </>
                    )}
                    {!item.articleId && (
                      <>
                        <span>·</span>
                        <span className="text-gray-500">Source removed</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-gray-500">
                    {item.filename}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.articleId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="text-gray-400 hover:text-white"
                    >
                      <Link href={`/article/${item.articleId}`}>
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-400 hover:text-red-300"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Remove "${item.title}" from Para? Your device will delete it on the next sync.`,
                        )
                      ) {
                        remove.mutate({ exportId: item.id });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
