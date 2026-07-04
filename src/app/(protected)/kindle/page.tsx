"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MoreVertical,
} from "lucide-react";
import { api } from "~/trpc/react";
import { Layout } from "~/app/_components/layout";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { toast } from "~/hooks/use-toast";
import {
  AMAZON_APPROVED_SENDERS_URL,
  AMAZON_MANAGE_CONTENT_URL,
} from "~/lib/kindleConstants";
import { cn } from "~/lib/utils";

function StepNumber({ children }: { children: number }) {
  return (
    <span className="bg-foreground text-background inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
      {children}
    </span>
  );
}

function SetupCard({
  step,
  title,
  description,
  children,
  className,
}: {
  step: number;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-rule shadow-[var(--shadow-soft)]", className)}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center gap-3">
          <StepNumber>{step}</StepNumber>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
        </div>
        <CardDescription className="text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      {children ? <CardContent className="pt-0">{children}</CardContent> : null}
    </Card>
  );
}

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  } catch {
    toast({
      variant: "destructive",
      title: "Could not copy",
      description: "Please copy the text manually.",
    });
  }
}

export default function KindleSetupPage() {
  const router = useRouter();
  const utils = api.useUtils();
  const { data: setup, isLoading } = api.kindle.getSetup.useQuery();
  const [emailInput, setEmailInput] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  const saveEmail = api.kindle.saveEmail.useMutation({
    onSuccess: (data) => {
      void utils.kindle.getSetup.invalidate();
      setIsEditingEmail(false);
      setEmailInput("");
      toast({
        title: "Kindle connected",
        description: data.kindleEmail
          ? `Deliveries will go to ${data.kindleEmail}.`
          : "Your Kindle email is saved.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Could not save Kindle email",
        description: error.message,
      });
    },
  });

  const clearEmail = api.kindle.clearEmail.useMutation({
    onSuccess: () => {
      void utils.kindle.getSetup.invalidate();
      setIsEditingEmail(true);
      toast({ title: "Kindle email removed" });
    },
  });

  const sendTest = api.kindle.sendTest.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Test document sent",
        description:
          result.mode === "mock"
            ? "Mock mode — configure RESEND_API_KEY to send real email."
            : "Check your Kindle library in a few minutes.",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Test send failed",
        description: error.message,
      });
    },
  });

  const showEmailForm = isEditingEmail || !setup?.isConnected;

  return (
    <Layout pageTitle="Send to Kindle">
      <div className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full px-2"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>

          <h1 className="text-base font-semibold">Send to Kindle</h1>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!setup?.isConnected || sendTest.isPending}
                onClick={() => sendTest.mutate()}
              >
                Send test document
              </DropdownMenuItem>
              {setup?.isConnected ? (
                <DropdownMenuItem
                  onClick={() => clearEmail.mutate()}
                  className="text-red-400"
                >
                  Disconnect Kindle
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <SetupCard
              step={1}
              title="Open Amazon settings"
              description='Go to your Amazon "Manage Your Content and Devices" page. Expand "Personal Document Settings".'
            >
              <Button variant="link" className="h-auto p-0 text-sm" asChild>
                <a
                  href={AMAZON_MANAGE_CONTENT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Amazon Settings
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </SetupCard>

            <SetupCard
              step={2}
              title="Add approved email sender"
              description="This allows us to deliver articles to Kindle on your behalf."
            >
              <div className="bg-muted/50 border-rule flex items-center justify-between gap-3 rounded-xl border px-3 py-3">
                <code className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                  {setup?.senderEmail}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() =>
                    void copyText(setup?.senderEmail ?? "", "Sender email")
                  }
                  aria-label="Copy sender email"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
                Paste this into{" "}
                <a
                  href={AMAZON_APPROVED_SENDERS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline underline-offset-2"
                >
                  Approved Personal Document E-mail List
                </a>
                .
              </p>
            </SetupCard>

            <SetupCard
              step={3}
              title="Enter your Kindle email"
              description="Find your personal Kindle email address and paste it here."
            >
              {showEmailForm ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEmail.mutate({ kindleEmail: emailInput });
                  }}
                >
                  <Input
                    type="email"
                    placeholder="you@kindle.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    autoComplete="email"
                    className="h-11"
                  />
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!emailInput.trim() || saveEmail.isPending}
                  >
                    {saveEmail.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Save Kindle email"
                    )}
                  </Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Connected</p>
                      <p className="text-muted-foreground text-sm">
                        {setup?.kindleEmail}
                      </p>
                    </div>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
                      <Check className="h-4 w-4" />
                    </span>
                  </div>
                  <Button
                    variant="link"
                    className="h-auto p-0 text-sm"
                    onClick={() => {
                      setEmailInput(setup?.kindleEmail ?? "");
                      setIsEditingEmail(true);
                    }}
                  >
                    Change Kindle email
                  </Button>
                </div>
              )}
            </SetupCard>

            {!setup?.emailConfigured ? (
              <p className="text-muted-foreground text-center text-xs leading-relaxed">
                Prototype mode: emails are logged but not sent until{" "}
                <code className="text-foreground">RESEND_API_KEY</code> is
                configured.
              </p>
            ) : null}

            {setup?.isConnected ? (
              <div className="pt-2 text-center">
                <Button variant="outline" className="rounded-full" asChild>
                  <Link href="/">Back to library</Link>
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Layout>
  );
}
