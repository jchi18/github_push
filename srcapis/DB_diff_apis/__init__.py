from fastapi import APIRouter
from pydantic import BaseModel
from diff_match_patch import diff_match_patch
import re

router = APIRouter(prefix="/diff/api")

class DiffRequest(BaseModel):
    workspace_content: str
    repo_content: str
    filename: str

class DiffResponse(BaseModel):
    diff_html: str
    styles: str

def create_diff_html(text1: str, text2: str) -> tuple[str, str]:
    dmp = diff_match_patch()
    diffs = dmp.diff_main(text1, text2)
    dmp.diff_cleanupSemantic(diffs)
    
    # Split both texts into lines for proper line numbering
    text1_lines = text1.split('\n')
    text2_lines = text2.split('\n')
    
    # Generate line numbers and formatted HTML
    html_lines = []
    line_number_left = 1
    line_number_right = 1
    
    # Process the diffs
    for op, text in diffs:
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            if op == 0:  # Equal
                html_lines.append(f'<div class="diff-line">')
                html_lines.append(f'<div class="line-number">{line_number_left}</div>')
                html_lines.append(f'<div class="line-number">{line_number_right}</div>')
                html_lines.append(f'<div class="line-content"><span class="diff-equal">{escape_html(line)}</span></div>')
                html_lines.append('</div>')
                
                if i < len(lines) - 1 or text.endswith('\n'):
                    line_number_left += 1
                    line_number_right += 1
                    
            elif op == -1:  # Deletion
                html_lines.append(f'<div class="diff-line">')
                html_lines.append(f'<div class="line-number">{line_number_left}</div>')
                html_lines.append(f'<div class="line-number"></div>')
                html_lines.append(f'<div class="line-content"><div class="diff-deletion">')
                html_lines.append(f'<span class="diff-deletion-text">{escape_html(line)}</span>')
                html_lines.append('</div></div></div>')
                
                if i < len(lines) - 1 or text.endswith('\n'):
                    line_number_left += 1
                    
            else:  # Addition
                html_lines.append(f'<div class="diff-line">')
                html_lines.append(f'<div class="line-number"></div>')
                html_lines.append(f'<div class="line-number">{line_number_right}</div>')
                html_lines.append(f'<div class="line-content"><div class="diff-addition">')
                html_lines.append(f'<span class="diff-addition-text">{escape_html(line)}</span>')
                html_lines.append('</div></div></div>')
                
                if i < len(lines) - 1 or text.endswith('\n'):
                    line_number_right += 1

    styles = """
    .diff-container {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;
        font-size: 0.875rem;
        line-height: 1.25rem;
        width: 100%;
    }
    .diff-line {
        display: flex;
        border-bottom: 1px solid hsl(var(--border));
    }
    .line-number {
        padding: 0 0.5rem;
        text-align: right;
        min-width: 3rem;
        user-select: none;
        color: hsl(var(--muted-foreground));
        border-right: 1px solid hsl(var(--border));
    }
    .line-content {
        padding: 0 0.5rem;
        white-space: pre;
        flex: 1;
        overflow-x: auto;
    }
    .diff-deletion {
        background-color: rgba(239, 68, 68, 0.2);
    }
    .diff-addition {
        background-color: rgba(34, 197, 94, 0.2);
    }
    .diff-equal {
        color: hsl(var(--foreground));
    }
    .diff-deletion-text {
        color: rgb(239, 68, 68);
        text-decoration: line-through;
    }
    .diff-addition-text {
        color: rgb(34, 197, 94);
    }
    """
    
    return '\n'.join(html_lines), styles

def format_line(left_changes, right_changes, line_number_left, line_number_right):
    html_parts = ['<div class="diff-line">']    
    
    # Add line numbers
    html_parts.append(f'<div class="line-number">{line_number_left if left_changes else ""}</div>')
    html_parts.append(f'<div class="line-number">{line_number_right if right_changes else ""}</div>')
    
    # Add content
    html_parts.append('<div class="line-content">')
    
    if left_changes:
        html_parts.append('<div class="diff-deletion">')
        for _, text in left_changes:
            html_parts.append(f'<span class="diff-deletion-text">{escape_html(text)}</span>')
        html_parts.append('</div>')
        
    if right_changes:
        html_parts.append('<div class="diff-addition">')
        for _, text in right_changes:
            html_parts.append(f'<span class="diff-addition-text">{escape_html(text)}</span>')
        html_parts.append('</div>')
        
    html_parts.append('</div></div>')
    
    return ''.join(html_parts)

def escape_html(text: str) -> str:
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

@router.post("/diff")
def diff_get_diff(body: DiffRequest) -> DiffResponse:
    # Ensure we have valid strings to compare
    repo_content = body.repo_content if body.repo_content is not None else ""
    workspace_content = body.workspace_content if body.workspace_content is not None else ""
    diff_html, styles = create_diff_html(repo_content, workspace_content)
    return DiffResponse(
        diff_html=f'<div class="diff-container">{diff_html}</div>',
        styles=styles
    )