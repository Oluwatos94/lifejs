// Run `tsc index.ts --module none --target esnext --noEmitOnError false`
// to compile the formatterinto index.js

import type { ChangelogFunctions } from "@changesets/types";
import { Octokit } from "@octokit/rest";
import { config } from "dotenv";
config();

const repoOrg = "LilaRest";
const repoName = "tmp3";
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

type Source = { type: "commit"; hash: string } | { type: "pull-request"; id: number };

async function findPRfromCommit(sha: string): Promise<number | null> {
  const { data } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
    owner: repoOrg,
    repo: repoName,
    commit_sha: sha,
  });
  const pr = data.find((pr) => pr.merged_at) ?? data[0];
  return pr?.number ?? null;
}

async function getAuthors(source: Source): Promise<string[]> {
  if (source.type === "pull-request") {
    const authors = new Set<string>();
    const per_page = 100;
    for (let page = 1; ; page++) {
      const { data: commits } = await octokit.rest.pulls.listCommits({
        owner: repoOrg,
        repo: repoName,
        pull_number: source.id,
        per_page,
        page,
      });
      for (const c of commits) {
        authors.add(c.author?.login ?? c.commit.author?.name ?? "unknown");
      }
      if (commits.length < per_page) break;
    }
    return [...authors];
  } else {
    const { data } = await octokit.rest.repos.getCommit({
      owner: repoOrg,
      repo: repoName,
      ref: source.hash,
    });
    return [data.author?.login ?? data.commit.author?.name ?? "unknown"];
  }
}

const changelogFunctions: ChangelogFunctions = {
  getDependencyReleaseLine: async () => "",
  getReleaseLine: async (changeset, type) => {
    // Cleanly error if env variable is not set
    if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set.");

    // Block major versions unless explicitly uncommented
    if (type === "major") throw new Error("Uncomment this line to publish major versions.");

    // Error if the summary is empty
    if (!changeset.summary.trim()) throw new Error(`Changeset '${changeset.id}' is empty.`);

    // Retrieve the source of the changeset
    const commitHash = changeset.commit;
    if (!commitHash) throw new Error(`Changeset '${changeset.id}' does not contain a commit hash.`);
    const pullRequestId = await findPRfromCommit(commitHash);
    const source: Source = pullRequestId
      ? { type: "pull-request", id: pullRequestId }
      : { type: "commit", hash: commitHash };

    // Retrieve the authors of the source
    const authors = await getAuthors(source);

    // Generate release line
    const authorsWithLinks = authors.map((author) => `[@${author}](https://github.com/${author})`);
    const sourceWithLinks =
      source.type === "commit"
        ? `[${source.hash.slice(0, 7)}](https://github.com/${repoOrg}/${repoName}/commit/${source.hash})`
        : `[#${source.id}](https://github.com/${repoOrg}/${repoName}/pull/${source.id})`;
    return `- (${authorsWithLinks.join(", ")} in ${sourceWithLinks}) ${changeset.summary.trim()}`;
  },
};

export default changelogFunctions;
