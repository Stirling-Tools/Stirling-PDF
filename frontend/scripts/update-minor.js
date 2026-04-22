#!/usr/bin/env node

/**
 * Cross-platform update:minor script
 * Calculates date from 7 days ago and runs npm update/audit with that date
 */

const { spawn } = require("child_process");

// Calculate date from 7 days ago in YYYY-MM-DD format
const date = new Date();
date.setDate(date.getDate() - 7);
const beforeDate = date.toISOString().split("T")[0];

console.log(`Updating packages modified before: ${beforeDate}`);

// Run npm outdated first
const outdated = spawn("npm", ["outdated"], { stdio: "inherit", shell: true });

outdated.on("close", (_code) => {
  // npm outdated returns exit code 1 if updates are available, so we ignore it

  // Run npm update with before date
  const update = spawn("npm", ["update", `--before=${beforeDate}`], {
    stdio: "inherit",
    shell: true,
  });

  update.on("close", (_updateCode) => {
    // Run npm audit fix with before date
    const audit = spawn("npm", ["audit", "fix", `--before=${beforeDate}`], {
      stdio: "inherit",
      shell: true,
    });

    audit.on("close", () => {
      // Update complete - test script is optional
      console.log("\nPackage update complete!");
      process.exit(0);
    });
  });
});
