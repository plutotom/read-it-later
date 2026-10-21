/**
 * Search Bar Component
 * Mobile-optimized search input for articles
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Search, X, Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: (value: string) => void;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  isLoading?: boolean;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "Search...",
  autoFocus = false,
  onSubmit,
  suggestions = [],
  onSuggestionClick,
  isLoading = false,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expanded = isHovered || isFocused || value.length > 0;

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setShowSuggestions(isFocused && suggestions.length > 0 && value.length > 0);
  }, [isFocused, suggestions.length, value.length]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(value);
    inputRef.current?.blur();
  };

  const handleSuggestionClick = (suggestion: string) => {
    onChange(suggestion);
    onSuggestionClick?.(suggestion);
    setShowSuggestions(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div
          className="relative"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            className={cn(
              "flex h-11 w-full cursor-text items-center gap-2 overflow-hidden rounded-lg border px-3 text-sm",
              "border-[var(--rule)] bg-[var(--background-deep)]",
              "md:h-9 md:px-2.5 md:transition-[width,background-color,border-color] md:duration-[320ms]",
              expanded
                ? "md:w-[min(100%,280px)] md:border-[var(--rule)] md:bg-[var(--background-deep)]"
                : "md:w-9 md:border-transparent md:bg-transparent",
            )}
            style={{
              transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {isLoading ? (
              <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Search className="text-muted-foreground h-4 w-4 shrink-0" />
            )}

            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setTimeout(() => setIsFocused(false), 150);
              }}
              placeholder={placeholder}
              className={cn(
                "text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none",
                "opacity-100",
                !expanded && "md:pointer-events-none md:opacity-0",
              )}
            />

            {value.length === 0 && (
              <span className="border-rule text-muted-foreground hidden shrink-0 rounded border px-1 py-0.5 text-[10px] tracking-widest md:inline">
                ⌘K
              </span>
            )}

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground h-7 w-7 shrink-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>

      {showSuggestions && (
        <div className="border-rule bg-surface absolute top-full right-0 left-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border shadow-[var(--shadow-soft)]">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="ghost"
              onClick={() => handleSuggestionClick(suggestion)}
              className="border-rule text-foreground-soft hover:bg-background-deep hover:text-foreground w-full justify-start border-b px-4 py-3 text-left text-sm first:rounded-t-2xl last:rounded-b-2xl last:border-b-0"
            >
              <Search className="text-muted-foreground mr-3 h-4 w-4" />
              <span>{suggestion}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
