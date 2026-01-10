/**
 * Rich Text Input Component
 * Uses Tiptap editor for rich text input with metadata auto-detection
 */

"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import { useEffect, useCallback } from "react";
import { Button } from "~/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Type,
} from "lucide-react";

interface RichTextInputProps {
  content: string;
  onContentChange: (content: string) => void;
  onMetadataDetected: (metadata: { title?: string; author?: string }) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function RichTextInput({
  content,
  onContentChange,
  onMetadataDetected,
  placeholder = "Paste your article content here...",
  disabled = false,
}: RichTextInputProps) {
  const editor = useEditor({
    extensions: [StarterKit, CharacterCount],
    content,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onContentChange(html);

      // Auto-detect metadata from content
      detectMetadata(html);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[200px] p-4 border rounded-md",
        placeholder,
      },
    },
  });

  // Auto-detect metadata from HTML content
  const detectMetadata = useCallback(
    (html: string) => {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;

      // Extract title from first h1 or first line
      let title: string | undefined;
      const h1 = tempDiv.querySelector("h1");
      if (h1) {
        title = h1.textContent?.trim();
      } else {
        // Get first line of text
        const firstText = tempDiv.textContent?.split("\n")[0]?.trim();
        if (firstText && firstText.length > 0 && firstText.length <= 100) {
          title = firstText;
        }
      }

      // Extract author from common patterns
      let author: string | undefined;
      const text = tempDiv.textContent || "";
      const authorPatterns = [
        /^By\s+([A-Za-z\s]+?)(?:\n|$)/m,
        /^Author:\s*([A-Za-z\s]+?)(?:\n|$)/m,
        /^Written by\s+([A-Za-z\s]+?)(?:\n|$)/m,
        /^By\s+([A-Za-z\s]+?)(?:\s*\|)/m,
      ];

      for (const pattern of authorPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          author = match[1].trim();
          break;
        }
      }

      // Only call callback if we detected something
      if (title || author) {
        onMetadataDetected({ title, author });
      }
    },
    [onMetadataDetected],
  );

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  if (!editor) {
    return null;
  }

  const ToolbarButton = ({
    onClick,
    isActive,
    children,
    title,
  }: {
    onClick: () => void;
    isActive?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-8 w-8 p-0"
    >
      {children}
    </Button>
  );

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 rounded-md border bg-gray-50 p-2">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          isActive={editor.isActive("heading", { level: 1 })}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          isActive={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Numbered List"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>

        <div className="mx-1 h-6 w-px bg-gray-300" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setParagraph().run()}
          isActive={editor.isActive("paragraph")}
          title="Paragraph"
        >
          <Type className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <div className="max-h-[400px] min-h-[200px] overflow-y-auto rounded-md border bg-white">
        <EditorContent editor={editor} />
      </div>

      {/* Character count */}
      <div className="text-right text-xs text-gray-500">
        {editor.storage.characterCount?.characters() || 0} characters
      </div>
    </div>
  );
}
