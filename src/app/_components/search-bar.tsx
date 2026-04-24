/**
 * Search Bar Component
 * Mobile-optimized search input for articles
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Search, X, Loader2 } from "lucide-react";

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
            className="flex h-9 cursor-text items-center gap-2 overflow-hidden rounded-lg px-2.5 text-sm transition-[width,background-color,border-color] duration-[320ms]"
            style={{
              width: expanded ? "min(100%, 280px)" : "36px",
              backgroundColor: expanded ? "var(--background-deep)" : "transparent",
              border: `1px solid ${expanded ? "var(--rule)" : "transparent"}`,
              transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
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
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              style={{
                opacity: expanded ? 1 : 0,
                pointerEvents: expanded ? "auto" : "none",
                transition: "opacity 220ms ease 80ms",
              }}
            />

            {value.length === 0 && (
              <span
                className="shrink-0 rounded border border-rule px-1 py-0.5 text-[10px] tracking-widest text-muted-foreground"
                style={{
                  opacity: expanded ? 1 : 0,
                  transition: "opacity 180ms ease",
                }}
              >
                ⌘K
              </span>
            )}

            {value && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleClear}
                className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute top-full right-0 left-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-rule bg-surface shadow-[var(--shadow-soft)]">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="ghost"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full justify-start border-b border-rule px-4 py-3 text-left text-sm text-foreground-soft first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 hover:bg-background-deep hover:text-foreground"
            >
              <Search className="mr-3 h-4 w-4 text-muted-foreground" />
              <span>{suggestion}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
