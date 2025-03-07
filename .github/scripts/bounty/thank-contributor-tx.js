const { GithubService } = require("../lib/github");

/**
 * Main function that makes a comment on the PR with the bounty payment details
 * @returns {Promise<void>}
 */
async function main() {
  // Get PR information from environment variables
  const githubToken = process.env.GH_TOKEN;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.REPO; // UraniumCorporation/maiar-ai

  // Step Inputs
  const solanaNetwork = process.env.SOLANA_NETWORK;
  const prAuthor = process.env.PR_AUTHOR;
  const recipientWallet = process.env.RECIPIENT_WALLET;
  const totalBounty = process.env.TOTAL_BOUNTY;
  const issuesToBountyCsv = process.env.ISSUES_TO_BOUNTY_CSV;
  const githubRunId = process.env.GITHUB_RUN_ID || "unknown";

  // Step Outputs from UraniumCorporation/solana-payout-action
  // NOTE: Make sure to set these in the workflow file as environment variables
  const success = process.env.SUCCESS;
  const error = process.env.ERROR;
  const transactionSignature = process.env.TRANSACTION_SIGNATURE;

  if (
    !githubToken ||
    !prNumber ||
    !repo ||
    !solanaNetwork ||
    !prAuthor ||
    !recipientWallet ||
    !totalBounty ||
    !issuesToBountyCsv ||
    !githubRunId
  ) {
    throw new Error(
      "GH_TOKEN, PR_NUMBER, REPO, SOLANA_NETWORK, PR_AUTHOR, RECIPIENT_WALLET, TOTAL_BOUNTY, ISSUES_TO_BOUNTY_CSV, and GITHUB_RUN_ID environment variables are required"
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

  // Fetch CODEOWNERS
  const codeowners = await githubService.getCodeowners();

  const runDate = new Date().toISOString();

  // Booleans in GitHub Actions are represented as "true" or "false" strings
  if (success === "true") {
    const successComment = `
  💰 Bounty Paid!

  - Amount: ${totalBounty} $MAIAR (${issuesToBountyCsv})
  - Network: ${solanaNetwork}
  - Recipient: ${recipientWallet} ([View on Explorer](https://explorer.solana.com/address/${recipientWallet}?cluster=${solanaNetwork}) | [View on Solscan](https://solscan.io/account/${recipientWallet}?cluster=${solanaNetwork}))
  - Transaction: ${transactionSignature} ([View on Explorer](https://explorer.solana.com/tx/${transactionSignature}?cluster=${solanaNetwork}) | [View on Solscan](https://solscan.io/tx/${transactionSignature}?cluster=${solanaNetwork}))

  ${githubService.generateActionInfo(githubRunId, runDate)}
    `;

    await githubService.comment(prNumber, successComment);
  } else {
    const errorComment = `
  ❌💰 Bounty Payment Failed...

  - Error: ${error}
  
  Please contact the CODEOWNERS ${codeowners
    .map((owner) => `@${owner}`)
    .join(", ")} of this repository to resolve this issue.
      
  ${githubService.generateActionInfo(githubRunId, runDate)}
    `;

    await githubService.comment(prNumber, errorComment);
  }
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
