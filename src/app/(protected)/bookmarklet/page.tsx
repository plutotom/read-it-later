import { BookmarkletInstructions } from "../../_components/bookmarklet-instructions";

export default function BookmarkletPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <BookmarkletInstructions />
      </div>
    </div>
  );
}
