export type FeatureFlagName =
  | "ENABLE_DASHBOARD_SMART_ALERTS"
  | "ENABLE_PLANNING_DRAGDROP"
  | "ENABLE_VISUAL_TEMPLATE_EDITOR"
  | "ENABLE_STRICT_ACTION_LOCK";

type FeatureFlags = Record<FeatureFlagName, boolean>;

const DEFAULT_FLAGS: FeatureFlags = {
  ENABLE_DASHBOARD_SMART_ALERTS: true,
  ENABLE_PLANNING_DRAGDROP: true,
  ENABLE_VISUAL_TEMPLATE_EDITOR: true,
  ENABLE_STRICT_ACTION_LOCK: true,
};

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

export function getFeatureFlags(): FeatureFlags {
  return {
    ENABLE_DASHBOARD_SMART_ALERTS: parseBooleanEnv(process.env.ENABLE_DASHBOARD_SMART_ALERTS, DEFAULT_FLAGS.ENABLE_DASHBOARD_SMART_ALERTS),
    ENABLE_PLANNING_DRAGDROP: parseBooleanEnv(process.env.ENABLE_PLANNING_DRAGDROP, DEFAULT_FLAGS.ENABLE_PLANNING_DRAGDROP),
    ENABLE_VISUAL_TEMPLATE_EDITOR: parseBooleanEnv(process.env.ENABLE_VISUAL_TEMPLATE_EDITOR, DEFAULT_FLAGS.ENABLE_VISUAL_TEMPLATE_EDITOR),
    ENABLE_STRICT_ACTION_LOCK: parseBooleanEnv(process.env.ENABLE_STRICT_ACTION_LOCK, DEFAULT_FLAGS.ENABLE_STRICT_ACTION_LOCK),
  };
}

export function isFeatureEnabled(flag: FeatureFlagName): boolean {
  return getFeatureFlags()[flag];
}
