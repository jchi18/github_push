import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitBranch, Shield, Plus } from "lucide-react";
import { useGitHubStore } from "../utils/DB_workspace_util";
import { toast } from "sonner";

export interface Branch {
  name: string;
  protected: boolean;
  default: boolean;
}

export function DB_branch_dialog() {
  const [open, setOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const {
    token,
    selectedRepo,
    branches,
    currentBranch,
    fetchBranches,
    createBranch,
    switchBranch,
    getBranchProtection
  } = useGitHubStore();

  const handleCreateBranch = async () => {
    console.log('Create branch button clicked');
    if (!newBranchName || !selectedRepo) {
      console.log('Validation failed:', { newBranchName, selectedRepo });
      toast.error('Please enter a branch name and select a repository');
      return;
    }

    console.log('Creating branch:', { newBranchName, selectedRepo, currentBranch });
    setIsCreating(true);
    try {
      await createBranch(newBranchName);
      await fetchBranches();
      toast.success(`Branch '${newBranchName}' created successfully`);
      setNewBranchName("");
      setOpen(false);
    } catch (error) {
      toast.error("Failed to create branch");
      console.error("Create branch error:", error);
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSwitchBranch = async (branch: Branch) => {
    if (!selectedRepo) return;

    try {
      await switchBranch(branch.name);
      toast.success(`Switched to branch '${branch.name}'`);
      setSelectedBranch(null);
    } catch (error) {
      toast.error("Failed to switch branch");
      console.error("Switch branch error:", error);
    }
  };

  const handleViewProtection = async (branch: Branch) => {
    if (!selectedRepo) return;

    try {
      const protection = await getBranchProtection(branch.name);
      setSelectedBranch(branch);
      // You could show this in a nested dialog or expand the current one
      toast.info(
        `Branch Protection Rules:\n${protection.required_reviews} reviews required\n${protection.required_status_checks.length} status checks required`
      );
    } catch (error) {
      toast.error("Failed to fetch branch protection rules");
      console.error("Protection rules error:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild data-branch-dialog>
        <Button variant="outline" size="icon">
          <GitBranch className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Branch Management</DialogTitle>
        </DialogHeader>

        {/* Create New Branch */}
        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4">
            <Input
              placeholder="New branch name"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
            />
            <Button
              onClick={handleCreateBranch}
              disabled={!newBranchName || isCreating}
              size="icon"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Branch List */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Branches</h4>
          {branches.map((branch) => (
            <div
              key={branch.name}
              className="flex items-center justify-between p-2 border rounded-lg"
            >
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <span className="text-sm">{branch.name}</span>
                {branch.default && (
                  <span className="text-xs bg-secondary px-2 py-1 rounded-full">
                    default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {branch.protected && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleViewProtection(branch)}
                  >
                    <Shield className="h-4 w-4" />
                  </Button>
                )}
                {currentBranch !== branch.name && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSwitchBranch(branch)}
                  >
                    Switch
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}