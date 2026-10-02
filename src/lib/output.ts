/**
 * Formatters: text, json, github (GH Actions annotations)
 */

import chalk from "chalk";

export type OutputFormat = "text" | "json" | "github";

export function formatLintText(result: {
  score: number;
  errors: Array<{ line?: number; message: string; rule: string }>;
  warnings: Array<{ line?: number; message: string; rule: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`  Score: ${result.score}/100`);
  lines.push("");
  lines.push(`  Errors (${result.errors.length}):`);
  for (const e of result.errors) {
    lines.push(`    line ${e.line ?? "?"}  ${e.rule}  ${e.message}`);
  }
  if (result.errors.length === 0) lines.push("    (none)");
  lines.push("");
  lines.push(`  Warnings (${result.warnings.length}):`);
  for (const w of result.warnings) {
    lines.push(`    line ${w.line ?? "?"}  ${w.rule}  ${w.message}`);
  }
  if (result.warnings.length === 0) lines.push("    (none)");
  lines.push("");
  if (result.errors.length === 0) {
    lines.push(chalk.green("  ✓ 0 errors. Spec is publishable."));
  } else {
    lines.push(chalk.red(`  ✗ ${result.errors.length} errors. Fix before publishing.`));
  }
  return lines.join("\n");
}

export function formatPublishText(output: {
  apiId: string;
  version: string;
  specUrl: string;
  mockUrl?: string;
  apiName?: string;
  teamName?: string;
  registryUrl?: string;
  noChanges?: boolean;
  versionUnchanged?: boolean;
  versionUnchangedHint?: string;
  created?: boolean;
  governanceWarnings?: Array<{ section?: string; message?: string }>;
}): string {
  const lines: string[] = [];

  if (output.noChanges) {
    lines.push(chalk.green("✓ Already up to date") + chalk.gray(" (git SHA unchanged)"));
    if (output.apiName) lines.push(`  api:      ${output.apiName} @ v${output.version}`);
    if (output.registryUrl) lines.push(`  registry: ${output.registryUrl}`);
    return lines.join("\n");
  }

  const label = output.created ? chalk.green("✓ Created") : chalk.green("✓ Updated");
  const nameLabel = output.apiName ?? output.apiId;
  lines.push(`${label} ${chalk.bold(nameLabel)} v${output.version}`);

  if (output.apiName) lines.push(`  api:      ${output.apiName}`);
  if (output.teamName) lines.push(`  team:     ${output.teamName}`);
  if (output.registryUrl) lines.push(`  registry: ${output.registryUrl}`);
  lines.push(`  spec page: ${output.specUrl}`);
  if (output.mockUrl) lines.push(`  mock:     ${output.mockUrl}`);

  if (output.versionUnchanged) {
    lines.push("");
    lines.push(
      chalk.yellow("⚠ ") +
        chalk.yellow(
          output.versionUnchangedHint ??
            `Spec changed but version is still ${output.version}. Pass --semver to auto-bump.`,
        ),
    );
  }

  const warnings = output.governanceWarnings ?? [];
  if (warnings.length > 0) {
    lines.push("");
    lines.push(
      chalk.yellow(`⚠ ${warnings.length} governance warning${warnings.length === 1 ? "" : "s"}:`),
    );
    for (const w of warnings) {
      lines.push(chalk.yellow(`  [${w.section ?? "policy"}] ${w.message ?? ""}`));
    }
  }

  return lines.join("\n");
}

export function formatGitHubAnnotation(
  file: string,
  line: number,
  level: "error" | "warning",
  message: string,
): string {
  return `::${level} file=${file},line=${line}::${message.replace(/\n/g, "%0A")}`;
}
