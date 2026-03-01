import type { FindExtraGatewayServicesOptions } from "../../daemon/inspect.js";

export type GatewayRpcOpts = {
	url?: string;
	token?: string;
	password?: string;
	timeout?: string;
	json?: boolean;
};

export type DaemonStatusOptions = {
	rpc: GatewayRpcOpts;
	probe: boolean;
	json: boolean;
} & FindExtraGatewayServicesOptions;

export type DaemonInstallOptions = {
	port?: string | number;
	runtime?: string;
	token?: string;
	force?: boolean;
	json?: boolean;
	/**
	 * Service installation mode:
	 * - "auto" (default): Try WinSW, fallback to Task Scheduler on failure
	 * - "winsw": Force WinSW (requires admin rights)
	 * - "user": Use Task Scheduler (no admin required)
	 */
	mode?: "auto" | "winsw" | "user";
};

export type DaemonLifecycleOptions = {
	json?: boolean;
};
