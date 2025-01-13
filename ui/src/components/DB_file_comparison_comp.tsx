import React, { useState, useEffect } from "react";
import { API_URL } from "app";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ComparisonFile, FileStatus } from "../utils/DB_workspace_util";

interface Props {
  files: ComparisonFile[];
  onFileSelect?: (file: ComparisonFile) => void;
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

export function DB_file_comparison_comp({ files, onFileSelect }: Props) {
  const [selectedFile, setSelectedFile] = useState<ComparisonFile | null>(null);
  const [workspaceContent, setWorkspaceContent] = useState<string>("");
  const [diffHtml, setDiffHtml] = useState<string>("");
  const [diffStyles, setDiffStyles] = useState<string>("");

  useEffect(() => {
    if (selectedFile) {
      getFileContent(selectedFile.path).then(async (content) => {
        setWorkspaceContent(content);
        try {
          const response = await fetch(`${API_URL}/diff/api/get-diff`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              workspace_content: content,
              repo_content: selectedFile.repoFile?.content || "",
              filename: selectedFile.name
            }),
            credentials: 'include'
          });

          if (!response.ok) {
            throw new Error('Failed to get diff');
          }

          const data = await response.json();
          setDiffHtml(data.diff_html);
          setDiffStyles(data.styles);
        } catch (error) {
          console.error('Failed to get diff:', error);
        }
      });
    }
  }, [selectedFile]);


  async function getFileContent(path: string): Promise<string> {
    try {
      const response = await fetch(`${API_URL}/workspace/api/read-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path }),
        credentials: 'include'
      })
  
      if (!response.ok) {
        throw new Error('Failed to read file')
      }
  
      const data = await response.json()
      return data.content
    } catch (error) {
      console.error('Failed to read file:', error)
      return ''
    }
  }
  const handleDiffClick = (file: ComparisonFile) => {
    setSelectedFile(file);
  };

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File Name</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={`${file.path}-${file.source}`}>
              <TableCell>
                <div className="font-medium">{file.name}</div>
                <div className="text-sm text-muted-foreground">{file.path.replace(/^\/app\//, '')}</div>
              </TableCell>
              <TableCell>{file.source}</TableCell>
              <TableCell>{file.category}</TableCell>
              <TableCell>
                <span className={getStatusColor(file.status)}>
                  {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                </span>
              </TableCell>
              <TableCell>
                {file.status !== "unchanged" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDiffClick(file)}
                  >
                    View Diff
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent className="w-screen max-w-[95vw] h-[90vh] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>File Comparison - {selectedFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="h-full overflow-auto">
            {selectedFile?.status === "deleted" ? (
              <div className="text-red-600 dark:text-red-400 p-4 text-center">
                File has been deleted from workspace
              </div>
            ) : selectedFile?.status === "new" ? (
              <div className="text-green-600 dark:text-green-400 p-4 text-center">
                New file in workspace
              </div>
            ) : null}
            <div 
              className="diff-view" 
              dangerouslySetInnerHTML={{ 
                __html: `<style>${diffStyles}</style>${diffHtml}` 
              }} 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}