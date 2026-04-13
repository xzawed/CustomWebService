import { logger } from '@/lib/utils/logger';
import type { FileEntry } from '@/providers/deploy/IDeployProvider';

const GITHUB_API = 'https://api.github.com';

function getHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function getOrg(): string {
  const org = process.env.GITHUB_ORG;
  if (!org) throw new Error('GITHUB_ORG is not set');
  return org;
}

export async function createRepository(
  name: string,
  description?: string
): Promise<{ repoUrl: string; fullName: string }> {
  const org = getOrg();

  const res = await fetch(`${GITHUB_API}/orgs/${org}/repos`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name,
      description: description ?? `Auto-generated service: ${name}`,
      private: false,
      auto_init: true,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // If repo already exists, fetch it
    if (res.status === 422 && JSON.stringify(body).includes('already exists')) {
      logger.info('Repository already exists, reusing', { name, org });
      return {
        repoUrl: `https://github.com/${org}/${name}`,
        fullName: `${org}/${name}`,
      };
    }
    throw new Error(`GitHub repo creation failed: ${res.status} ${JSON.stringify(body)}`);
  }

  const data = await res.json();
  logger.info('GitHub repository created', { name, fullName: data.full_name });

  return {
    repoUrl: data.html_url as string,
    fullName: data.full_name as string,
  };
}

export async function pushCode(repoFullName: string, files: FileEntry[]): Promise<void> {
  const headers = getHeaders();

  // Get default branch ref
  const refRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/ref/heads/main`, { headers });
  if (!refRes.ok) {
    throw new Error(`Failed to get ref: ${refRes.status}`);
  }
  const refData = await refRes.json();
  const latestCommitSha = refData.object.sha as string;

  // Get the tree of the latest commit
  const commitRes = await fetch(
    `${GITHUB_API}/repos/${repoFullName}/git/commits/${latestCommitSha}`,
    { headers }
  );
  if (!commitRes.ok) {
    throw new Error(`Failed to get commit: ${commitRes.status}`);
  }
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha as string;

  // Create blobs for each file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blobRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/blobs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content: file.content,
          encoding: 'utf-8',
        }),
      });
      if (!blobRes.ok) {
        throw new Error(`Failed to create blob for ${file.path}: ${blobRes.status}`);
      }
      const blobData = await blobRes.json();
      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: blobData.sha as string,
      };
    })
  );

  // Create a new tree
  const treeRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeRes.ok) {
    throw new Error(`Failed to create tree: ${treeRes.status}`);
  }
  const treeData = await treeRes.json();

  // Create a new commit
  const newCommitRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'feat: auto-generated service code',
      tree: treeData.sha,
      parents: [latestCommitSha],
    }),
  });
  if (!newCommitRes.ok) {
    throw new Error(`Failed to create commit: ${newCommitRes.status}`);
  }
  const newCommitData = await newCommitRes.json();

  // Update ref
  const updateRefRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommitData.sha }),
  });
  if (!updateRefRes.ok) {
    throw new Error(`Failed to update ref: ${updateRefRes.status}`);
  }

  logger.info('Code pushed to GitHub', { repoFullName, fileCount: files.length });
}

export async function setSecrets(
  repoFullName: string,
  secrets: Record<string, string>
): Promise<void> {
  const headers = getHeaders();

  // Get public key for encrypting secrets
  const keyRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/actions/secrets/public-key`, {
    headers,
  });
  if (!keyRes.ok) {
    logger.warn('Failed to get public key for secrets', { repoFullName, status: keyRes.status });
    return;
  }
  const keyData = await keyRes.json();

  // TODO(secrets): libsodium(tweetnacl)으로 Actions secret 암호화 후 주입 필요.
  // 현재 이 함수는 no-op로 동작하며, 배포 시 secret은 수동 설정을 전제로 함.
  // 구현 방법:
  //   npm install tweetnacl tweetnacl-util
  //   import nacl from 'tweetnacl';
  //   import { encodeBase64, decodeBase64 } from 'tweetnacl-util';
  //   const keyBytes = decodeBase64(keyData.key);
  //   const valueBytes = new TextEncoder().encode(value);
  //   const encrypted = nacl.box.seal(valueBytes, keyBytes);
  //   const encrypted_value = encodeBase64(encrypted);
  //   PUT /repos/{owner}/{repo}/actions/secrets/{secret_name} with { encrypted_value, key_id }
  if (Object.keys(secrets).length > 0) {
    logger.warn(
      'GitHub Actions secret injection skipped: libsodium encryption not yet implemented. ' +
      'Secrets must be set manually in the repository settings.',
      { repoFullName, secretNames: Object.keys(secrets) }
    );
  }

  logger.info('Secrets configured', { repoFullName, secretCount: Object.keys(secrets).length });
}

export async function enableGithubPages(
  repoFullName: string,
  branch = 'main',
  path = '/'
): Promise<string> {
  const headers = getHeaders();

  const res = await fetch(`${GITHUB_API}/repos/${repoFullName}/pages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: { branch, path },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // If Pages is already enabled, try to get the URL
    if (res.status === 409) {
      const pagesRes = await fetch(`${GITHUB_API}/repos/${repoFullName}/pages`, { headers });
      if (pagesRes.ok) {
        const pagesData = await pagesRes.json();
        return pagesData.html_url as string;
      }
    }
    throw new Error(`Failed to enable GitHub Pages: ${res.status} ${JSON.stringify(body)}`);
  }

  const data = await res.json();
  return data.html_url as string;
}
