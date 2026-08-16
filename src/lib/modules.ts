/**
 * The module registry (T-031), mirroring ARCHITECTURE.md §A-5.2.
 *
 * A module is a permission unit, a sidebar entry, a set of tables and a set of
 * public paths to revalidate. §A-5.2 defines it **once, in the database** —
 * `modules`, `permission_actions`, `module_actions` and `special_grants` are
 * seeded rows (§B-19), and `user_module_permissions` carries foreign keys to
 * them so a typo is a database error rather than a silent permission hole
 * (AUDIT S-3).
 *
 * What lives here is the compile-time *mirror* of those rows: the codes as
 * union types, so `can(user, 'notice', 'publsh')` will not compile, and the
 * applicability table, so an inapplicable pair fails closed in the application
 * as well as in the schema. The database stays authoritative — this file adds
 * no permission that a row does not already allow, and it must be re-checked
 * against the seed whenever §A-5.2 changes.
 */

/** Module codes, in §A-5.2's order — the order `modules.sort_order` is seeded in. */
export const MODULE_CODES = [
  "site_settings",
  "home",
  "about",
  "academics",
  "admission",
  "faculty",
  "notice",
  "gallery",
  "contact",
  "media",
  "users",
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

/** Action codes. Rows in `permission_actions`, not an enum in the schema (§A-9.3). */
export const ACTION_CODES = ["view", "add", "edit", "delete", "publish"] as const;

export type ActionCode = (typeof ACTION_CODES)[number];

/** Protected capabilities kept off the module cascade (§A-9.4, AUDIT B-2). */
export const SPECIAL_GRANT_CODES = [
  "edit_branding",
  "export_data",
  "purge_deleted",
  "manage_backups",
] as const;

export type SpecialGrantCode = (typeof SPECIAL_GRANT_CODES)[number];

/** The key format `loadPermissions` returns and `can()` looks up. */
export type PermissionKey = `${ModuleCode}:${ActionCode}`;

/**
 * The public paths a module's writes invalidate.
 *
 * `'all'` is §A-5.2's "all paths" for `site_settings` — site-wide configuration
 * and SEO metadata appear in every rendered page. `[]` means the module has no
 * public surface at all.
 */
export type Revalidates = "all" | readonly string[];

export type ModuleDefinition = {
  code: ModuleCode;
  /** Sidebar destination, matching `modules.admin_path` in the seed. */
  adminPath: string;
  /** `modules.is_super_admin_only`. True for `users` alone. */
  isSuperAdminOnly: boolean;
  /**
   * The actions applicable to this module — §A-5.2's last column, and the rows
   * seeded into `module_actions`. An action absent here is not merely ungranted
   * but inapplicable: it renders a `—` cell in the admin matrix (T-069) and is
   * refused by the composite foreign key if anything tries to grant it.
   */
  actions: readonly ActionCode[];
  revalidates: Revalidates;
};

/**
 * §A-5.2, row for row.
 *
 * Deferred, for T-036 to settle: §A-5.2 lists `/academics` and `/notices` with
 * a glob but without their `/en` counterparts, while `home`, `about`,
 * `admission`, `faculty` and `gallery` list both locales explicitly. The paths
 * are mirrored verbatim rather than silently completed — every page is
 * generated per locale (§A-7.1), so the cache-tag registry has to expand these
 * through `localizePath` or §A-5.2 needs a correction. Not this card's call.
 */
export const MODULES: Readonly<Record<ModuleCode, ModuleDefinition>> = {
  site_settings: {
    code: "site_settings",
    adminPath: "/admin/settings",
    isSuperAdminOnly: false,
    actions: ["view", "edit"],
    revalidates: "all",
  },
  home: {
    code: "home",
    adminPath: "/admin/home",
    isSuperAdminOnly: false,
    actions: ["view", "edit"],
    revalidates: ["/", "/en"],
  },
  about: {
    code: "about",
    adminPath: "/admin/about",
    isSuperAdminOnly: false,
    actions: ["view", "edit"],
    revalidates: ["/about", "/en/about"],
  },
  academics: {
    code: "academics",
    adminPath: "/admin/academics",
    isSuperAdminOnly: false,
    actions: ["view", "add", "edit", "delete"],
    revalidates: ["/academics/**"],
  },
  admission: {
    code: "admission",
    adminPath: "/admin/admission",
    isSuperAdminOnly: false,
    actions: ["view", "add", "edit", "delete"],
    revalidates: ["/admission", "/en/admission"],
  },
  faculty: {
    code: "faculty",
    adminPath: "/admin/faculty",
    isSuperAdminOnly: false,
    actions: ["view", "add", "edit", "delete"],
    revalidates: ["/faculty", "/en/faculty"],
  },
  notice: {
    code: "notice",
    adminPath: "/admin/notices",
    isSuperAdminOnly: false,
    // `publish` is a distinct action on purpose (AUDIT E3-8): a junior admin
    // may hold add + edit and still not be able to put a notice on the site.
    actions: ["view", "add", "edit", "delete", "publish"],
    revalidates: ["/notices/**", "/"],
  },
  gallery: {
    code: "gallery",
    adminPath: "/admin/gallery",
    isSuperAdminOnly: false,
    actions: ["view", "add", "edit", "delete"],
    revalidates: ["/gallery", "/"],
  },
  contact: {
    code: "contact",
    adminPath: "/admin/contact",
    isSuperAdminOnly: false,
    actions: ["view", "delete"],
    revalidates: [],
  },
  media: {
    code: "media",
    adminPath: "/admin/media",
    isSuperAdminOnly: false,
    actions: ["view", "add", "delete"],
    revalidates: [],
  },
  users: {
    // Deliberately empty. §A-5.2 gives `users` no action list — it is Super
    // Admin only, and Super Admin bypasses checks entirely (§A-9.3), so no
    // grant should ever exist. The seed writes no `module_actions` rows for it
    // either, which makes `users:edit` a foreign-key error rather than a
    // decision the application has to get right. Fails closed in both layers.
    code: "users",
    adminPath: "/admin/users",
    isSuperAdminOnly: true,
    actions: [],
    revalidates: [],
  },
};

/** Every module definition in §A-5.2's order. */
export function listModules(): readonly ModuleDefinition[] {
  return MODULE_CODES.map((code) => MODULES[code]);
}

export function isModuleCode(value: string): value is ModuleCode {
  return (MODULE_CODES as readonly string[]).includes(value);
}

export function isActionCode(value: string): value is ActionCode {
  return (ACTION_CODES as readonly string[]).includes(value);
}

export function isSpecialGrantCode(value: string): value is SpecialGrantCode {
  return (SPECIAL_GRANT_CODES as readonly string[]).includes(value);
}

/**
 * Whether an action means anything for a module — the `module_actions` question,
 * asked in code. A pair that is not applicable can never be granted, so `can()`
 * refuses it without consulting the permission set at all.
 */
export function isActionApplicable(
  moduleCode: ModuleCode,
  actionCode: ActionCode,
): boolean {
  return MODULES[moduleCode].actions.includes(actionCode);
}

/** The `module:action` key used throughout the permission set. */
export function permissionKey(
  moduleCode: ModuleCode,
  actionCode: ActionCode,
): PermissionKey {
  return `${moduleCode}:${actionCode}`;
}
