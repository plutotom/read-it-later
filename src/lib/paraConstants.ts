/** 3 MB — UI warning threshold only; exports are never blocked */
export const PARA_SIZE_WARNING_BYTES = 3 * 1024 * 1024;

export const PARA_READ_SCOPE = "para:read" as const;

/** Public REST API (/api/v1) scopes. */
export const RIL_READ_SCOPE = "ril:read" as const;
export const RIL_WRITE_SCOPE = "ril:write" as const;

/** All scopes a read-only key receives. */
export const READ_ONLY_SCOPES = [RIL_READ_SCOPE, PARA_READ_SCOPE] as const;
/** All scopes a read+write key receives. */
export const READ_WRITE_SCOPES = [
  RIL_READ_SCOPE,
  RIL_WRITE_SCOPE,
  PARA_READ_SCOPE,
] as const;

export const API_KEY_PREFIX = "ril_";
