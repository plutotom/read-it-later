/**
 * Folder Sidebar Component
 * Mobile-optimized folder navigation sidebar
 */

"use client";

import { type Folder } from "~/types/folder";
import { useState } from "react";

interface FolderSidebarProps {
  folders: Folder[];
  selectedFolderId?: string | null;
  onFolderSelect: (folderId: string | null) => void;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onEditFolder?: (folderId: string, name: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function FolderSidebar({
  folders,
  selectedFolderId,
  onFolderSelect,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  isOpen,
  onClose,
}: FolderSidebarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreateFolder = () => {
    if (!newFolderName.trim() || !onCreateFolder) return;

    onCreateFolder(newFolderName.trim());
    setNewFolderName("");
    setShowCreateDialog(false);
  };

  const handleEditFolder = (folderId: string) => {
    if (!editingName.trim() || !onEditFolder) return;

    onEditFolder(folderId, editingName.trim());
    setEditingFolderId(null);
    setEditingName("");
  };

  const startEditing = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
  };

  const cancelEditing = () => {
    setEditingFolderId(null);
    setEditingName("");
  };

  // Build folder tree
  const buildFolderTree = (parentId: string | null = null): Folder[] => {
    return folders
      .filter((folder) => folder.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const FolderItem = ({
    folder,
    level = 0,
  }: {
    folder: Folder;
    level?: number;
  }) => {
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folders.some((f) => f.parentId === folder.id);
    const [isExpanded, setIsExpanded] = useState(true);

    return (
      <div>
        <div
          className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors ${
            isSelected
              ? "bg-blue-100 text-blue-700"
              : "text-gray-700 hover:bg-gray-100"
          }`}
          style={{ paddingLeft: `${0.75 + level * 1.5}rem` }}
        >
          <div className="flex min-w-0 flex-1 items-center">
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="mr-1 rounded p-0.5 hover:bg-gray-200"
              >
                <svg
                  className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}

            <svg
              className="mr-2 h-4 w-4 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>

            {editingFolderId === folder.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditFolder(folder.id);
                  if (e.key === "Escape") cancelEditing();
                }}
                onBlur={() => handleEditFolder(folder.id)}
                className="flex-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-sm focus:ring-1 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
            ) : (
              <span
                onClick={() => onFolderSelect(folder.id)}
                className="flex-1 truncate text-sm font-medium"
              >
                {folder.name}
              </span>
            )}

            <span className="ml-2 text-xs text-gray-500">
              {folder.articleCount}
            </span>
          </div>

          {/* Folder actions */}
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                startEditing(folder);
              }}
              className="rounded p-1 text-gray-400 hover:text-gray-600"
              title="Edit folder"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>

            {!folder.isDefault && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete folder "${folder.name}"?`)) {
                    onDeleteFolder?.(folder.id);
                  }
                }}
                className="rounded p-1 text-gray-400 hover:text-red-600"
                title="Delete folder"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Child folders */}
        {hasChildren && isExpanded && (
          <div>
            {buildFolderTree(folder.id).map((childFolder) => (
              <FolderItem
                key={childFolder.id}
                folder={childFolder}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="bg-opacity-50 fixed inset-0 z-40 bg-black lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-80 transform border-r border-gray-200 bg-white transition-transform duration-300 lg:relative lg:transform-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900">Folders</h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 lg:hidden"
            >
              <svg
                className="h-5 w-5"
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
          </div>

          {/* Folder list */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* All Articles */}
            <div
              className={`mb-2 flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                selectedFolderId === null
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onFolderSelect(null)}
            >
              <div className="flex items-center">
                <svg
                  className="mr-2 h-4 w-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 7a2 2 0 012-2h4l2 2h4a1 1 0 011 1v1M5 7v4"
                  />
                </svg>
                <span className="text-sm font-medium">All Articles</span>
              </div>
              <span className="text-xs text-gray-500">
                {folders.reduce((sum, folder) => sum + folder.articleCount, 0)}
              </span>
            </div>

            {/* Folder tree */}
            <div className="space-y-1">
              {buildFolderTree().map((folder) => (
                <div key={folder.id} className="group">
                  <FolderItem folder={folder} />
                </div>
              ))}
            </div>
          </div>

          {/* Create folder button */}
          {onCreateFolder && (
            <div className="border-t border-gray-200 p-4">
              <button
                onClick={() => setShowCreateDialog(true)}
                className="flex w-full items-center justify-center rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                New Folder
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create folder dialog */}
      {showCreateDialog && (
        <div className="bg-opacity-50 fixed inset-0 z-60 flex items-center justify-center bg-black p-4">
          <div className="w-full max-w-md rounded-lg bg-white">
            <div className="p-4">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">
                Create New Folder
              </h3>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") setShowCreateDialog(false);
                }}
                placeholder="Folder name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="mt-4 flex justify-end space-x-2">
                <button
                  onClick={() => setShowCreateDialog(false)}
                  className="rounded bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateFolder}
                  disabled={!newFolderName.trim()}
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
