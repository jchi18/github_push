import { create } from 'zustand'
// API_URL is imported at the top of the file

export interface Repository {
  name: string
  description: string | null
}

export interface Branch {
  name: string
  protected: boolean
  default: boolean
}

export interface BranchProtection {
  protected: boolean
  required_reviews: number
  dismiss_stale_reviews: boolean
  require_code_owner_reviews: boolean
  required_status_checks: string[]
}

export interface FileInfo {
  path: string
  type: string
  name: string
}

export interface RepoFile {
  path: string
  content: string
  sha: string
  last_modified?: string
}

export type FileStatus = 'new' | 'modified' | 'deleted' | 'unchanged'
export type FileCategory = 'backend' | 'page' | 'component' | 'util'

export interface WorkspaceFile extends FileInfo {
  last_modified: string
}

export interface ComparisonFile extends WorkspaceFile {
  source: 'workspace' | 'repository'
  category: FileCategory
  status: FileStatus
  repoFile?: RepoFile
  last_modified?: string
}

function normalizeContent(content: string): string {
  // Normalize line endings and remove trailing whitespace
  return content.replace(/\r\n/g, '\n').replace(/\s+$/g, '')
}

export function getFileCategory(path: string): FileCategory {
  if (path.includes('/apis/')) return 'backend'
  if (path.includes('/pages/')) return 'page'
  if (path.includes('/components/')) return 'component'
  return 'util'
}

async function getFileContent(path: string): Promise<{ content: string; last_modified: string }> {
  console.log('Getting content for file:', path)
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
      console.error('Failed to read file:', path, 'Status:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      throw new Error('Failed to read file')
    }

    const data = await response.json();
    return {
      content: data.content,
      last_modified: data.last_modified
    }
  } catch (error) {
    console.error('Failed to read file:', error)
    return {
      content: '',
      last_modified: new Date().toISOString() // Use current time as fallback
    }
  }
}

export async function compareFiles(workspaceFiles: FileInfo[], repoFiles: RepoFile[]): Promise<ComparisonFile[]> {
  const comparison: ComparisonFile[] = [];
  
  // Normalize paths by removing /app/ prefix and ensuring consistent slashes
  const normalizePath = (path: string) => path.replace(/^\/app\//, '').replace(/\\/g, '/')
  
  const repoFileMap = new Map(repoFiles.map(f => [normalizePath(f.path), f]))
  const workspaceFileMap = new Map(workspaceFiles.map(f => [normalizePath(f.path), f]))

  // Check workspace files
  for (const [path, wsFile] of workspaceFileMap) {
    const repoFile = repoFileMap.get(path)
    const { content: wsContent, last_modified: wsLastModified } = await getFileContent(wsFile.path)
    
    let status: FileStatus = 'unchanged'
    if (!repoFile) {
      status = 'new'
    } else if (normalizeContent(wsContent) !== normalizeContent(repoFile.content)) {
      status = 'modified'
    }

    comparison.push({
      ...wsFile,
      source: 'workspace',
      category: getFileCategory(path),
      status,
      repoFile,
      last_modified: wsLastModified
    })
  }

  // Check repository files
  for (const [path, repoFile] of repoFileMap) {
    const normalizedPath = normalizePath(path)
    if (!workspaceFileMap.has(normalizedPath)) {
      comparison.push({
        path: `/app/${path}`,
        type: 'file',
        name: path.split('/').pop() || '',
        source: 'repository',
        category: getFileCategory(path),
        status: 'deleted',
        repoFile,
        last_modified: repoFile.last_modified || new Date().toISOString() // Use repo file timestamp or current time
      })
    }
  }

  return comparison
}
import { API_URL } from 'app'

interface GitHubStore {
  token: string
  username: string | null
  repositories: Repository[]
  selectedRepo: string | null
  isAuthenticated: boolean
  workspaceFiles: FileInfo[]
  branches: Branch[]
  currentBranch: string
  repoFiles: RepoFile[]
  comparisonFiles: ComparisonFile[]
  setToken: (token: string) => void
  setUsername: (username: string) => void
  setRepositories: (repos: Repository[]) => void
  setSelectedRepo: (repo: string) => void
  authenticate: () => Promise<{ authenticated: boolean }>
  loadSavedToken: () => Promise<void>
  fetchRepositories: () => Promise<void>
  pushFiles: (filePaths: string[], commitMessage: string) => Promise<void>
  reset: () => void
  fetchWorkspaceFiles: () => Promise<void>
  fetchBranches: () => Promise<void>
  createBranch: (branchName: string) => Promise<void>
  switchBranch: (branchName: string) => Promise<void>
  getBranchProtection: (branchName: string) => Promise<BranchProtection>
}

export const useGitHubStore = create<GitHubStore>((set, get) => ({
  token: '',
  username: null,
  repositories: [],
  selectedRepo: null,
  isAuthenticated: false,
  workspaceFiles: [],
  branches: [],
  currentBranch: 'main',
  repoFiles: [],
  comparisonFiles: [],

  setToken: (token) => set({ token }),
  setUsername: (username) => set({ username, isAuthenticated: true }),
  setRepositories: (repositories) => set({ repositories }),
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),

  authenticate: async () => {
    const { token } = get()
    if (!token) {
      throw new Error('No token provided')
    }

    const response = await fetch(`${API_URL}/github/api/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Authentication failed')
    }

    const data = await response.json()
    const result = { authenticated: data.success, username: data.username }
    if (result.authenticated && result.username) {
      set({ username: result.username, isAuthenticated: true })
    }
    return result
  },

  saveToken: async (token: string) => {
    try {
      // First verify the token works by authenticating
      set({ token }); // Temporarily set token for authentication
      const authResponse = await get().authenticate();
      if (!authResponse?.authenticated) {
        set({ token: '' }); // Clear invalid token
        throw new Error('Token authentication failed');
      }

      // Then save to secrets
      const response = await fetch(`${API_URL}/github/api/save-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
        credentials: 'include'
      })


      if (!response.ok) {
        set({ token: '' }); // Clear token if save fails
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to save token')
      }

      return true
    } catch (error) {
      set({ token: '' }); // Clear token on any error
      console.error('Failed to save token:', error)
      throw error
    }
  },

  loadSavedToken: async () => {
    try {
      const response = await fetch(`${API_URL}/github/api/saved-token`, {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        console.warn(`Failed to load token: ${response.status}`)
        return
      }

      const data = await response.json()

      // No token is a valid case, just return without error
      if (!data?.token) {
        return
      }

      set({ token: data.token })
      try {
        await get().authenticate()
      } catch (authError) {
        console.error('Failed to authenticate with saved token:', authError)
        // Only reset the token if authentication fails
        set({ token: '' })
      }
    } catch (error) {
      // Only log actual errors, not missing token
      console.error('Failed to load saved token:', error)
      // Don't reset the entire store on network errors
      return
    }
  },

  fetchRepositories: async () => {
    const { token } = get()
    const response = await fetch(`${API_URL}/github/api/repositories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Failed to fetch repositories')
    }

    const data = await response.json()
    const repositories = data.repositories
    set({ repositories })
  },

  pushFiles: async (filePaths: string[], commitMessage: string) => {
    console.log("Original paths:", filePaths);
    // Keep the same directory structure, just remove /app/ prefix
    const githubPaths = filePaths.map(path => path.replace(/^\/app\//, ''))
    console.log("Transformed paths:", githubPaths);
    const { token, selectedRepo } = get()
    if (!selectedRepo) throw new Error('No repository selected')
    
    // Push files
    const response = await fetch(`${API_URL}/github/api/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        repo_name: selectedRepo,
        files: githubPaths,
        commit_message: commitMessage,
        branch: get().currentBranch
      }),
      credentials: 'include'
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to push to repository')
    }

    const data = await response.json()
    if (!data.success) {
      throw new Error(data.message || 'Failed to push to repository')
    }
  },

  fetchWorkspaceFiles: async () => {
    try {
      const response = await fetch(`${API_URL}/workspace/api/list-files`, {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch workspace files')
      }

      const data = await response.json()
      const files = data.files || []
      set({ workspaceFiles: files })
    } catch (error) {
      console.error('Failed to fetch workspace files:', error)
      throw error
    }
  },

  fetchBranches: async () => {
    const { token, selectedRepo } = get()
    if (!selectedRepo) throw new Error('No repository selected')

    const response = await fetch(`${API_URL}/github/branch/api/list-branches`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, repo_name: selectedRepo }),
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Failed to fetch branches')
    }

    const data = await response.json()
    set({ branches: data.branches })
  },

  createBranch: async (branchName: string) => {
    const { token, selectedRepo, currentBranch } = get()
    if (!selectedRepo) throw new Error('No repository selected')

    console.log('Creating branch:', { branchName, currentBranch, selectedRepo })
    const response = await fetch(`${API_URL}/github/branch/api/create-branch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        repo_name: selectedRepo,
        branch_name: branchName,
        from_branch: currentBranch
      }),
      credentials: 'include'
    })

    const data = await response.json()
    console.log('Create branch response:', data)

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Failed to create branch')
    }

    await get().fetchBranches()
  },

  switchBranch: async (branchName: string) => {
    set({ currentBranch: branchName })
    const { fetchRepoFiles } = get()
    await fetchRepoFiles()
  },

  getBranchProtection: async (branchName: string) => {
    const { token, selectedRepo } = get()
    if (!selectedRepo) throw new Error('No repository selected')

    const response = await fetch(`${API_URL}/github/branch/api/protection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        repo_name: selectedRepo,
        branch_name: branchName
      }),
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Failed to fetch branch protection')
    }

    return await response.json()
  },

  fetchRepoFiles: async () => {
    const { token, selectedRepo, currentBranch, workspaceFiles } = get();
    if (!token || !selectedRepo) return

    try {

      const response = await fetch(`${API_URL}/github/api/repo-files`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        repo_name: selectedRepo,
        branch: currentBranch
      }),
      credentials: 'include'
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch repository files' }));
      console.error('Failed to fetch repository files:', errorData);
      
      // Handle empty repository case
      if (errorData.detail?.includes('Git Repository is empty')) {
        console.log('Repository is empty, treating as valid case with no files');
        set({ repoFiles: [], comparisonFiles: await compareFiles(workspaceFiles, []) });
        return;
      }
      
      throw new Error(errorData.detail || 'Failed to fetch repository files');
    }

    const data = await response.json()
    const repoFiles = data.files;
    set({ repoFiles })

    // Update comparison
    const comparisonFiles = await compareFiles(workspaceFiles, repoFiles)
    set({ comparisonFiles })
    } catch (error) {
      console.error('Failed to fetch and compare files:', error)
      throw error
    }
  },

  reset: () => set({
    token: '',
    username: null,
    repositories: [],
    selectedRepo: null,
    isAuthenticated: false,
    workspaceFiles: [],
    branches: [],
    currentBranch: 'main'
  })
}))