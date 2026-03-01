import path from "node:path";
import { resolveGatewayProfileSuffix } from "./constants.js";

const windowsAbsolutePath = /^[a-zA-Z]:[\\/]/;
const windowsUncPath = /^\\/;

// Windows log directory constants
export const WINDOWS_LOG_DIR_MACHINE = "logs"; // under %PROGRAMDATA%\OpenClaw
export const WINDOWS_LOG_DIR_USER = "logs"; // under %LOCALAPPDATA%\OpenClaw
export const WINDOWS_APP_NAME = "OpenClaw";

/**
 * Resolve Windows log directory based on installation mode
 *
 * @param env - Environment variables
 * @param options.machineMode - If true, use machine-wide directory (requires admin)
 * @returns Resolved log directory path
 */
export function resolveWindowsLogDir(
	env: Record<string, string | undefined>,
	options?: { machineMode?: boolean },
): string {
	const machineMode = options?.machineMode ?? false;

	let baseDir: string | undefined;

	if (machineMode) {
		// Machine mode: %PROGRAMDATA%\OpenClaw\logs
		baseDir = env.PROGRAMDATA || process.env.PROGRAMDATA;
	} else {
		// User mode: %LOCALAPPDATA%\OpenClaw\logs
		baseDir = env.LOCALAPPDATA || process.env.LOCALAPPDATA;
	}

	// Fallback to state directory if env var not available
	if (!baseDir) {
		return path.join(resolveGatewayStateDir(env), "logs");
	}

// Use appropriate log directory based on mode
	const logDirName = machineMode ? WINDOWS_LOG_DIR_MACHINE : WINDOWS_LOG_DIR_USER;
	return path.join(baseDir, WINDOWS_APP_NAME, logDirName);
}

/**
 * Check if running with administrator privileges on Windows
 */
export function checkIsMachineMode(): boolean {
	if (process.platform !== "win32") {
		return false;
	}
	try {
		require("child_process").execSync("net session", { stdio: "ignore", windowsHide: true });
		return true;
	} catch {
		return false;
	}
}

export function resolveHomeDir(env: Record<string, string | undefined>): string {
	const home = env.HOME?.trim() || env.USERPROFILE?.trim();
	if (!home) {
		throw new Error("Missing HOME");
	}
	return home;
}

export function resolveUserPathWithHome(input: string, home?: string): string {
	const trimmed = input.trim();
	if (!trimmed) {
		return trimmed;
	}
	if (trimmed.startsWith("~")) {
		if (!home) {
			throw new Error("Missing HOME");
		}
		const expanded = trimmed.replace(/^~(?=$|[\\/])/, home);
		return path.resolve(expanded);
	}
	if (windowsAbsolutePath.test(trimmed) || windowsUncPath.test(trimmed)) {
		return trimmed;
	}
	return path.resolve(trimmed);
}

export function resolveGatewayStateDir(env: Record<string, string | undefined>): string {
	const override = env.OPENCLAW_STATE_DIR?.trim();
	if (override) {
		const home = override.startsWith("~") ? resolveHomeDir(env) : undefined;
		return resolveUserPathWithHome(override, home);
	}
	const home = resolveHomeDir(env);
	const suffix = resolveGatewayProfileSuffix(env.OPENCLAW_PROFILE);
	return path.join(home, `.openclaw${suffix}`);
}
