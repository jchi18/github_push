from fastapi import APIRouter, HTTPException
import requests
from app.apis.DB_shared_models import (
    Branch, ListBranchesRequest, ListBranchesResponse,
    CreateBranchRequest, CreateBranchResponse,
    SwitchBranchRequest, SwitchBranchResponse,
    BranchProtectionRequest, BranchProtectionResponse
)

router = APIRouter(prefix="/github/branch/api")

@router.post("/list-branches", response_model=ListBranchesResponse)
def branch_list_branches(body: ListBranchesRequest):
    try:
        headers = {
            "Authorization": f"Bearer {body.token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        # Get default branch
        repo_url = f"https://api.github.com/repos/{body.repo_name}"
        repo_response = requests.get(repo_url, headers=headers)
        if repo_response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch repository info")
        
        default_branch = repo_response.json()["default_branch"]
        
        # Get branches
        branches_url = f"https://api.github.com/repos/{body.repo_name}/branches"
        response = requests.get(branches_url, headers=headers)
        print(f"Fetching branches from {branches_url}")
        print(f"Response status: {response.status_code}")
        
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch branches")
        
        branches_data = response.json()
        print(f"Found branches: {[b['name'] for b in branches_data]}")
        branches = []
        
        for branch in branches_data:
            # Check if branch is protected
            protection_url = f"https://api.github.com/repos/{body.repo_name}/branches/{branch['name']}/protection"
            protection_response = requests.get(protection_url, headers=headers)
            is_protected = protection_response.status_code == 200
            
            branches.append(Branch(
                name=branch["name"],
                protected=is_protected,
                default=branch["name"] == default_branch
            ))
        
        return ListBranchesResponse(branches=branches)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def sanitize_branch_name(name: str) -> str:
    """Sanitize branch name to be git compatible.
    Replaces spaces with hyphens and removes special characters."""
    # Replace spaces with hyphens
    name = name.strip().replace(' ', '-')
    # Remove special characters except hyphens and underscores
    import re
    return re.sub(r'[^a-zA-Z0-9-_]', '', name)

@router.post("/create-branch", response_model=CreateBranchResponse)
def branch_create_branch(body: CreateBranchRequest):
    print(f"Creating branch: {body.branch_name} from {body.from_branch} in {body.repo_name}")
    try:
        headers = {
            "Authorization": f"Bearer {body.token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        # Get the SHA of the source branch
        ref_url = f"https://api.github.com/repos/{body.repo_name}/git/refs/heads/{body.from_branch}"
        response = requests.get(ref_url, headers=headers)
        
        if response.status_code != 200:
            return CreateBranchResponse(
                success=False,
                message=f"Source branch '{body.from_branch}' not found"
            )
        
        sha = response.json()["object"]["sha"]
        
        # Sanitize branch name
        sanitized_branch_name = sanitize_branch_name(body.branch_name)
        if not sanitized_branch_name:
            return CreateBranchResponse(
                success=False,
                message="Invalid branch name. Please use only letters, numbers, hyphens and underscores."
            )

        # Create new branch
        create_url = f"https://api.github.com/repos/{body.repo_name}/git/refs"
        data = {
            "ref": f"refs/heads/{sanitized_branch_name}",
            "sha": sha
        }
        
        print(f"Making request to {create_url}")
        response = requests.post(create_url, headers=headers, json=data)
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        print(f"Creating branch at {create_url}")
        print(f"Response status: {response.status_code}")
        print(f"Response body: {response.text}")
        
        if response.status_code == 201:
            return CreateBranchResponse(
                success=True,
                message=f"Branch '{body.branch_name}' created successfully"
            )
        else:
            return CreateBranchResponse(
                success=False,
                message=response.json().get("message", "Failed to create branch")
            )
            
    except Exception as e:
        return CreateBranchResponse(success=False, message=str(e))

@router.post("/branch-protection", response_model=BranchProtectionResponse)
def branch_get_protection(body: BranchProtectionRequest):
    try:
        headers = {
            "Authorization": f"Bearer {body.token}",
            "Accept": "application/vnd.github.v3+json"
        }
        
        url = f"https://api.github.com/repos/{body.repo_name}/branches/{body.branch_name}/protection"
        response = requests.get(url, headers=headers)
        
        if response.status_code != 200:
            return BranchProtectionResponse(
                protected=False,
                required_reviews=0,
                dismiss_stale_reviews=False,
                require_code_owner_reviews=False,
                required_status_checks=[]
            )
        
        data = response.json()
        pr_data = data.get("required_pull_request_reviews", {})
        
        return BranchProtectionResponse(
            protected=True,
            required_reviews=pr_data.get("required_approving_review_count", 0),
            dismiss_stale_reviews=pr_data.get("dismiss_stale_reviews", False),
            require_code_owner_reviews=pr_data.get("require_code_owner_reviews", False),
            required_status_checks=[
                check["context"] 
                for check in data.get("required_status_checks", {}).get("checks", [])
            ]
        )
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))