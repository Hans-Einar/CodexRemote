import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { AuthUserRecord } from "../shared/contracts";

export interface AuthSessionUser extends AuthUserRecord {}

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthStore {
  private readonly database: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(path.dirname(dbPath), {
      recursive: true
    });

    this.database = new DatabaseSync(dbPath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        picture_url TEXT,
        is_allowed INTEGER NOT NULL,
        is_admin INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES auth_users(id)
      );

      CREATE TABLE IF NOT EXISTS auth_oauth_states (
        state TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );
    `);
  }

  close() {
    this.database.close();
  }

  createOauthState() {
    const state = randomUUID();

    this.database
      .prepare("INSERT INTO auth_oauth_states (state, created_at) VALUES (?, ?)")
      .run(state, nowIso());

    return state;
  }

  consumeOauthState(state: string) {
    const result = this.database
      .prepare("DELETE FROM auth_oauth_states WHERE state = ?")
      .run(state);

    return result.changes > 0;
  }

  upsertGoogleUser(profile: {
    email: string;
    name: string;
    pictureUrl?: string | null;
  }, bootstrapAdminEmails: string[]) {
    const email = profile.email.toLowerCase();
    const existing = this.database
      .prepare("SELECT * FROM auth_users WHERE email = ?")
      .get(email) as Record<string, unknown> | undefined;

    const timestamp = nowIso();
    const shouldBootstrapAdmin = bootstrapAdminEmails.includes(email);

    if (!existing) {
      const id = randomUUID();
      this.database
        .prepare(
          `
            INSERT INTO auth_users (
              id, email, name, picture_url, is_allowed, is_admin, created_at, updated_at, last_login_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          id,
          email,
          profile.name,
          profile.pictureUrl ?? null,
          shouldBootstrapAdmin ? 1 : 0,
          shouldBootstrapAdmin ? 1 : 0,
          timestamp,
          timestamp,
          timestamp
        );

      return this.getUserByEmail(email)!;
    }

    this.database
      .prepare(
        `
          UPDATE auth_users
          SET name = ?, picture_url = ?, updated_at = ?, last_login_at = ?
          WHERE email = ?
        `
      )
      .run(profile.name, profile.pictureUrl ?? null, timestamp, timestamp, email);

    return this.getUserByEmail(email)!;
  }

  private normalizeUser(row: Record<string, unknown>): AuthSessionUser {
    return {
      email: String(row.email),
      id: String(row.id),
      isAdmin: Number(row.is_admin) === 1,
      isAllowed: Number(row.is_allowed) === 1,
      name: String(row.name),
      pictureUrl: typeof row.picture_url === "string" ? row.picture_url : null
    };
  }

  getUserByEmail(email: string) {
    const row = this.database
      .prepare("SELECT * FROM auth_users WHERE email = ?")
      .get(email.toLowerCase()) as Record<string, unknown> | undefined;

    return row ? this.normalizeUser(row) : null;
  }

  listUsers() {
    const rows = this.database
      .prepare("SELECT * FROM auth_users ORDER BY email ASC")
      .all() as Record<string, unknown>[];

    return rows.map((row) => this.normalizeUser(row));
  }

  updateUserAccess(userId: string, updates: { isAdmin?: boolean; isAllowed?: boolean }) {
    const current = this.database
      .prepare("SELECT * FROM auth_users WHERE id = ?")
      .get(userId) as Record<string, unknown> | undefined;

    if (!current) {
      return null;
    }

    const nextAllowed =
      typeof updates.isAllowed === "boolean" ? Number(updates.isAllowed) : Number(current.is_allowed);
    const nextAdmin =
      typeof updates.isAdmin === "boolean" ? Number(updates.isAdmin) : Number(current.is_admin);

    this.database
      .prepare(
        `
          UPDATE auth_users
          SET is_allowed = ?, is_admin = ?, updated_at = ?
          WHERE id = ?
        `
      )
      .run(nextAllowed, nextAdmin, nowIso(), userId);

    const reloaded = this.database
      .prepare("SELECT * FROM auth_users WHERE id = ?")
      .get(userId) as Record<string, unknown>;

    return this.normalizeUser(reloaded);
  }

  createSession(userId: string) {
    const token = randomUUID();
    const id = randomUUID();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

    this.database
      .prepare(
        `
          INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(id, userId, hashToken(token), createdAt, expiresAt);

    return {
      expiresAt,
      token
    };
  }

  deleteSession(token: string) {
    this.database
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .run(hashToken(token));
  }

  getUserBySessionToken(token: string) {
    const row = this.database
      .prepare(
        `
          SELECT u.*
          FROM auth_sessions s
          JOIN auth_users u ON u.id = s.user_id
          WHERE s.token_hash = ? AND s.expires_at > ?
        `
      )
      .get(hashToken(token), nowIso()) as Record<string, unknown> | undefined;

    return row ? this.normalizeUser(row) : null;
  }
}
