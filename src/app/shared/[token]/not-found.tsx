export default function SharedArticleNotFound() {
  return (
    <div className="bg-background flex h-dvh items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="text-foreground mb-3 text-2xl font-medium tracking-tight">
          Article not found
        </h1>
        <p className="text-muted-foreground">
          This shared article may have been removed or the link is invalid.
        </p>
      </div>
    </div>
  );
}
