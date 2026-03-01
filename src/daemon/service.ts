import {
	installWinSwService,
	isWinSwServiceInstalled,
	readWinSwServiceCommand,
	readWinSwServiceRuntime,
	restartWinSwService,
	startWinSwService,
	stopWinSwService,
	uninstallWinSwService,
} from "./winsw.js";
import {
	installLaunchAgent,
	isLaunchAgentLoaded,
	readLaunchAgentProgramArguments,
	readLaunchAgentRuntime,
	restartLaunchAgent,
	stopLaunchAgent,
	uninstallLaunchAgent,
} from "./launchd.js";
import {
	installScheduledTask,
	isScheduledTaskInstalled,
	readScheduledTaskCommand,
	readScheduledTaskRuntime,
	restartScheduledTask,
	stopScheduledTask,
	uninstallScheduledTask,
} from "./schtasks.js";
import {
	installWindowsService,
	isWindowsServiceInstalled,
	readWindowsServiceCommand,
	readWindowsServiceRuntime,
	restartWindowsService,
	startWindowsService,
	stopWindowsService,
	uninstallWindowsService,
} from "./windows-service.js";
import type { GatewayServiceRuntime } from "./service-runtime.js";
import type {
	GatewayServiceCommandConfig,
	GatewayServiceControlArgs,
	GatewayServiceEnv,
	GatewayServiceEnvArgs,
	GatewayServiceInstallArgs,
	GatewayServiceManageArgs,
} from "./service-types.js";
import {
	installSystemdService,
	isSystemdServiceEnabled,
	readSystemdServiceExecStart,
	readSystemdServiceRuntime,
	restartSystemdService,
	stopSystemdService,
	uninstallSystemdService,
} from "./systemd.js";
export type {
	GatewayServiceCommandConfig,
	GatewayServiceControlArgs,
	GatewayServiceEnv,
	GatewayServiceEnvArgs,
	GatewayServiceInstallArgs,
	GatewayServiceManageArgs,
} from "./service-types.js";

function ignoreInstallResult(
	install: (args: GatewayServiceInstallArgs) => Promise<unknown>,
): (args: GatewayServiceInstallArgs) => Promise<void> {
	return async (args) => {
		await install(args);
	};
}

export type GatewayService = {
	label: string;
	loadedText: string;
	notLoadedText: string;
	install: (args: GatewayServiceInstallArgs) => Promise<void>;
	uninstall: (args: GatewayServiceManageArgs) => Promise<void>;
	stop: (args: GatewayServiceControlArgs) => Promise<void>;
	restart: (args: GatewayServiceControlArgs) => Promise<void>;
	isLoaded: (args: GatewayServiceEnvArgs) => Promise<boolean>;
	readCommand: (env: GatewayServiceEnv) => Promise<GatewayServiceCommandConfig | null>;
	readRuntime: (env: GatewayServiceEnv) => Promise<GatewayServiceRuntime>;
};

/**
 * Create a Windows Service manager
 * Supports multiple backends: WinSW, native SCM (sc.exe), Task Scheduler
 */
function createWindowsServiceManager(options?: {
	forceMode: "auto" | "winsw" | "scm" | "user";
}): GatewayService {
	// forceMode: "winsw" - Use WinSW (requires admin)
	// forceMode: "scm" - Use native SCM (sc.exe), no WinSW
	// forceMode: "user" - Use Task Scheduler (no admin required)
	// forceMode: "auto" (default) - Try WinSW, fallback to Task Scheduler
	const forceMode = options?.forceMode ?? "auto";

	// Determine which backend to use
	const useWinSw = forceMode === "winsw" || (forceMode === "auto");
	const useSc = forceMode === "scm";
	const useSchtasks = forceMode === "user" || forceMode === "auto";

	// Label based on mode
	let label = "Windows Service";
	if (forceMode === "winsw") label = "Windows Service (WinSW)";
	else if (forceMode === "scm") label = "Windows Service (SCM)";
	else if (forceMode === "user") label = "Windows Service (Task Scheduler)";

	// Install function with fallback
	const doInstall = async (args: GatewayServiceInstallArgs): Promise<void> => {
		// Try WinSW first (if enabled)
		if (useWinSw) {
			try {
				await installWinSwService(args);
				return;
			} catch (err) {
				const errorMsg = String(err);
				// If admin error, don't fallback - user needs to fix permissions
				if (/administrator|access denied|permission denied/i.test(errorMsg)) {
					throw err;
				}
				// For other errors, try next backend
				args.stdout?.write(
					`WinSW install failed: ${errorMsg}\nTrying native SCM...\n`,
				);
			}
		}

		// Try native SCM (sc.exe)
		if (useSc || (forceMode === "auto" && useWinSw)) {
			try {
				await installWindowsService(args);
				return;
			} catch (err) {
				const errorMsg = String(err);
				if (/administrator|access denied|permission denied/i.test(errorMsg)) {
					throw err;
				}
				args.stdout?.write(
					`SCM install failed: ${errorMsg}\nTrying Task Scheduler...\n`,
				);
			}
		}

		// Fallback to Task Scheduler
		if (useSchtasks) {
			await installScheduledTask(args);
			return;
		}

		throw new Error("No available Windows service backend");
	};

	// Uninstall function
	const doUninstall = async (args: GatewayServiceManageArgs): Promise<void> => {
		if (useWinSw) {
			try {
				await uninstallWinSwService(args);
				return;
			} catch {
				// Ignore
			}
		}
		if (useSc) {
			try {
				await uninstallWindowsService(args);
				return;
			} catch {
				// Ignore
			}
		}
		if (useSchtasks) {
			await uninstallScheduledTask(args);
		}
	};

	// Stop function
	const doStop = async (args: GatewayServiceControlArgs): Promise<void> => {
		if (useWinSw) {
			try {
				await stopWinSwService(args);
				return;
			} catch {
				// Ignore
			}
		}
		if (useSc) {
			try {
				await stopWindowsService(args);
				return;
			} catch {
				// Ignore
			}
		}
		if (useSchtasks) {
			await stopScheduledTask(args);
		}
	};

	// Restart function
	const doRestart = async (args: GatewayServiceControlArgs): Promise<void> => {
		if (useWinSw) {
			try {
				await restartWinSwService(args);
				return;
			} catch {
				// Ignore
			}
		}
		if (useSc) {
			try {
				await restartWindowsService(args);
				return;
			} catch {
				// Ignore
			}
		}
		if (useSchtasks) {
			await restartScheduledTask(args);
		}
	};

	// isLoaded function
	const doIsLoaded = async (args: GatewayServiceEnvArgs): Promise<boolean> => {
		if (useWinSw) {
			const installed = await isWinSwServiceInstalled(args);
			if (installed) return true;
		}
		if (useSc) {
			const installed = await isWindowsServiceInstalled(args);
			if (installed) return true;
		}
		if (useSchtasks) {
			return await isScheduledTaskInstalled(args);
		}
		return false;
	};

	// readCommand function
	const doReadCommand = async (env: GatewayServiceEnv) => {
		if (useWinSw) {
			const cmd = await readWinSwServiceCommand(env);
			if (cmd) return cmd;
		}
		if (useSc) {
			const cmd = await readWindowsServiceCommand(env);
			if (cmd) return cmd;
		}
		if (useSchtasks) {
			return await readScheduledTaskCommand(env);
		}
		return null;
	};

	// readRuntime function
	const doReadRuntime = async (env: GatewayServiceEnv): Promise<GatewayServiceRuntime> => {
		if (useWinSw) {
			const runtime = await readWinSwServiceRuntime(env);
			if (runtime.status !== "unknown" || !runtime.detail?.includes("not found")) {
				return runtime;
			}
		}
		if (useSc) {
			const runtime = await readWindowsServiceRuntime(env);
			if (runtime.status !== "unknown" || !runtime.detail?.includes("not found")) {
				return runtime;
			}
		}
		if (useSchtasks) {
			return await readScheduledTaskRuntime(env);
		}
		return { status: "unknown", detail: "No service backend available" };
	};

	return {
		label,
		loadedText: "running",
		notLoadedText: "not installed",
		install: ignoreInstallResult(doInstall),
		uninstall: doUninstall,
		stop: doStop,
		restart: doRestart,
		isLoaded: doIsLoaded,
		readCommand: doReadCommand,
		readRuntime: doReadRuntime,
	};
}

export type ServiceInstallMode = "auto" | "winsw" | "scm" | "user";

export function resolveGatewayService(options?: {
	mode?: ServiceInstallMode;
}): GatewayService {
	const mode = options?.mode ?? "auto";

	if (process.platform === "darwin") {
		return {
			label: "LaunchAgent",
			loadedText: "loaded",
			notLoadedText: "not loaded",
			install: ignoreInstallResult(installLaunchAgent),
			uninstall: uninstallLaunchAgent,
			stop: stopLaunchAgent,
			restart: restartLaunchAgent,
			isLoaded: isLaunchAgentLoaded,
			readCommand: readLaunchAgentProgramArguments,
			readRuntime: readLaunchAgentRuntime,
		};
	}

	if (process.platform === "linux") {
		return {
			label: "systemd",
			loadedText: "enabled",
			notLoadedText: "disabled",
			install: ignoreInstallResult(installSystemdService),
			uninstall: uninstallSystemdService,
			stop: stopSystemdService,
			restart: restartSystemdService,
			isLoaded: isSystemdServiceEnabled,
			readCommand: readSystemdServiceExecStart,
			readRuntime: readSystemdServiceRuntime,
		};
	}

	if (process.platform === "win32") {
		// mode: "winsw" - Force WinSW (requires admin)
		// mode: "scm" - Force native SCM (sc.exe)
		// mode: "user" - Use Task Scheduler (no admin required)
		// mode: "auto" (default) - Try WinSW -> SCM -> Task Scheduler
		if (mode === "winsw") {
			return createWindowsServiceManager({ forceMode: "winsw" });
		}
		if (mode === "scm") {
			return createWindowsServiceManager({ forceMode: "scm" });
		}
		if (mode === "user") {
			return createWindowsServiceManager({ forceMode: "user" });
		}
		return createWindowsServiceManager({ forceMode: "auto" });
	}

	throw new Error(`Gateway service install not supported on ${process.platform}`);
}
