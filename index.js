"use strict";

import fs from "node:fs";
import path from "node:path";
import { Octokit, App } from "octokit";

const CONFIG_PATH = path.join(process.cwd(), "ngs.config.json");
const GITHUB_API_VERSION = "2022-11-28";

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({}), "utf8");
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function updateConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function parseStringURL(str) {
  return {
    sha: "",
    resolved: str,
    createdAt: new Date().valueOf(),
    updatedAt: new Date().valueOf(),
  };
}

function parseRemoteURL(str) {
  const parts = str.split("/");
  const owner = parts[0];
  const repo = parts[1];
  const file = parts.slice(2).join("/");
  return [owner, repo, file];
}

function saveFile(filePath, content, encoding = "binary") {
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(filePath, content, encoding);
}

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// https://github.com/octokit/octokit.js?tab=readme-ov-file#constructor-options
function createOctokit(accessToken) {
  const options = {};
  Object.assign(options, accessToken ? { auth: accessToken } : {});
  const octokit = new Octokit(options);
  return octokit;
}

async function getRepo(octokit, owner, repo) {
  const res = await octokit.request("GET /repos/{owner}/{repo}", {
    owner: owner,
    repo: repo,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status !== 200) {
    throw new Error(`Could not connect to repository: ${owner}/${repo}`);
  }

  const content = res.data;

  return content;
}

async function getCommits(octokit, owner, repo) {
  const res = await octokit.request("GET /repos/{owner}/{repo}/commits", {
    owner: owner,
    repo: repo,
    headers: {
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });

  if (res.status !== 200) {
    throw new Error(`Could not connect to repository: ${owner}/${repo}`);
  }

  const content = res.data;

  return content;
}

async function getLatestCommit(octokit, owner, repo) {
  const commits = await getCommits(octokit, owner, repo);
  return commits.shift();
}

async function getLatestHash(octokit, owner, repo) {
  let lastCommit;
  try {
    lastCommit = await getLatestCommit(octokit, owner, repo);
  } catch (err) {
    console.error(err);
  }
  if (!lastCommit) {
    throw new Error("Could not connect to repository");
  }
  return lastCommit.sha;
}

async function downloadFile(octokit, owner, repo, filePath) {
  const res = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner: owner,
      repo: repo,
      path: filePath,
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    }
  );

  if (res.status !== 200) {
    throw new Error(`Could not connect to repository: ${owner}/${repo}`);
  }

  let buffer;
  if (res.data.encoding == "base64") {
    buffer = Buffer.from(res.data.content, res.data.encoding);
  } else if (res.data.encoding == "none" && res.data.download_url) {
    const response = await fetch(res.data.download_url, { method: "GET" });
    buffer = Buffer.from(await response.arrayBuffer());
  }

  if (!buffer) {
    throw new Error(`Could not download file: ${filePath}`);
  }

  return {
    sha: res.data.sha,
    name: res.data.name,
    path: res.data.path,
    buffer: buffer,
  };
}

async function sync(tokens) {
  let remoteHashes = {};

  if (!tokens) {
    tokens = {};
  }

  const c = readConfig();
  for (const localPath of Object.keys(c)) {
    const isExists = fs.existsSync(localPath);

    // Convert to object
    if (typeof c[localPath] == "string") {
      c[localPath] = parseStringURL(c[localPath]);
    }

    const r = c[localPath];

    const [owner, repo, remotePath] = parseRemoteURL(r.resolved);
    const localHash = r.sha;
    const token = tokens?.[owner]?.[repo] || tokens?.[`${owner}/${repo}`];

    const octokit = createOctokit(token);
    let remoteHash;
    if (remoteHashes[`${owner}/${repo}`]) {
      remoteHash = remoteHashes[`${owner}/${repo}`];
    } else {
      remoteHash = await getLatestHash(octokit, owner, repo);
      remoteHashes[`${owner}/${repo}`] = remoteHash;
    }

    const isUpdated = localHash != remoteHash;

    if (!isExists || isUpdated) {
      try {
        const { buffer } = await downloadFile(octokit, owner, repo, remotePath);
        saveFile(localPath, buffer);
        r.sha = remoteHash;
        r.updatedAt = new Date().valueOf();
      } catch (err) {
        console.error(err);
      }
    }
  }

  updateConfig(c);
}

export { sync };
