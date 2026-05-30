"use client";

import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Copy, Check, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "~/hooks/use-toast";

export function ApiKeysSettings() {
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [manifestUrl, setManifestUrl] = useState("/api/para/manifest");

  const [copiedTarget, setCopiedTarget] = useState<"manifest" | "key" | null>(
    null,
  );

  const utils = api.useUtils();
  const { data: keys = [], isLoading } = api.apiKey.list.useQuery();

  useEffect(() => {
    setManifestUrl(`${window.location.origin}/api/para/manifest`);
  }, []);

  const createKey = api.apiKey.create.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key);
      setLabel("");
      void utils.apiKey.list.invalidate();
    },
  });

  const revokeKey = api.apiKey.revoke.useMutation({
    onSuccess: () => {
      void utils.apiKey.list.invalidate();
    },
  });

  const copyToClipboard = async (
    text: string,
    target: "manifest" | "key",
    label: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget(null), 2000);
      toast({
        title: "Copied to clipboard",
        description: `${label} is ready to paste.`,
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Copy failed",
        description: "Could not access your clipboard. Copy the text manually.",
      });
    }
  };

  return (
    <Card className="bg-card mt-6 border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <KeyRound className="h-5 w-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Create keys for your Para e-reader and other integrations. Use{" "}
          <code className="text-xs">Authorization: Bearer &lt;key&gt;</code> on
          device requests.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-white">Manifest URL</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={manifestUrl}
              className="border-gray-600 bg-gray-900 font-mono text-xs text-gray-200"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="shrink-0 border-gray-600"
              aria-label="Copy manifest URL"
              onClick={() =>
                void copyToClipboard(
                  manifestUrl,
                  "manifest",
                  "Manifest URL",
                )
              }
            >
              {copiedTarget === "manifest" ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            Set this URL on your device, plus an API key below.
          </p>
        </div>

        {newKey && (
          <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4">
            <p className="text-sm font-medium text-amber-200">
              Copy your new API key now — it won&apos;t be shown again.
            </p>
            <div className="mt-2 flex gap-2">
              <Input
                readOnly
                value={newKey}
                className="border-gray-600 bg-gray-900 font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copy API key"
                onClick={() =>
                  void copyToClipboard(newKey, "key", "API key")
                }
              >
                {copiedTarget === "key" ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-gray-400"
              onClick={() => setNewKey(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Key label (e.g. Heltec bedroom)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="border-gray-600 bg-gray-900"
          />
          <Button
            type="button"
            disabled={!label.trim() || createKey.isPending}
            onClick={() => createKey.mutate({ label: label.trim() })}
          >
            {createKey.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create
              </>
            )}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-400">No API keys yet.</p>
        ) : (
          <ul className="space-y-2">
            {keys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-gray-700 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-white">{key.label}</p>
                  <p className="font-mono text-xs text-gray-400">
                    ril_{key.keyPrefix}…
                    {key.revokedAt ? " · revoked" : ""}
                  </p>
                  {key.lastUsedAt && (
                    <p className="text-xs text-gray-500">
                      Last used{" "}
                      {new Date(key.lastUsedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                {!key.revokedAt && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-400 hover:text-red-300"
                    onClick={() => {
                      if (confirm(`Revoke API key "${key.label}"?`)) {
                        revokeKey.mutate({ id: key.id });
                      }
                    }}
                    disabled={revokeKey.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
