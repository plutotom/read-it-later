/**
 * Search Bar Component
 * Mobile-optimized search input for articles
 */

"use client";

import { useState, useEffect, useRef } from "react";

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
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
            ) : (
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            )}
          </div>

          <input
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
            className="w-full rounded-lg border border-gray-600 bg-gray-700 py-3 pr-10 pl-10 text-sm text-white placeholder:text-gray-400 transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />

          {/* Clear button */}
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Search suggestions */}
      {showSuggestions && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full border-b border-gray-700 px-4 py-3 text-left text-sm text-gray-300 first:rounded-t-lg last:rounded-b-lg last:border-b-0 hover:bg-gray-700"
            >
              <div className="flex items-center">
                <svg
                  className="mr-3 h-4 w-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <span>{suggestion}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
