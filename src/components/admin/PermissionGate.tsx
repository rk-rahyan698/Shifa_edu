/**
 * `PermissionGate` (T-051) — ARCHITECTURE.md §A-5.3 rule 4.
 *
 * > `PermissionGate` is presentation only. It carries no security meaning and
 * > its removal must change nothing about what the server allows.
 *
 * That rule is the card's Contract, and this file is built so the rule cannot
 * be broken by accident rather than merely documented as an intention.
 *
 * **The gate takes a decision, it does not make one.** It accepts `allowed` as
 * a boolean the caller has already obtained from `can()` (T-031) on the server.
 * It does not accept a user, a module code and an action, because a component
 * that took those would be a second implementation of §A-9.3's authorization
 * model — and two implementations of an authorization rule is one more than is
 * safe. Written this way there is nothing here to disagree with the server
 * about: delete every `<PermissionGate>` in the codebase and the only change is
 * that admins see buttons that 403 when pressed.
 *
 * The corollary, which every module in M5 must honour: rendering a control
 * inside a gate is never a substitute for `assertCan()` in the Server Action
 * behind it. §A-5.1 puts authorization at stage 2 of the write pipeline, on the
 * server, in the same transaction as the audit row. This component sits outside
 * all of that.
 */

import type { ReactNode } from "react";

export type PermissionGateProps = {
  /**
   * The already-made decision — `can(user, 'notice', 'add')`, evaluated on the
   * server. Never a user object, never a module/action pair. See the header.
   */
  allowed: boolean;
  children: ReactNode;
  /**
   * What to show instead. Defaults to nothing: a control an admin cannot use is
   * usually better absent than present-and-disabled, because a disabled button
   * invites a support question that "no such button" does not.
   */
  fallback?: ReactNode;
};

export function PermissionGate({
  allowed,
  children,
  fallback = null,
}: PermissionGateProps) {
  return <>{allowed ? children : fallback}</>;
}
