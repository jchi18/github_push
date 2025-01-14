from fastapi import APIRouter, HTTPException
import os
from datetime import datetime
from app.apis.DB_shared_models import (
    FileInfo, DirectoryContent,
    ReadFileRequest, ReadFileResponse
)

router = APIRouter(prefix="/workspace/api")

@router.get("/list-files", response_model=DirectoryContent)
def workspace_list_files():
    try:
        # Use absolute path /app
        base_path = "/app"
        
        base_dirs = [
            os.path.join(base_path, "src/app/apis"),
            os.path.join(base_path, "ui/src/components"),
            os.path.join(base_path, "ui/src/pages"),
            os.path.join(base_path, "ui/src/utils")
        ]
        
        all_files = []
        
        for base_dir in base_dirs:
            try:
                if os.path.exists(base_dir):
                    for root, dirs, files in os.walk(base_dir):
                        for file_name in files:
                            if not file_name.startswith('.'):
                                file_path = os.path.join(root, file_name)
                                stat = os.stat(file_path)
                                all_files.append(FileInfo(
                                    path=file_path,
                                    type="file",
                                    name=file_name,
                                    last_modified=datetime.fromtimestamp(stat.st_mtime).isoformat()
                                ))
            except Exception as e:
                print(f"Error accessing {base_dir}: {str(e)}")
                continue
        
        sorted_files = sorted(all_files, key=lambda x: x.path)
        return DirectoryContent(files=sorted_files)
    except Exception as e:
        print(f"Error listing workspace files: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/read-file", response_model=ReadFileResponse)
def workspace_read_file(body: ReadFileRequest):
    try:
        # Ensure we have the absolute path with /app/ prefix
        file_path = body.path
        if not file_path.startswith('/app/'):
            file_path = f'/app/{file_path}'
        
        # Read the file content
        with open(file_path, 'r') as f:
            content = f.read()
        
        stat = os.stat(file_path)
        last_modified = datetime.fromtimestamp(stat.st_mtime).isoformat()
        return ReadFileResponse(content=content, last_modified=last_modified)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))