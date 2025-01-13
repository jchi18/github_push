import React, { useState, useEffect } from "react";
import { API_URL } from "app";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ComparisonFile, FileStatus } from "../utils/DB_workspace_util";

export interface FileInfo {
  path: string;
  type: "file" | "directory";
  name: string;
}

export interface FileGridProps {
  onSelectAll?: (files: FileInfo[]) => void;
  files: ComparisonFile[];
  selectedFiles: FileInfo[];
  onFileSelect?: (file: FileInfo) => void;
  onFileToggle: (file: FileInfo) => void;
}

export function getRelativePath(path: string): string {
  // Remove /app/ prefix if it exists
  return path.replace(/^\/app\//, '');
}

export function getFileCategory(path: string): string {
  if (path.includes('/app/src/app/apis')) return 'backend';
  if (path.includes('ui/src/components')) return 'component';
  if (path.includes('ui/src/pages')) return 'page';
  if (path.includes('ui/src/utils')) return 'util';
  return 'other';
}

function getLatestVersionInfo(file: ComparisonFile): { version: string; tooltip: string } {
  const wsDate = file.last_modified ? new Date(file.last_modified) : null;
  const repoDate = file.repoFile?.last_modified ? new Date(file.repoFile.last_modified) : null;

  // For unchanged files, show In Sync
  if (file.status === "unchanged") {
    return {
      version: "In Sync",
      tooltip: repoDate
        ? `Synchronized with repository (Last commit: ${repoDate.toLocaleString()})`
        : "Synchronized with repository"
    };
  }

  // For new files, show New in Workspace
  if (file.status === "new") {
    return {
      version: "New in Workspace",
      tooltip: wsDate
        ? `Created in workspace: ${wsDate.toLocaleString()}`
        : "File only exists in workspace"
    };
  }

  // For deleted files, show Only in Repository
  if (file.status === "deleted") {
    return {
      version: "Only in Repository",
      tooltip: repoDate
        ? `Last seen in repository: ${repoDate.toLocaleString()}`
        : "File exists only in repository"
    };
  }

  // For modified files, compare timestamps
  if (!wsDate || !repoDate) {
    return {
      version: "Workspace",
      tooltip: "Unable to determine latest version - using workspace version"
    };
  }

  const isWorkspaceNewer = wsDate > repoDate;
  return {
    version: isWorkspaceNewer ? "Workspace" : "Repository",
    tooltip: `Workspace: ${wsDate.toLocaleString()}\nRepository: ${repoDate.toLocaleString()}`
  };
}

function getStatusColor(status: FileStatus): string {
  switch (status) {
    case "new":
      return "text-green-600 dark:text-green-400";
    case "modified":
      return "text-yellow-600 dark:text-yellow-400";
    case "deleted":
      return "text-red-600 dark:text-red-400";
    default:
      return "text-muted-foreground";
  }
}

export function DB_filegrid({ files, selectedFiles, onFileToggle, onSelectAll }: FileGridProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<'name' | 'path' | 'category' | 'source' | 'status' | 'latestVersion'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedDiffFile, setSelectedDiffFile] = useState<ComparisonFile | null>(null);
  const [diffContent, setDiffContent] = useState<{ html: string; styles: string } | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  
  useEffect(() => {
    const fetchDiff = async () => {
      if (!selectedDiffFile) return;
      
      setIsLoadingDiff(true);
      try {
        // Get workspace content
        const wsResponse = await fetch(`${API_URL}/workspace/api/read-file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedDiffFile.path }),
          credentials: 'include'
        });
        
        if (!wsResponse.ok) throw new Error('Failed to read workspace file');
        const wsData = await wsResponse.json();
        
        // Get diff
        const diffResponse = await fetch(`${API_URL}/diff/api/diff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspace_content: wsData.content,
            repo_content: selectedDiffFile.repoFile?.content || '',
            filename: selectedDiffFile.name
          }),
          credentials: 'include'
        });
        
        if (!diffResponse.ok) throw new Error('Failed to generate diff');
        const diffData = await diffResponse.json();
        setDiffContent({
          html: diffData.diff_html,
          styles: diffData.styles
        });
      } catch (error) {
        console.error('Error fetching diff:', error);
        setDiffContent(null);
      } finally {
        setIsLoadingDiff(false);
      }
    };
    
    fetchDiff();
  }, [selectedDiffFile]);

  const sortedFiles = [...files].sort((a, b) => {
    let compareA: string, compareB: string;
    
    switch (sortColumn) {
      case 'name':
        compareA = a.name;
        compareB = b.name;
        break;
      case 'path':
        compareA = getRelativePath(a.path);
        compareB = getRelativePath(b.path);
        break;
      case 'category':
        compareA = a.category;
        compareB = b.category;
        break;
      case 'source':
        compareA = a.source;
        compareB = b.source;
        break;
      case 'status':
        compareA = a.status;
        compareB = b.status;
        break;
      case 'latestVersion':
        const infoA = getLatestVersionInfo(a);
        const infoB = getLatestVersionInfo(b);
        return sortDirection === 'asc'
          ? infoA.version.localeCompare(infoB.version)
          : infoB.version.localeCompare(infoA.version);
      default:
        return 0;
    }

    return sortDirection === 'asc' 
      ? compareA.localeCompare(compareB)
      : compareB.localeCompare(compareA);
  });

  const toggleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: typeof sortColumn }) => {
    if (sortColumn !== column) return null;
    return (
      <span className="ml-2">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="border rounded-lg p-4 bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={files.length > 0 && selectedFiles.length === files.filter(f => f.type === "file").length}
                onChange={() => {
                  if (onSelectAll) {
                    const allFiles = files.filter(f => f.type === "file");
                    if (selectedFiles.length === allFiles.length) {
                      // Deselect all
                      onSelectAll([]);
                    } else {
                      // Select all files (not directories)
                      onSelectAll(allFiles);
                    }
                  }
                }}
              />
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => toggleSort('name')}
            >
              File Name <SortIcon column="name" />
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => toggleSort('category')}
            >
              Category <SortIcon column="category" />
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => toggleSort('source')}
            >
              Source <SortIcon column="source" />
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => toggleSort('status')}
            >
              Status <SortIcon column="status" />
            </TableHead>
            <TableHead 
              className="cursor-pointer hover:bg-accent/50"
              onClick={() => toggleSort('latestVersion')}
            >
              Latest Version <SortIcon column="latestVersion" />
            </TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedFiles.map((file) => (
            <TableRow 
              key={file.path}
              className="cursor-pointer hover:bg-accent"
            >
              <TableCell className="w-[50px]">
                <input
                  type="checkbox"
                  checked={selectedFiles.some(f => f.path === file.path)}
                  onChange={() => onFileToggle(file)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4"
                />
              </TableCell>
              <TableCell className="space-x-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedFiles(prev => {
                      const next = new Set(prev);
                      if (next.has(file.path)) {
                        next.delete(file.path);
                      } else {
                        next.add(file.path);
                      }
                      return next;
                    });
                  }}
                >
                  {expandedFiles.has(file.path) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <span>{file.name}</span>
                {expandedFiles.has(file.path) && (
                  <div className="pl-6 text-sm text-muted-foreground">
                    {getRelativePath(file.path)}
                  </div>
                )}
              </TableCell>
              <TableCell>{file.category}</TableCell>
              <TableCell>{file.source}</TableCell>
              <TableCell>
                <span className={getStatusColor(file.status)}>
                  {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                </span>
              </TableCell>
              <TableCell>
                {(() => {
                  const info = getLatestVersionInfo(file);
                  const color = info.version === "In Sync" ? "text-muted-foreground" :
                               info.version.includes("Workspace") ? "text-green-600 dark:text-green-400" :
                               info.version.includes("Repository") ? "text-blue-600 dark:text-blue-400" :
                               "text-muted-foreground";
                  return (
                    <span className={`text-sm ${color}`} title={info.tooltip}>
                      {info.version}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell>
                {file.status !== "unchanged" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDiffFile(file);
                    }}
                  >
                    View Diff
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!selectedDiffFile} onOpenChange={() => setSelectedDiffFile(null)}>
        <DialogContent className="w-screen max-w-[95vw] h-[90vh] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>File Comparison - {selectedDiffFile?.name}</DialogTitle>
            {selectedDiffFile && (
              <div className="text-sm text-muted-foreground">
                {(() => {
                  const info = getLatestVersionInfo(selectedDiffFile);
                  return (
                    <div className="flex flex-col gap-1">
                      <span className={info.version.includes("Workspace") ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}>
                        Latest version: {info.version}
                      </span>
                      {selectedDiffFile.repoFile?.last_modified && (
                        <span>
                          Repository version: {new Date(selectedDiffFile.repoFile.last_modified).toLocaleString()}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </DialogHeader>
          <div className="max-h-[80vh] overflow-auto">
            {isLoadingDiff ? (
              <div className="p-4 text-center">Loading diff...</div>
            ) : diffContent ? (
              <>
                <style>{diffContent.styles}</style>
                <div 
                  className="p-4 bg-muted rounded-lg"
                  dangerouslySetInnerHTML={{ __html: diffContent.html }}
                />
              </>
            ) : (
              <div className="p-4 text-center text-destructive">Failed to load diff</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}