import { GithubService } from "../lib/github.js";

/**
 * Main function that thanks the contributor for their contribution
 * @returns {Promise<void>}
 */
async function main() {
  // Get PR information from environment variables
  const githubToken = process.env.GH_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO; // UraniumCorporation/maiar-ai
  const prAuthor = process.env.PR_AUTHOR;

  if (!githubToken || !prNumber || !repo || !prAuthor) {
    throw new Error(
      "GH_TOKEN, PR_NUMBER, REPO, and PR_AUTHOR environment variables are required"
    );
  }

  // Parse repository string into owner and repo components
  const [owner, repoName] = repo.split("/");

  console.log(`Repository: ${repo} (https://github.com/${repo})`);
  console.log(
    `Pull Request Number: #${prNumber} (https://github.com/${repo}/pull/${prNumber})`
  );

  const githubService = new GithubService(
    githubToken,
    owner,
    repoName,
    prNumber
  );

  const comment = `🎉 Thank you @${prAuthor} for your contribution!`;
  await githubService.comment(prNumber, comment);
}

// Execute the main function and handle outputs/errors
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
