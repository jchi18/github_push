import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { DB_settings_dialog as SettingsDialog } from "../components/DB_settings_dialog";
import { useGitHubStore } from "../utils/DB_workspace_util";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DB_workspace_comp as WorkspaceComponent } from "../components/DB_workspace_comp";
import { Toaster } from "sonner";

export default function DB_workspace() {
  const { isAuthenticated, username } = useGitHubStore.getState();
  const [isRefreshing, setIsRefreshing] = useState(false);
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Toaster />
      <main className="container mx-auto px-4 py-8 max-w-screen-xl w-full">
        <Card>
          <CardHeader>
            <div className="grid grid-cols-3 items-center">
              <div className="flex items-center gap-2">
                <CardTitle>GitHub Workspace Pusher</CardTitle>
                <SettingsDialog />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    const { fetchWorkspaceFiles, fetchRepoFiles, selectedRepo, isAuthenticated } = useGitHubStore.getState();
                    setIsRefreshing(true);
                    try {
                      if (fetchWorkspaceFiles) {
                        await fetchWorkspaceFiles();
                      }
                      if (isAuthenticated && selectedRepo && fetchRepoFiles) {
                        await fetchRepoFiles();
                      }
                      toast.success("Refreshed");
                    } catch (error) {
                      toast.error("Failed to refresh");
                    } finally {
                      setIsRefreshing(false);
                    }
                  }}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div></div>
              <div className="text-right">
                {isAuthenticated && (
                  <p className="text-sm text-muted-foreground">Authenticated as {username}</p>
                )}
              </div>
            </div>
            <CardDescription>
              Push your workspace files directly to GitHub repositories.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <WorkspaceComponent />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}