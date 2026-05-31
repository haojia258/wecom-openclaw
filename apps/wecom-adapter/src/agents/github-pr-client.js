"use strict";

/**
 * github-pr-client.js - GitHub REST API 客户端
 *
 * 功能: 创建分支、提交文件、创建 Draft PR
 * 认证: process.env.GITHUB_TOKEN
 * 仓库: process.env.GITHUB_REPO (默认 haojia258/wecom-openclaw)
 */

const axios = require("axios");

const GITHUB_API = "https://api.github.com";

function getAuthHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN 环境变量未设置");
  }
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "wecom-openclaw-codex-agent"
  };
}

function parseRepo(repoStr) {
  const repo = repoStr || process.env.GITHUB_REPO || "haojia258/wecom-openclaw";
  const parts = repo.split("/");
  if (parts.length !== 2) {
    throw new Error("GITHUB_REPO 格式错误: " + repo + " (应为 owner/repo)");
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * 获取分支最新 commit SHA
 */
async function getBranchSHA(owner, repo, branch) {
  const url = GITHUB_API + "/repos/" + owner + "/" + repo + "/git/ref/heads/" + branch;
  try {
    const res = await axios.get(url, { headers: getAuthHeaders() });
    return res.data.object.sha;
  } catch (e) {
    if (e.response && e.response.status === 404) {
      return null;
    }
    throw e;
  }
}

/**
 * 创建新分支 (从 baseBranch)
 */
async function createBranch(owner, repo, branchName, baseBranch) {
  const baseSHA = await getBranchSHA(owner, repo, baseBranch);
  if (!baseSHA) {
    throw new Error("Base 分支不存在: " + baseBranch);
  }

  // 检查分支是否已存在
  const existing = await getBranchSHA(owner, repo, branchName);
  if (existing) {
    return { created: false, branch: branchName, sha: existing };
  }

  const url = GITHUB_API + "/repos/" + owner + "/" + repo + "/git/refs";
  const res = await axios.post(url, {
    ref: "refs/heads/" + branchName,
    sha: baseSHA
  }, { headers: getAuthHeaders() });

  return { created: true, branch: branchName, sha: baseSHA };
}

/**
 * 在分支上提交文件
 */
async function commitFile(owner, repo, branch, filePath, content, message) {
  const headers = getAuthHeaders();

  // 1. 获取分支当前 HEAD commit 的 tree SHA
  const branchRef = await getBranchSHA(owner, repo, branch);
  const commitRes = await axios.get(
    GITHUB_API + "/repos/" + owner + "/" + repo + "/git/commits/" + branchRef,
    { headers: headers }
  );
  const baseTreeSHA = commitRes.data.tree.sha;

  // 2. 创建 blob
  const blobRes = await axios.post(
    GITHUB_API + "/repos/" + owner + "/" + repo + "/git/blobs",
    { content: content, encoding: "utf-8" },
    { headers: headers }
  );
  const blobSHA = blobRes.data.sha;

  // 3. 创建新 tree
  const treeRes = await axios.post(
    GITHUB_API + "/repos/" + owner + "/" + repo + "/git/trees",
    {
      base_tree: baseTreeSHA,
      tree: [{ path: filePath, mode: "100644", type: "blob", sha: blobSHA }]
    },
    { headers: headers }
  );
  const newTreeSHA = treeRes.data.sha;

  // 4. 创建 commit
  const newCommitRes = await axios.post(
    GITHUB_API + "/repos/" + owner + "/" + repo + "/git/commits",
    {
      message: message,
      tree: newTreeSHA,
      parents: [branchRef]
    },
    { headers: headers }
  );
  const newCommitSHA = newCommitRes.data.sha;

  // 5. 更新分支 ref
  await axios.patch(
    GITHUB_API + "/repos/" + owner + "/" + repo + "/git/refs/heads/" + branch,
    { sha: newCommitSHA, force: false },
    { headers: headers }
  );

  return { committed: true, sha: newCommitSHA, path: filePath };
}

/**
 * 创建 Draft PR
 */
async function createDraftPR(owner, repo, title, head, base, body) {
  const headers = getAuthHeaders();
  const url = GITHUB_API + "/repos/" + owner + "/" + repo + "/pulls";

  const res = await axios.post(url, {
    title: title,
    head: head,
    base: base,
    body: body || "",
    draft: true
  }, { headers: headers });

  return {
    number: res.data.number,
    html_url: res.data.html_url,
    title: res.data.title,
    state: res.data.state,
    draft: res.data.draft
  };
}

module.exports = {
  parseRepo: parseRepo,
  getBranchSHA: getBranchSHA,
  createBranch: createBranch,
  commitFile: commitFile,
  createDraftPR: createDraftPR
};
