/**
 * Search Bar Component
 * Mobile-optimized search input for articles
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "~/components/ui/input";
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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setShowSuggestions(isFocused && suggestions.length > 0 && value.length > 0);
  }, [isFocused, suggestions.length, value.length]);

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
        {/* Search input */}
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : (
              <Search className="h-4 w-4 text-gray-400" />
            )}
          </div>

          <Input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              // Delay hiding suggestions to allow clicks
              setTimeout(() => setIsFocused(false), 150);
            }}
            placeholder={placeholder}
            className="border-gray-600 bg-gray-700 py-3 pr-10 pl-10 text-white placeholder:text-gray-400"
          />

          {/* Clear button */}
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 h-full w-10 text-gray-400 hover:bg-transparent hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {/* Search suggestions */}
      {showSuggestions && (
        <div className="bg-card absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-700 shadow-lg">
          {suggestions.map((suggestion, index) => (
            <Button
              key={index}
              variant="ghost"
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full justify-start border-b border-gray-700 px-4 py-3 text-left text-sm text-gray-300 first:rounded-t-lg last:rounded-b-lg last:border-b-0 hover:bg-gray-700"
            >
              <Search className="mr-3 h-4 w-4 text-gray-400" />
              <span>{suggestion}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
