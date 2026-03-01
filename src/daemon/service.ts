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
 * Create a Windows Service manager that falls back to Task Scheduler on failure
 */
function createWindowsServiceManager(): GatewayService {
	// Track if SCM is available
	let scmAvailable = true;

	const tryInstallScm = async (args: GatewayServiceInstallArgs): Promise<{ binPath?: string }> => {
		if (!scmAvailable) {
			throw new Error("SCM not available, falling back to Task Scheduler");
		}
		try {
			return await installWindowsService(args);
		} catch (err) {
			const errorMsg = String(err);
			// Check if it's an admin/permission error
			if (/administrator|access denied|permission denied/i.test(errorMsg)) {
				scmAvailable = false;
				throw new Error(
					"Administrator privileges required for SCM. Run PowerShell as Administrator or use Task Scheduler fallback.",
				);
			}
			// For other errors, also fallback to schtasks
			scmAvailable = false;
			throw err;
		}
	};

	const tryInstallSchtasks = async (
		args: GatewayServiceInstallArgs,
	): Promise<{ scriptPath: string }> => {
		return await installScheduledTask(args) as { scriptPath: string };
	};

	return {
		label: "Windows Service",
		loadedText: "running",
		notLoadedText: "not installed",
		install: ignoreInstallResult(async (args) => {
			// Try SCM first
			if (scmAvailable) {
				try {
					await tryInstallScm(args);
					return;
				} catch (err) {
					const errorMsg = String(err);
					// If admin error, don't fallback - user needs to fix permissions
					if (/administrator|access denied|permission denied/i.test(errorMsg)) {
						throw err;
					}
					// For other errors, try schtasks fallback
					args.stdout?.write(
						`SCM install failed: ${errorMsg}\nFalling back to Task Scheduler...\n`,
					);
				}
			}
			// Fallback to Task Scheduler
			await tryInstallSchtasks(args);
		}),
		uninstall: async (args) => {
			// Try SCM first, then schtasks
			if (scmAvailable) {
				try {
					await uninstallWindowsService(args);
					return;
				} catch {
					// Ignore SCM uninstall errors, try schtasks
				}
			}
			await uninstallScheduledTask(args);
		},
		stop: async (args) => {
			if (scmAvailable) {
				try {
					await stopWindowsService(args);
					return;
				} catch {
					// Ignore
				}
			}
			await stopScheduledTask(args);
		},
		restart: async (args) => {
			if (scmAvailable) {
				try {
					await restartWindowsService(args);
					return;
				} catch {
					// Ignore
				}
			}
			await restartScheduledTask(args);
		},
		isLoaded: async (args) => {
			// Check SCM first
			if (scmAvailable) {
				const scmInstalled = await isWindowsServiceInstalled(args);
				if (scmInstalled) {
					return true;
				}
			}
			// Fallback to schtasks
			return await isScheduledTaskInstalled(args);
		},
		readCommand: async (env) => {
			if (scmAvailable) {
				const scmCmd = await readWindowsServiceCommand(env);
				if (scmCmd) {
					return scmCmd;
				}
			}
			return await readScheduledTaskCommand(env);
		},
		readRuntime: async (env) => {
			if (scmAvailable) {
				const scmRuntime = await readWindowsServiceRuntime(env);
				// If service is found in SCM, return it
				if (scmRuntime.status !== "unknown" || !scmRuntime.detail?.includes("not found")) {
					return scmRuntime;
				}
			}
			// Fallback to schtasks
			return await readScheduledTaskRuntime(env);
		},
	};
}

export function resolveGatewayService(): GatewayService {
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
		// Use Windows SCM Service (preferred) with Task Scheduler fallback
		return createWindowsServiceManager();
	}

	throw new Error(`Gateway service install not supported on ${process.platform}`);
}
