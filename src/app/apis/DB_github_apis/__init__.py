from fastapi import APIRouter, HTTPException
import databutton as db
import requests
import base64
from app.apis.DB_shared_models import (
    AuthRequest, AuthResponse,
    RepoRequest, Repository, RepositoriesResponse,
    PushRequest, PushResponse,
    SaveTokenRequest, SaveTokenResponse, TokenResponse,
    RepoFile, RepoFilesRequest, RepoFilesResponse,
    create_github_headers, validate_repo_access,
    validate_branch_exists, handle_github_error,
    process_file_for_github
)

router = APIRouter(prefix="/github/api")

@router.post("/auth", response_model=AuthResponse)
def github_authenticate(body: AuthRequest):
    try:
        headers = create_github_headers(body.token)
        response = requests.get("https://api.github.com/user", headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")
        user_data = response.json()
        return AuthResponse(success=True, username=user_data["login"])
    except Exception as e:
        handle_github_error(e, "Authentication failed")

@router.post("/repositories", response_model=RepositoriesResponse)
def github_get_repositories(body: RepoRequest):
    try:
        headers = create_github_headers(body.token)
        response = requests.get("https://api.github.com/user/repos", headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch repositories")
        
        repos_data = response.json()
        repos = [Repository(
            name=repo["full_name"],
            description=repo.get("description")
        ) for repo in repos_data]
        
        return RepositoriesResponse(repositories=repos)
    except Exception as e:
        handle_github_error(e, "Failed to fetch repositories")

@router.get("/saved-token", response_model=TokenResponse)
def github_get_saved_token():
    try:
        token = db.secrets.get("GITHUB_TOKEN")
        # Return None if token doesn't exist, this is a valid case
        return TokenResponse(token=token)
    except Exception as e:
        # Only raise exception for actual errors, not for missing token
        print(f"Error getting token: {str(e)}")
        return TokenResponse(token=None)

@router.post("/save-token", response_model=SaveTokenResponse)
def github_save_token(body: SaveTokenRequest):
    try:
        # Verify token works
        headers = create_github_headers(body.token)
        response = requests.get("https://api.github.com/user", headers=headers)
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        # Token is valid, save it
        db.secrets.put("GITHUB_TOKEN", body.token)
        return SaveTokenResponse(success=True)
    except Exception as e:
        handle_github_error(e, "Failed to save token")

@router.post("/repo-files", response_model=RepoFilesResponse)
def github_get_repo_files(body: RepoFilesRequest):
    print(f"Fetching files for repo: {body.repo_name}, branch: {body.branch}")
    try:
        # Validate input
        if not body.repo_name or not body.branch or not body.token:
            raise HTTPException(status_code=400, detail="Repository name, branch and token are required")
            
        # Validate repository access and get repo data
        validate_repo_access(body.token, body.repo_name)
        headers = create_github_headers(body.token)
        
        # Get repository details
        repo_url = f"https://api.github.com/repos/{body.repo_name}"
        repo_response = requests.get(repo_url, headers=headers)
        repo_data = repo_response.json()
        
        # Check if repository is empty
        if repo_data.get('size', 0) == 0:
            print(f"Repository {body.repo_name} is empty")
            return RepoFilesResponse(files=[])
        
        # Get branch SHA
        branch_sha = validate_branch_exists(body.token, body.repo_name, body.branch)
        if not branch_sha:
            print(f"Branch {body.branch} not found or empty")
            return RepoFilesResponse(files=[])
        
        # Get contents recursively using the Contents API
        contents_url = f"https://api.github.com/repos/{body.repo_name}/contents"
        print(f"Fetching contents from: {contents_url}")
        
        def get_directory_contents(path=""):
            url = f"{contents_url}/{path}" if path else contents_url
            print(f"Fetching contents from: {url}")
            response = requests.get(url, headers=headers, params={"ref": body.branch})
            
            if response.status_code != 200:
                print(f"Failed to get contents for path {path}: {response.status_code}")
                return []
            
            contents = response.json()
            if not isinstance(contents, list):
                print(f"Unexpected response format for path {path}")
                return []
            
            all_contents = []
            for item in contents:
                if item["type"] == "file":
                    print(f"Found file: {item['path']}")
                    all_contents.append(item)
                elif item["type"] == "dir":
                    print(f"Found directory: {item['path']}")
                    all_contents.extend(get_directory_contents(item["path"]))
            return all_contents
        
        # Get all contents recursively
        all_files = get_directory_contents()
        print(f"Total files found: {len(all_files)}")
        
        # Process files
        repo_files = []
        for item in all_files:
            # Get file content from the contents API response
            content = base64.b64decode(item["content"]).decode('utf-8') if item.get("content") else ""
            
            # Get commit info for the file
            commits_url = f"https://api.github.com/repos/{body.repo_name}/commits"
            commits_response = requests.get(
                commits_url,
                headers=headers,
                params={"path": item["path"], "per_page": 1}
            )
            
            last_modified = None
            if commits_response.status_code == 200:
                commits = commits_response.json()
                if commits:
                    last_modified = commits[0]["commit"]["committer"]["date"]
            
            repo_files.append(RepoFile(
                path=item["path"],
                content=content,
                sha=item["sha"],
                last_modified=last_modified
            ))
        
        return RepoFilesResponse(files=repo_files)
        
    except Exception as e:
        handle_github_error(e, "Failed to fetch repository files")

@router.post("/push", response_model=PushResponse)
def github_push_to_repo(body: PushRequest):
    try:
        print(f"Pushing to repo: {body.repo_name}, branch: {body.branch}")
        
        # Validate repository access
        validate_repo_access(body.token, body.repo_name)
        headers = create_github_headers(body.token)
        
        # Get repository details
        repo_url = f"https://api.github.com/repos/{body.repo_name}"
        repo_response = requests.get(repo_url, headers=headers)
        if repo_response.status_code != 200:
            return PushResponse(
                success=False,
                message=f"Failed to access repository: {repo_response.json().get('message', 'Unknown error')}"
            )
        
        repo_data = repo_response.json()
        is_empty_repo = repo_data.get('size', 0) == 0
        
        # For empty repositories, create initial README.md using contents API
        if is_empty_repo:
            print("Creating initial README.md for empty repository using contents API")
            readme_content = "# Workspace Files\n\nThis repository contains workspace files managed by Databutton.\n"
            contents_url = f"https://api.github.com/repos/{body.repo_name}/contents/README.md"
            contents_response = requests.put(
                contents_url,
                headers=headers,
                json={
                    "message": "Initial commit with README",
                    "content": base64.b64encode(readme_content.encode()).decode(),
                    "branch": body.branch
                }
            )
            if contents_response.status_code != 201:
                return PushResponse(
                    success=False,
                    message=f"Failed to create README: {contents_response.json().get('message', 'Unknown error')}"
                )
            print("Successfully created README.md using contents API")
        
        # Check if branch exists
        branch_sha = validate_branch_exists(body.token, body.repo_name, body.branch)
        
        # Create or update branch with files
        if is_empty_repo or not branch_sha:
            print(f"Creating initial branch {body.branch} for repository")
            # Create a tree with the files
            new_tree = []
            for file_path in body.files:
                tree_entry, error = process_file_for_github(file_path, body.repo_name, headers)
                if error:
                    return PushResponse(success=False, message=f"Error processing {file_path}: {error}")
                new_tree.append(tree_entry)
            
            # Create tree
            create_tree_url = f"https://api.github.com/repos/{body.repo_name}/git/trees"
            tree_response = requests.post(create_tree_url, headers=headers, json={"tree": new_tree})
            if tree_response.status_code != 201:
                return PushResponse(
                    success=False,
                    message=f"Failed to create tree: {tree_response.json().get('message', 'Unknown error')}"
                )
            
            # Create commit
            create_commit_url = f"https://api.github.com/repos/{body.repo_name}/git/commits"
            commit_data = {
                "message": body.commit_message,
                "tree": tree_response.json()["sha"],
                "parents": []
            }
            commit_response = requests.post(create_commit_url, headers=headers, json=commit_data)
            if commit_response.status_code != 201:
                return PushResponse(
                    success=False,
                    message=f"Failed to create commit: {commit_response.json().get('message', 'Unknown error')}"
                )
            
            # Create or update branch reference
            if not branch_sha:
                # Create new branch
                create_ref_url = f"https://api.github.com/repos/{body.repo_name}/git/refs"
                ref_data = {
                    "ref": f"refs/heads/{body.branch}",
                    "sha": commit_response.json()["sha"]
                }
                create_ref_response = requests.post(create_ref_url, headers=headers, json=ref_data)
                if create_ref_response.status_code != 201:
                    return PushResponse(
                        success=False,
                        message=f"Failed to create branch: {create_ref_response.json().get('message', 'Unknown error')}"
                    )
            else:
                # Update existing branch
                update_ref_url = f"https://api.github.com/repos/{body.repo_name}/git/refs/heads/{body.branch}"
                ref_data = {
                    "sha": commit_response.json()["sha"],
                    "force": True
                }
                update_ref_response = requests.patch(update_ref_url, headers=headers, json=ref_data)
                if update_ref_response.status_code != 200:
                    return PushResponse(
                        success=False,
                        message=f"Failed to update branch: {update_ref_response.json().get('message', 'Unknown error')}"
                    )
            
            return PushResponse(success=True, message="Successfully pushed all files")
        
        # For existing branches, get the current tree
        base_tree = None
        if branch_sha:
            # Branch exists, get its tree
            tree_url = f"https://api.github.com/repos/{body.repo_name}/git/trees/{branch_sha}"
            tree_response = requests.get(tree_url, headers=headers)
            
            if tree_response.status_code == 200:
                base_tree = branch_sha
        
        print(f"Base tree SHA: {base_tree}")
        
        # Create blobs for each file
        new_tree = []
        for file_path in body.files:
            tree_entry, error = process_file_for_github(file_path, body.repo_name, headers)
            if error:
                return PushResponse(success=False, message=f"Error processing {file_path}: {error}")
            new_tree.append(tree_entry)
        
        # Create new tree
        create_tree_url = f"https://api.github.com/repos/{body.repo_name}/git/trees"
        tree_data = {
            "tree": new_tree
        }
        if base_tree:
            tree_data["base_tree"] = base_tree
        create_tree_response = requests.post(create_tree_url, headers=headers, json=tree_data)
        
        if create_tree_response.status_code != 201:
            return PushResponse(
                success=False,
                message=f"Failed to create tree: {create_tree_response.json().get('message', 'Unknown error')}"
            )
        
        new_tree_sha = create_tree_response.json()["sha"]
        
        # Create commit
        create_commit_url = f"https://api.github.com/repos/{body.repo_name}/git/commits"
        commit_data = {
            "message": body.commit_message,
            "tree": new_tree_sha,
            "parents": [base_tree] if base_tree else []
        }
        commit_response = requests.post(create_commit_url, headers=headers, json=commit_data)
        
        if commit_response.status_code != 201:
            return PushResponse(
                success=False,
                message=f"Failed to create commit: {commit_response.json().get('message', 'Unknown error')}"
            )
        
        new_commit_sha = commit_response.json()["sha"]
        
        # Create or update branch reference
        ref_url = f"https://api.github.com/repos/{body.repo_name}/git/refs/heads/{body.branch}"
        ref_data = {
            "sha": new_commit_sha,
            "force": True  # Force update to handle non-fast-forward cases
        }
        
        if not branch_sha:
            # Branch doesn't exist, create it
            print(f"Creating new branch: {body.branch}")
            create_response = requests.post(f"https://api.github.com/repos/{body.repo_name}/git/refs", 
                                         headers=headers, 
                                         json={"ref": f"refs/heads/{body.branch}", "sha": new_commit_sha})
            
            if create_response.status_code != 201:
                return PushResponse(
                    success=False,
                    message=f"Failed to create branch: {create_response.json().get('message', 'Unknown error')}"
                )
        else:
            # Branch exists, update it
            print(f"Updating existing branch: {body.branch}")
            update_response = requests.patch(ref_url, headers=headers, json=ref_data)
            
            if update_response.status_code != 200:
                return PushResponse(
                    success=False,
                    message=f"Failed to update branch: {update_response.json().get('message', 'Unknown error')}"
                )
        
        return PushResponse(success=True, message="Successfully pushed all files")
        
    except Exception as e:
        handle_github_error(e, "Failed to push files to repository")