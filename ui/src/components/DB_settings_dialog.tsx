import React, { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Settings } from "lucide-react";
import { useGitHubStore } from "../utils/DB_workspace_util";
import { toast } from "sonner";
import { API_URL } from "app";

export function DB_settings_dialog() {
  const [token, setToken] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const { setToken: setStoreToken, authenticate, saveToken, loadSavedToken } = useGitHubStore();
  const initialized = useRef(false);

  const handleSave = useCallback(async () => {
    if (!token) return;
    
    setIsLoading(true);
    try {
      await saveToken(token);
      toast.success("GitHub token saved and verified successfully!");
      setOpen(false);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(`Failed to save GitHub token: ${error.message}`);
      } else {
        toast.error("Failed to save GitHub token. Please check if it's valid.");
      }
      console.error("Save token error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [token, saveToken, setOpen]);

  // Load saved token on mount
  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    loadSavedToken();
  }, [setStoreToken, authenticate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>GitHub Settings</DialogTitle>
          <DialogDescription>
            Enter your GitHub Personal Access Token. This will be stored securely.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Enter GitHub Personal Access Token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!token || isLoading}
          >
            {isLoading ? "Saving..." : "Save Token"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}