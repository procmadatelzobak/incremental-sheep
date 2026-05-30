#!/usr/bin/env node

const MARKER = '<!-- incremental-sheep-preview-url -->';

export function buildPreviewComment(preview) {
  return `${MARKER}
Preview této PR verze je nasazené tady:

${preview.previewUrl}

Commit: \`${String(preview.sha || '').slice(0, 12)}\``;
}

export async function findExistingPreviewComment(fetchCommentsPage) {
  for (let page = 1; ; page++) {
    const comments = await fetchCommentsPage(page);
    const existing = comments.find(comment => (comment.body || '').includes(MARKER));
    if (existing) return existing;
    if (comments.length < 100) return null;
  }
}

async function main() {
  const previews = JSON.parse(process.env.PR_PREVIEWS_JSON || '[]');
  if (!previews.length) return;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo || typeof fetch !== 'function') {
    throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY and fetch are required');
  }

  for (const preview of previews) {
    await upsertComment(repo, token, preview);
  }
}

export async function upsertComment(repo, token, preview) {
  try {
    const api = process.env.GITHUB_API_URL || 'https://api.github.com';
    const existing = await findExistingPreviewComment(page => github(`${api}/repos/${repo}/issues/${preview.number}/comments?per_page=100&page=${page}`, token));
    const body = buildPreviewComment(preview);
    if (existing) {
      await github(`${api}/repos/${repo}/issues/comments/${existing.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
    } else {
      await github(`${api}/repos/${repo}/issues/${preview.number}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 403) {
      console.warn(`Skipping PR preview comment for #${preview.number}: GitHub API returned 403 Forbidden`);
      return { ok: false, skipped: true, reason: 'forbidden' };
    }
    throw err;
  }
}

export class GitHubApiError extends Error {
  constructor(status, statusText) {
    super(`GitHub API failed: ${status} ${statusText}`);
    this.name = 'GitHubApiError';
    this.status = status;
    this.statusText = statusText;
  }
}

async function github(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new GitHubApiError(res.status, res.statusText);
  return res.status === 204 ? null : res.json();
}

if (process.argv[1] && process.argv[1].endsWith('comment-pr-previews.mjs')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
