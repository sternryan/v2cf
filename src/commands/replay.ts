import { Command } from 'commander';
import path from 'path';
import fs from 'node:fs';
import chalk from 'chalk';
import { generateRecorderScript } from '../mirror/capture/recorder-script.js';
import { readSession, listSessions } from '../mirror/capture/session-store.js';
import { runReplay } from '../mirror/replay/engine.js';
import { generateDiff } from '../mirror/comparison/differ.js';
import { generateHtmlReport } from '../mirror/comparison/report-generator.js';

/**
 * Register the `v2cf replay` command with capture, run, and sessions subcommands.
 *
 * - replay capture: Generate recorder script for Vercel site
 * - replay run: Replay a captured session against Cloudflare mirror and generate diff report
 * - replay sessions: List captured sessions
 */
export function registerReplayCommand(program: Command): void {
  const replayCmd = program
    .command('replay')
    .description(
      'Mirror/replay validation: record, replay, and compare'
    );

  // replay capture <project-dir>
  replayCmd
    .command('capture')
    .description('Generate recorder script for Vercel site')
    .argument('<project-dir>', 'Path to the project directory')
    .option('--session-id <id>', 'Session ID (defaults to auto-generated)')
    .option(
      '--max-duration <ms>',
      'Max recording duration in ms',
      '300000'
    )
    .option(
      '--patterns <patterns>',
      'URL patterns to capture (comma-separated)',
      '/api/'
    )
    .action(
      async (
        projectDir: string,
        cmdOpts: {
          sessionId?: string;
          maxDuration: string;
          patterns: string;
        }
      ) => {
        const resolvedDir = path.resolve(projectDir);

        const sessionId =
          cmdOpts.sessionId ??
          `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        const script = generateRecorderScript({
          sessionId,
          maxDuration: parseInt(cmdOpts.maxDuration, 10),
          captureNetworkPatterns: cmdOpts.patterns.split(','),
        });

        // Write script to .v2cf/recorder.html
        const recorderDir = path.join(resolvedDir, '.v2cf');
        fs.mkdirSync(recorderDir, { recursive: true });
        fs.writeFileSync(
          path.join(recorderDir, 'recorder.html'),
          script,
          'utf-8'
        );

        console.log(
          chalk.green('\u2714') +
            ' Recorder script generated.\n'
        );
        console.log(
          'Paste this into your Vercel site\'s <head>:\n'
        );
        console.log(chalk.gray(script));
        console.log('\nSession ID: ' + chalk.cyan(sessionId));
        console.log(
          '\nAfter recording, save session data from browser localStorage'
        );
        console.log(
          `  (key: v2cf_session_${sessionId})`
        );
        console.log(
          `  to ${path.join(resolvedDir, '.v2cf', 'sessions', sessionId + '.json')}`
        );
      }
    );

  // replay run <project-dir>
  replayCmd
    .command('run')
    .description('Replay a captured session against Cloudflare mirror')
    .argument('<project-dir>', 'Path to the project directory')
    .option(
      '--session <id>',
      'Session ID to replay (latest if omitted)'
    )
    .option(
      '--target <url>',
      'Cloudflare mirror URL (required)'
    )
    .option(
      '--patterns <patterns>',
      'LLM URL patterns to intercept (comma-separated)',
      '/api/chat'
    )
    .option(
      '--delay <ms>',
      'Delay between actions in ms',
      '100'
    )
    .action(
      async (
        projectDir: string,
        cmdOpts: {
          session?: string;
          target?: string;
          patterns: string;
          delay: string;
        }
      ) => {
        const resolvedDir = path.resolve(projectDir);

        // Resolve session ID
        let sessionId = cmdOpts.session;
        if (!sessionId) {
          const sessions = listSessions(resolvedDir);
          if (sessions.length === 0) {
            console.error(
              chalk.red('No captured sessions found.') +
                ' Run `v2cf replay capture` first.'
            );
            process.exit(1);
          }
          sessionId = sessions[sessions.length - 1];
          console.log(
            'Using latest session: ' + chalk.cyan(sessionId)
          );
        }

        // Validate target URL
        if (!cmdOpts.target) {
          console.error(
            chalk.red('--target URL is required.') +
              ' Provide the Cloudflare mirror URL.'
          );
          process.exit(1);
        }

        const screenshotDir = path.join(
          resolvedDir,
          '.v2cf',
          'screenshots',
          sessionId
        );

        console.log(
          chalk.cyan('\nReplaying session') +
            ` ${sessionId} against ${cmdOpts.target}...\n`
        );

        // Run replay
        const replayResult = await runReplay({
          targetUrl: cmdOpts.target,
          sessionId,
          projectDir: resolvedDir,
          interceptPatterns: cmdOpts.patterns.split(','),
          actionDelay: parseInt(cmdOpts.delay, 10),
          screenshotDir,
        });

        // Generate diff
        const diffReport = await generateDiff({
          sessionId,
          projectDir: resolvedDir,
          targetUrl: cmdOpts.target,
          replayResult,
          screenshotDir,
        });

        // Generate HTML report
        const reportDir = path.join(resolvedDir, '.v2cf', 'reports');
        const htmlPath = path.join(
          reportDir,
          sessionId + '.html'
        );
        generateHtmlReport(diffReport, htmlPath);

        // Print summary
        console.log('\n--- Replay Results ---\n');
        console.log(
          `Total divergences: ${diffReport.summary.totalDivergences}`
        );
        console.log(
          `  Critical: ${chalk.red(String(diffReport.summary.critical))}`
        );
        console.log(
          `  Warnings: ${chalk.yellow(String(diffReport.summary.warnings))}`
        );
        console.log(
          `  Info: ${chalk.gray(String(diffReport.summary.info))}`
        );

        if (diffReport.summary.canFlipDns) {
          console.log(
            '\n' + chalk.green.bold('READY TO FLIP DNS') + '\n'
          );
        } else {
          console.log(
            '\n' +
              chalk.red.bold('DIVERGENCES DETECTED') +
              ' -- review the report before flipping DNS\n'
          );
        }

        console.log('Full report: ' + htmlPath);

        // macOS: offer to open
        if (process.platform === 'darwin') {
          const { execa } = await import('execa');
          try {
            await execa('open', [htmlPath]);
          } catch {
            // Non-fatal if open fails
          }
        }
      }
    );

  // replay sessions <project-dir>
  replayCmd
    .command('sessions')
    .description('List captured sessions')
    .argument('<project-dir>', 'Path to the project directory')
    .action(async (projectDir: string) => {
      const resolvedDir = path.resolve(projectDir);
      const sessions = listSessions(resolvedDir);

      if (sessions.length === 0) {
        console.log('No captured sessions found.');
        console.log(
          'Run `v2cf replay capture` to generate a recorder script.'
        );
        return;
      }

      console.log(`Found ${sessions.length} session(s):\n`);
      for (const sid of sessions) {
        try {
          const session = readSession(resolvedDir, sid);
          const duration = (
            session.metadata.recordingDuration / 1000
          ).toFixed(1);
          const events = session.rrwebEvents.length;
          const network = session.networkEvents.length;
          console.log(
            `  ${chalk.cyan(sid)}  ${duration}s  ${events} DOM events  ${network} network events`
          );
        } catch {
          console.log(`  ${chalk.cyan(sid)}  (unable to read)`);
        }
      }
    });
}
