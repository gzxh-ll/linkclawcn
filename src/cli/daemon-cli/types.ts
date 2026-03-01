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
   * - "auto" (default): Try SCM, fallback to Task Scheduler on failure
   * - "scm": Force SCM (requires admin rights)
   * - "user": Use Task Scheduler (no admin required)
   */
  mode?: "auto" | "scm" | "user";
};
  port?: string | number;
  runtime?: string;
  token?: string;
  force?: boolean;
  json?: boolean;
};

export type DaemonLifecycleOptions = {
  json?: boolean;
};
