/**
 * Git Integration Utilities
 * Simple git operations for branch detection and status
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface GitStatus {
  branch: string | null;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  staged_diff?: string;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    const gitDir = path.join(dir, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

/**
 * Get the current git branch
 */
export async function getCurrentBranch(cwd?: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: cwd || process.cwd(),
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get git status
 */
export async function getGitStatus(cwd?: string): Promise<GitStatus | null> {
  try {
    const branch = await getCurrentBranch(cwd);

    // Get status
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: cwd || process.cwd(),
    });

    const modified: string[] = [];
    const added: string[] = [];
    const deleted: string[] = [];
    const untracked: string[] = [];

    // Parse status output
    for (const line of statusOutput.split('\n')) {
      if (!line.trim()) continue;

      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status.includes('M')) modified.push(file);
      if (status.includes('A')) added.push(file);
      if (status.includes('D')) deleted.push(file);
      if (status.includes('?')) untracked.push(file);
    }

    // Get ahead/behind counts
    let ahead = 0;
    let behind = 0;

    try {
      const { stdout: aheadBehind } = await execAsync(
        'git rev-list --left-right --count @{upstream}...HEAD',
        {
          cwd: cwd || process.cwd(),
        }
      );
      const [behindStr, aheadStr] = aheadBehind.trim().split('\t');
      ahead = parseInt(aheadStr, 10) || 0;
      behind = parseInt(behindStr, 10) || 0;
    } catch {
      // No upstream or not tracking
    }

    // Capture staged diff (intentional changes user has git added to staging area)
    let staged_diff: string | undefined;
    try {
      const { stdout: diff } = await execAsync('git diff --cached', {
        cwd: cwd || process.cwd(),
      });

      if (diff.trim()) {
        const MAX_DIFF_SIZE = 50000; // 50KB limit
        if (diff.length > MAX_DIFF_SIZE) {
          staged_diff = `[Diff truncated: ${diff.length} bytes total]\n${diff.substring(0, MAX_DIFF_SIZE)}`;
        } else {
          staged_diff = diff;
        }
      }
    } catch {
      // No staged changes or git not available
    }

    return {
      branch,
      modified,
      added,
      deleted,
      untracked,
      ahead,
      behind,
      staged_diff,
    };
  } catch {
    return null;
  }
}

/**
 * Format git status as string (for checkpoint storage)
 */
export function formatGitStatus(status: GitStatus): string {
  const parts: string[] = [];

  if (status.branch) {
    parts.push(`Branch: ${status.branch}`);
  }

  if (status.ahead > 0) {
    parts.push(`Ahead: ${status.ahead}`);
  }

  if (status.behind > 0) {
    parts.push(`Behind: ${status.behind}`);
  }

  if (status.modified.length > 0) {
    parts.push(`Modified: ${status.modified.length} files`);
  }

  if (status.added.length > 0) {
    parts.push(`Added: ${status.added.length} files`);
  }

  if (status.deleted.length > 0) {
    parts.push(`Deleted: ${status.deleted.length} files`);
  }

  if (status.untracked.length > 0) {
    parts.push(`Untracked: ${status.untracked.length} files`);
  }

  return parts.join(', ') || 'Clean working directory';
}
