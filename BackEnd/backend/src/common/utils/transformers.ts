import { Transform } from 'class-transformer';

/** Query-string boolean: "true"/"1" → true, "false"/"0" → false, anything else left for @IsBoolean to reject. */
export const ToBoolean = () =>
  Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  });

/** Trims strings; converts empty strings to undefined so optional fields stay optional. */
export const Trim = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? undefined : t;
  });

/** Trims strings but keeps explicit null (used for "clear this field" on PATCH). */
export const TrimNullable = () =>
  Transform(({ value }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t === '' ? null : t;
  });

export const ToLowerCaseTrimmed = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
