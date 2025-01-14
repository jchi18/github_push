from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import requests

# Dummy router to prevent import warnings
router = APIRouter()

# Shared utility functions
def create_github_headers(token: str) -> dict:
    """Create standard headers for GitHub API requests"""
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json"
    }

def validate_repo_access(token: str, repo_name: str) -> None:
    """Validate repository exists and is accessible"""
    headers = create_github_headers(token)
    repo_url = f"https://api.github.com/repos/{repo_name}"
    response = requests.get(repo_url, headers=headers)
    
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Repository {repo_name} not found")
    elif response.status_code != 200:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to access repository: {response.json().get('message', 'Unknown error')}"
        )

def validate_branch_exists(token: str, repo_name: str, branch_name: str) -> str:
    """Validate branch exists and return its SHA"""
    headers = create_github_headers(token)
    
    # First check if the branch exists in the list of branches
    branches_url = f"https://api.github.com/repos/{repo_name}/branches"
    print(f"Checking branches at: {branches_url}")
    branches_response = requests.get(branches_url, headers=headers)
    print(f"Branches check response status: {branches_response.status_code}")
    
    if branches_response.status_code == 200:
        branches = branches_response.json()
        branch_exists = any(branch["name"] == branch_name for branch in branches)
        print(f"Branch {branch_name} exists: {branch_exists}")
        
        if branch_exists:
            # Now get the specific branch reference
            ref_url = f"https://api.github.com/repos/{repo_name}/git/refs/heads/{branch_name}"
            print(f"Getting branch reference at: {ref_url}")
            response = requests.get(ref_url, headers=headers)
            print(f"Branch reference response status: {response.status_code}")
            
            if response.status_code == 200:
                sha = response.json()["object"]["sha"]
                print(f"Got branch SHA: {sha}")
                return sha
    
    print("Branch not found or error occurred")
    return ""

def handle_github_error(error: Exception, default_message: str = "GitHub API error") -> None:
    """Handle GitHub API errors consistently"""
    if isinstance(error, requests.exceptions.RequestException):
        raise HTTPException(status_code=400, detail=str(error)) from error
    raise HTTPException(status_code=400, detail=default_message) from error

# Auth Models
class AuthRequest(BaseModel):
    token: str

class AuthResponse(BaseModel):
    success: bool
    username: str

# Repository Models
class Repository(BaseModel):
    name: str
    description: str | None

class RepoRequest(BaseModel):
    token: str

class RepositoriesResponse(BaseModel):
    repositories: List[Repository]

# Push Models
class PushRequest(BaseModel):
    token: str
    repo_name: str
    files: List[str]
    commit_message: str
    branch: str = "main"

class PushResponse(BaseModel):
    success: bool
    message: str

# Token Models
class SaveTokenRequest(BaseModel):
    token: str

class SaveTokenResponse(BaseModel):
    success: bool

class TokenResponse(BaseModel):
    token: str | None

# File Models
class RepoFile(BaseModel):
    path: str
    content: str
    sha: str
    last_modified: str | None = None

class RepoFilesRequest(BaseModel):
    token: str
    repo_name: str
    branch: str = "main"

class RepoFilesResponse(BaseModel):
    files: List[RepoFile]

# Branch Models
class Branch(BaseModel):
    name: str
    protected: bool
    default: bool

class ListBranchesRequest(BaseModel):
    token: str
    repo_name: str

class ListBranchesResponse(BaseModel):
    branches: List[Branch]

class CreateBranchRequest(BaseModel):
    token: str
    repo_name: str
    branch_name: str
    from_branch: str = "main"

class CreateBranchResponse(BaseModel):
    success: bool
    message: str

class SwitchBranchRequest(BaseModel):
    token: str
    repo_name: str
    branch_name: str

class SwitchBranchResponse(BaseModel):
    success: bool
    message: str

class BranchProtectionRequest(BaseModel):
    token: str
    repo_name: str
    branch_name: str

class BranchProtectionResponse(BaseModel):
    protected: bool
    required_reviews: int
    dismiss_stale_reviews: bool
    require_code_owner_reviews: bool
    required_status_checks: List[str]

# Workspace Models
class FileInfo(BaseModel):
    path: str
    type: str  # 'file' or 'directory'
    name: str
    last_modified: str

class DirectoryContent(BaseModel):
    files: List[FileInfo]

class ReadFileRequest(BaseModel):
    path: str

class ReadFileResponse(BaseModel):
    content: str
    last_modified: str