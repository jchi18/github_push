import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings, GitBranch, RefreshCw } from "lucide-react";
import { useGitHubStore, getFileCategory } from "../utils/DB_workspace_util";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { API_URL } from "app";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DB_filegrid as FileGrid, FileInfo, getRelativePath } from "./DB_filegrid";


import { DB_settings_dialog as SettingsDialog } from "./DB_settings_dialog";
import { DB_branch_dialog as BranchDialog } from "./DB_branch_dialog";


export function DB_workspace_comp() {
  const [isLoading, setIsLoading] = useState(false);
  const [isComparingFiles, setIsComparingFiles] = useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // File states
  const [selectedFiles, setSelectedFiles] = useState<FileInfo[]>([]);
  const [commitMessage, setCommitMessage] = useState("");

  const initialized = useRef(false);

  // GitHub store
  const {
    authenticate,
    loadSavedToken,
    fetchWorkspaceFiles,
    workspaceFiles,
    isAuthenticated,
    username,
    repositories,
    fetchRepositories,
    setSelectedRepo,
    selectedRepo,
    pushFiles,
    currentBranch,
    fetchBranches,
    fetchRepoFiles,
    comparisonFiles,
    branches,
    switchBranch
  } = useGitHubStore();

  // Initialize GitHub integration
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Load token first
        if (loadSavedToken) {
          await loadSavedToken();
        }
      } catch (error) {
        console.error("Failed to load token:", error);
        setError("Failed to load GitHub token");
      }

      // Always try to fetch workspace files
      try {
        if (fetchWorkspaceFiles) {
          await fetchWorkspaceFiles();
        }
      } catch (error) {
        console.error("Failed to fetch workspace files:", error);
        toast.error("Failed to load workspace files");
        setError("Failed to load workspace files");
      }
    };

    init().finally(() => setIsLoading(false));
  }, [loadSavedToken, fetchWorkspaceFiles]);

  // Fetch repositories when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchRepositories().catch((error) => {
        toast.error("Failed to fetch repositories");
        console.error("Fetch repos error:", error);
      });
    }
  }, [isAuthenticated, fetchRepositories]);

  // Fetch branches when repository is selected
  useEffect(() => {
    if (selectedRepo) {
      setIsComparingFiles(true);
      const initRepo = async () => {
        try {
          await fetchBranches();
          await fetchRepoFiles();
        } catch (error) {
          console.error("Repository initialization error:", error);
          if (error instanceof Error) {
            toast.error(error.message);
          } else {
            toast.error("Failed to initialize repository");
          }
        } finally {
          setIsComparingFiles(false);
        }
      };
      initRepo();
    }
  }, [selectedRepo, fetchBranches, fetchRepoFiles]);

  // Handle file push
  const handlePush = async () => {
    if (selectedFiles.length === 0 || !commitMessage) {
      toast.error("Please select files and provide a commit message");
      return;
    }

    // Ensure we have a branch selected
    if (!currentBranch) {
      toast.error("Please select a branch before pushing");
      return;
    }

    try {
      await pushFiles(
        selectedFiles.map(f => f.path),
        `[${currentBranch}] ${commitMessage}`
      );
      toast.success("Successfully pushed to GitHub!");
      // Reset form
      setSelectedFiles([]);
      setCommitMessage("");
    } catch (error) {
      toast.error("Failed to push to GitHub");
      console.error("Push error:", error);
    }
  };

  const handleFileToggle = (file: FileInfo) => {
    if (file.type === "file") {
      setSelectedFiles(prev => {
        const isSelected = prev.some(f => f.path === file.path);
        if (isSelected) {
          return prev.filter(f => f.path !== file.path);
        } else {
          return [...prev, file];
        }
      });
    }
  };

  return (
    <div className="max-w-screen-xl mx-auto px-4 space-y-6">
      {/* Repository Selection and Branch Indicator */}
      {isAuthenticated && (
        <div className="grid grid-cols-2 gap-4">
          {/* Repository Selector */}
          <div className="flex gap-2 items-center">
            <Select
              value={selectedRepo || ""}
              onValueChange={setSelectedRepo}
              disabled={isLoadingRepos}
              className="flex-1"
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a repository" />
              </SelectTrigger>
              <SelectContent>
                {repositories.map((repo) => (
                  <SelectItem key={repo.name} value={repo.name}>
                    {repo.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRepo && <BranchDialog />}
          </div>

          {/* Branch Selector */}
          {selectedRepo ? (
            <Select
              value={currentBranch}
              onValueChange={async (value) => {
                if (value === "create-new") {
                  const dialog = document.querySelector("[data-branch-dialog]");
                  if (dialog instanceof HTMLElement) {
                    dialog.click();
                  }
                  return;
                }
                
                setIsComparingFiles(true);
                try {
                  await switchBranch(value);
                  await fetchRepoFiles();
                  toast.success(`Switched to branch ${value}`);
                } catch (error) {
                  console.error("Branch switch error:", error);
                  toast.error("Failed to switch branch and update files");
                } finally {
                  setIsComparingFiles(false);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  <SelectValue placeholder="Select a branch" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.name} value={branch.name}>
                    <div className="flex items-center justify-between w-full">
                      <span>{branch.name}</span>
                      {branch.default && (
                        <span className="text-xs bg-secondary px-2 py-1 rounded-full ml-2">
                          default
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="create-new" className="text-primary">
                  + Create new branch
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted opacity-50">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">No branch selected</span>
            </div>
          )}
        </div>
      )}

      {/* Files Grid */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Workspace Files</h3>
        {isLoading ? (
          <div className="border rounded-lg p-4 bg-card text-sm text-muted-foreground">
            Loading workspace files...
          </div>
        ) : error ? (
          <div className="border rounded-lg p-4 bg-card text-sm text-destructive">
            {error}
          </div>
        ) : isComparingFiles ? (
          <div className="border rounded-lg p-4 bg-card text-sm text-muted-foreground">
            Comparing files with repository...
          </div>
        ) : workspaceFiles.length > 0 ? (
          <FileGrid 
            files={isAuthenticated && selectedRepo ? comparisonFiles : workspaceFiles.map(f => ({ ...f, source: 'workspace', category: getFileCategory(f.path), status: 'unchanged' }))} 
            selectedFiles={selectedFiles}
            onFileToggle={handleFileToggle}
            onSelectAll={setSelectedFiles}
          />
        ) : (
          <div className="border rounded-lg p-4 bg-card text-sm text-muted-foreground">
            No files found in workspace
          </div>
        )}
      </div>

      {/* Push Section */}
      {isAuthenticated && selectedRepo && selectedFiles.length > 0 && (
        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-muted">
            <p className="text-sm font-medium">Selected Files:</p>
            {selectedFiles.map(file => (
              <div key={file.path} className="mt-2">
                <p className="text-sm text-muted-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground">{getRelativePath(file.path)}</p>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedFiles([])}
              className="mt-2"
            >
              Clear Selection
            </Button>
          </div>
          <Input
            placeholder="Commit message (e.g., Update configuration file)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={handlePush}
            disabled={!commitMessage}
          >
            Push to GitHub
          </Button>
        </div>
      )}
    </div>
  );
}