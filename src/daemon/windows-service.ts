/**
 * Windows Service Control Manager (SCM) Implementation
 *
 * Uses native sc.exe commands for service management.
 * No external dependencies required.
 *
 * Service Name: OpenClawGateway (from constants.ts)
 * Log Directory: %PROGRAMDATA%\OpenClaw\logs\ (machine) or %LOCALAPPDATA%\OpenClaw\logs\ (user)
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	GATEWAY_WINDOWS_SERVICE_NAME,
	resolveGatewayServiceDescription,
} from "./constants.js";
import { resolveGatewayStateDir, resolveWindowsLogDir } from "./paths.js";
import type {
	GatewayServiceCommandConfig,
	GatewayServiceControlArgs,
	GatewayServiceEnvArgs,
	GatewayServiceInstallArgs,
	GatewayServiceManageArgs,
} from "./service-types.js";
import type { GatewayServiceRuntime } from "./service-runtime.js";
import { formatLine } from "./output.js";

// ============================================================================
// Constants
// ============================================================================

const SERVICE_DISPLAY_NAME = "OpenClaw Gateway";
const SERVICE_DESCRIPTION = "OpenClaw control plane gateway daemon";

/**
 * Resolve log directory based on service installation type
 * Uses unified path resolver from paths.ts
 */
function resolveLogDirectory(env: Record<string, string | undefined>): string {
	// Check if running in machine mode (admin privileges)
	const isMachineMode = checkAdminPrivileges();

	// Use unified resolver from paths.ts
	const logDir = resolveWindowsLogDir(env, { machineMode: isMachineMode });

	// Ensure log directory exists
	try {
		fs.mkdirSync(logDir, { recursive: true });
	} catch {
		// Fallback to state dir
		const fallbackDir = path.join(resolveGatewayStateDir(env), "logs");
		fs.mkdirSync(fallbackDir, { recursive: true });
		return fallbackDir;
	}

	return logDir;
}

/**
 * Resolve the openclaw executable path
 * Uses the current Node.js process path
 */
function resolveOpenClawBinaryPath(): string {
	return process.execPath;
}

/**
 * Check if running with administrator privileges
 */
export function checkAdminPrivileges(): boolean {
	try {
		execSync("net session", { stdio: "ignore", windowsHide: true });
		return true;
	} catch {
		return false;
	}
}

/**
 * Execute sc.exe command with proper error handling
 */
function execSc(args: string[]): { code: number; stdout: string; stderr: string } {
	try {
		const stdout = execSync(`sc.exe ${args.join(" ")}`, {
			encoding: "utf8",
			windowsHide: true,
		});
		return { code: 0, stdout: stdout || "", stderr: "" };
	} catch (error: unknown) {
		const err = error as { status?: number; stdout?: string; message?: string };
		return {
			code: err.status ?? 1,
			stdout: err.stdout ?? "",
			stderr: err.message ?? "",
		};
	}
}

/**
 * Build the service binary path with arguments
 */
function buildServiceCommand(args: GatewayServiceInstallArgs): {
	binaryPath: string;
	logPath: string;
} {
	const openclawBin = resolveOpenClawBinaryPath();
	const logDir = resolveLogDirectory(args.env);
	const logPath = path.join(logDir, "gateway.log");

	// Build command with log redirection
	const gatewayArgs = args.programArguments.filter((a) => !a.match(/^--?port$/));
	const portArg = args.programArguments.find((a) => a.match(/^--?port$/))
		? ""
		: "--port 18789";

	// Create a batch script for the service
	const stateDir = resolveGatewayStateDir(args.env);
	const batchPath = path.join(stateDir, "openclaw-gateway.bat");

	// Build environment variables
	let envSet = "";
	if (args.environment) {
		for (const [key, value] of Object.entries(args.environment)) {
			if (value) {
				envSet += `set "${key}=${value}"\n`;
			}
		}
	}

	const batchContent = `@echo off
${envSet}cd /d "${args.workingDirectory || stateDir}"
"${openclawBin}" gateway run ${portArg} ${gatewayArgs.join(" ")} >> "${logPath}" 2>&1
`;

	fs.writeFileSync(batchPath, batchContent, "utf8");

	return {
		binaryPath: batchPath,
		logPath,
	};
}

/**
 * Get service status using sc.exe queryex
 * Returns running state and PID
 */
function queryService(serviceName: string): {
	running: boolean;
	paused: boolean;
	stopped: boolean;
	pid?: number;
} {
	const result = execSc(["queryex", serviceName]);

	if (result.code !== 0) {
		return { running: false, paused: false, stopped: true };
	}

	// Parse output
	const output = result.stdout;
	const stateMatch = output.match(/STATE\s*:\s*(\d+)/);
	const pidMatch = output.match(/PID\s*:\s*(\d+)/);

	if (!stateMatch) {
		return { running: false, paused: false, stopped: true };
	}

	const state = parseInt(stateMatch[1], 10);
	const pid = pidMatch ? parseInt(pidMatch[1], 10) : undefined;

	// Windows service state codes:
	// 1 = STOPPED, 2 = START_PENDING, 3 = STOP_PENDING
	// 4 = RUNNING, 5 = PAUSED, 6 = PAUSE_PENDING, 7 = CONTINUE_PENDING
	return {
		running: state === 4,
		paused: state === 5,
		stopped: state === 1,
		pid,
	};
}

// ============================================================================
// Public API - GatewayService Interface
// ============================================================================

/**
 * Install Windows Service using native SCM (sc.exe)
 */
export async function installWindowsService({
	env,
	stdout,
	programArguments,
	workingDirectory,
	environment,
	description,
}: GatewayServiceInstallArgs): Promise<{ binPath: string }> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;

	// Check admin privileges first
	if (!checkAdminPrivileges()) {
		throw new Error(
			"Administrator privileges required for Windows Service.\n" +
				"Run PowerShell as Administrator and try again.\n" +
				"\n" +
				"Alternatively, use Task Scheduler (no admin required):\n" +
				"  openclaw service install --mode user",
		);
	}

	// Build service command
	const { binaryPath, logPath } = buildServiceCommand({
		env,
		stdout,
		programArguments,
		workingDirectory,
		environment,
	});

	// Stop and delete existing service if any
	const existingStatus = queryService(serviceName);
	if (existingStatus.running || existingStatus.paused || existingStatus.stopped) {
		execSc(["stop", serviceName]);
		execSc(["delete", serviceName]);
	}

	// Create the service using sc.exe
	// binPath must be wrapped in quotes
	const fullBinaryPath = `"${binaryPath}"`;
	const result = execSc([
		"create",
		serviceName,
		`binPath= ${fullBinaryPath}`,
		`DisplayName= ${SERVICE_DISPLAY_NAME}`,
		"start= auto",
	]);

	if (result.code !== 0) {
		const detail = result.stderr || result.stdout;
		if (/access is denied/i.test(detail)) {
			throw new Error(
				`Failed to create service: Access denied.\n` +
					`Run PowerShell as Administrator.`,
			);
		}
		throw new Error(`Failed to create Windows Service: ${detail}`);
	}

	// Set service description
	execSc(["description", serviceName, description ?? SERVICE_DESCRIPTION]);

	// Configure service to restart on failure
	execSc([
		"failure",
		serviceName,
		"reset= 86400",
		"actions= restart/60000/restart/60000/restart/60000",
	]);

	// Start the service
	const startResult = execSc(["start", serviceName]);

	if (startResult.code !== 0) {
		stdout?.write(
			`${formatLine("Warning", "Service created but failed to start automatically")}\n`,
		);
	}

	stdout?.write(
		`${formatLine("Installed Windows Service (SCM)", serviceName)}\n` +
			`${formatLine("Display Name", SERVICE_DISPLAY_NAME)}\n` +
			`${formatLine("Binary", binaryPath)}\n` +
			`${formatLine("Log File", logPath)}\n`,
	);

	return { binPath: binaryPath };
}

/**
 * Uninstall Windows Service
 */
export async function uninstallWindowsService({
	env,
	stdout,
}: GatewayServiceManageArgs): Promise<void> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;

	// Check if service exists
	const status = queryService(serviceName);

	if (!status.running && !status.paused && !status.stopped) {
		stdout?.write(`Service "${serviceName}" not found\n`);
		return;
	}

	// Stop the service
	if (status.running || status.paused) {
		execSc(["stop", serviceName]);
	}

	// Delete the service
	const deleteResult = execSc(["delete", serviceName]);

	if (deleteResult.code !== 0) {
		throw new Error(
			`Failed to delete service: ${deleteResult.stderr || deleteResult.stdout}`,
		);
	}

	stdout?.write(`${formatLine("Removed Windows Service (SCM)", serviceName)}\n`);
}

/**
 * Start Windows Service
 */
export async function startWindowsService({
	stdout,
}: GatewayServiceControlArgs): Promise<void> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;

	const result = execSc(["start", serviceName]);

	if (result.code !== 0) {
		const detail = result.stderr || result.stdout;
		if (/cannot find/i.test(detail.toLowerCase())) {
			throw new Error(`Service "${serviceName}" is not installed`);
		}
		throw new Error(`Failed to start service: ${detail}`);
	}

	stdout?.write(`${formatLine("Started Windows Service (SCM)", serviceName)}\n`);
}

/**
 * Stop Windows Service
 */
export async function stopWindowsService({
	stdout,
}: GatewayServiceControlArgs): Promise<void> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;

	const result = execSc(["stop", serviceName]);

	if (result.code !== 0) {
		const detail = result.stderr || result.stdout;
		if (/cannot find/i.test(detail.toLowerCase())) {
			throw new Error(`Service "${serviceName}" is not installed`);
		}
		// Check if already stopped
		const status = queryService(serviceName);
		if (status.stopped) {
			stdout?.write(`${formatLine("Service already stopped", serviceName)}\n`);
			return;
		}
		throw new Error(`Failed to stop service: ${detail}`);
	}

	stdout?.write(`${formatLine("Stopped Windows Service (SCM)", serviceName)}\n`);
}

/**
 * Restart Windows Service
 */
export async function restartWindowsService(
	args: GatewayServiceControlArgs,
): Promise<void> {
	await stopWindowsService(args);
	await startWindowsService(args);
	args.stdout?.write(
		`${formatLine("Restarted Windows Service (SCM)", GATEWAY_WINDOWS_SERVICE_NAME)}\n`,
	);
}

/**
 * Check if Windows Service is installed
 */
export async function isWindowsServiceInstalled(
	_args: GatewayServiceEnvArgs,
): Promise<boolean> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;
	const result = execSc(["query", serviceName]);
	return result.code === 0;
}

/**
 * Read Windows Service command configuration
 */
export async function readWindowsServiceCommand(
	_args: GatewayServiceEnvArgs,
): Promise<GatewayServiceCommandConfig | null> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;
	const result = execSc(["query", serviceName]);

	if (result.code !== 0) {
		return null;
	}

	// Parse binPath from output
	const binPathMatch = result.stdout.match(/BINPATH\s*:\s*(.+)/i);
	if (!binPathMatch) {
		return null;
	}

	const binPath = binPathMatch[1].trim();
	// Remove quotes if present
	const cleanPath = binPath.replace(/^"|"$/g, "");

	// Parse the batch file to get actual command
	try {
		if (cleanPath.endsWith(".bat") || cleanPath.endsWith(".cmd")) {
			const content = fs.readFileSync(cleanPath, "utf8");
			// Extract command from batch file
			const cmdMatch = content.match(/"[^"]+"\s+gateway\s+run\s+(.+)/);
			if (cmdMatch) {
				const args = cmdMatch[1].trim().split(/\s+/);
				return {
					programArguments: args,
					workingDirectory: path.dirname(cleanPath),
				};
			}
		}
	} catch {
		// Ignore read errors
	}

	return {
		programArguments: [cleanPath],
	};
}

/**
 * Read Windows Service runtime status
 */
export async function readWindowsServiceRuntime(
	_args: GatewayServiceEnvArgs,
): Promise<GatewayServiceRuntime> {
	const serviceName = GATEWAY_WINDOWS_SERVICE_NAME;

	// Check if service exists
	const status = queryService(serviceName);

	if (status.stopped && !status.running && !status.paused) {
		return {
			status: "stopped",
			detail: "Service not installed",
			missingUnit: true,
		};
	}

	// Get additional info from sc.exe query
	const result = execSc(["query", serviceName]);

	let detail = "";
	if (result.code === 0) {
		// Extract useful info
		const lines = result.stdout.split("\n");
		for (const line of lines) {
			if (line.includes("STATE") || line.includes("PID")) {
				detail += line.trim() + " ";
			}
		}
	}

	// Add PID if available
	if (status.pid) {
		detail += `PID: ${status.pid}`;
	}

	return {
		status: status.running ? "running" : "stopped",
		state: status.running ? "Running" : status.paused ? "Paused" : "Stopped",
		detail: detail.trim() || undefined,
	};
}
