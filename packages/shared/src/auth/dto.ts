import type { UserRole } from './schemas';

/** The signed-in user (`GET /api/auth/me`). */
export interface MeDto {
  readonly id: number;
  readonly role: UserRole;
  readonly name: string;
  readonly avatar: string | null;
}

/** A learner on the profile picker of a trusted device. */
export interface ProfileDto {
  readonly id: number;
  readonly name: string;
  readonly avatar: string | null;
}

/** A user as the admin sees it. Password and PIN hashes are never included. */
export interface UserDto {
  readonly id: number;
  readonly role: UserRole;
  readonly name: string;
  readonly login: string | null;
  readonly avatar: string | null;
  readonly active: boolean;
  readonly hasPin: boolean;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly deactivatedAt: string | null;
}

export interface DeviceDto {
  readonly id: number;
  readonly name: string;
  /** ISO 8601 */
  readonly createdAt: string;
  readonly revokedAt: string | null;
  /** True for the device the request came from. */
  readonly isCurrent: boolean;
}

export interface SetupStatusDto {
  /** True until the first admin has been created. */
  readonly needed: boolean;
}

/** Body of a 429 answer from login endpoints: seconds until the next attempt. */
export interface RetryAfterDetails {
  readonly retryAfterSec: number;
}
