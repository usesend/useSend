import { X509Certificate } from "crypto";
import { readFileSync } from "fs";
import { createSecureContext } from "tls";

/**
 * Reloads the TLS key/cert by polling the files on disk.
 *
 * fs.watch is not used on purpose: certbot's `live/` paths are symlinks into
 * `archive/`, and renewals write new archive files and repoint the symlinks.
 * inotify watches the old target inode, which never changes, so a watcher
 * never fires. Polling the paths (which re-resolves the symlinks on every
 * read) works for symlink swaps, renames and bind mounts alike.
 */

export const DEFAULT_TLS_RELOAD_INTERVAL_MS = 5 * 60 * 1000;
export const MIN_TLS_RELOAD_INTERVAL_MS = 10 * 1000;
// setInterval turns anything above 2^31-1 ms into 1 ms, so cap well below it.
export const MAX_TLS_RELOAD_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const EXPIRY_WARNING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface TlsPair {
  key: Buffer;
  cert: Buffer;
}

export interface SecureContextTarget {
  updateSecureContext(options: TlsPair): void;
}

export interface TlsReloaderLogger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export type TlsCheckResult = "reloaded" | "unchanged" | "failed";

export interface TlsReloaderOptions {
  keyPath: string;
  certPath: string;
  /** The key/cert the servers were started with. */
  initial: TlsPair;
  servers: SecureContextTarget[];
  intervalMs?: number;
  logger?: TlsReloaderLogger;
  now?: () => Date;
}

export function parseReloadInterval(
  raw: string | undefined,
  logger: TlsReloaderLogger = console,
): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_TLS_RELOAD_INTERVAL_MS;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    logger.warn(
      `[tls] Invalid TLS_RELOAD_INTERVAL_MS "${raw}", using default ${DEFAULT_TLS_RELOAD_INTERVAL_MS}ms`,
    );
    return DEFAULT_TLS_RELOAD_INTERVAL_MS;
  }
  if (value < MIN_TLS_RELOAD_INTERVAL_MS) {
    logger.warn(
      `[tls] TLS_RELOAD_INTERVAL_MS ${value}ms is below the minimum, using ${MIN_TLS_RELOAD_INTERVAL_MS}ms`,
    );
    return MIN_TLS_RELOAD_INTERVAL_MS;
  }
  if (value > MAX_TLS_RELOAD_INTERVAL_MS) {
    logger.warn(
      `[tls] TLS_RELOAD_INTERVAL_MS ${value}ms is above the maximum, using ${MAX_TLS_RELOAD_INTERVAL_MS}ms`,
    );
    return MAX_TLS_RELOAD_INTERVAL_MS;
  }
  return Math.floor(value);
}

/** Expiry of the leaf (first) certificate in a PEM bundle. */
export function certificateExpiry(cert: Buffer): Date {
  return new Date(new X509Certificate(cert).validTo);
}

/** Returns a warning message if the certificate expires within the warning window. */
export function expiryWarning(
  validTo: Date,
  now: Date,
  windowMs: number = EXPIRY_WARNING_WINDOW_MS,
): string | null {
  const remainingMs = validTo.getTime() - now.getTime();
  if (remainingMs <= 0) {
    return `[tls] TLS certificate EXPIRED at ${validTo.toISOString()}`;
  }
  if (remainingMs <= windowMs) {
    const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
    return `[tls] TLS certificate expires in ${days} day(s), at ${validTo.toISOString()}`;
  }
  return null;
}

export class TlsReloader {
  private current: TlsPair;
  private currentValidTo: Date | null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly logger: TlsReloaderLogger;
  private readonly now: () => Date;
  readonly intervalMs: number;

  constructor(private readonly options: TlsReloaderOptions) {
    this.current = options.initial;
    this.logger = options.logger ?? console;
    this.now = options.now ?? (() => new Date());
    this.intervalMs = Math.min(
      Math.max(
        options.intervalMs ?? DEFAULT_TLS_RELOAD_INTERVAL_MS,
        MIN_TLS_RELOAD_INTERVAL_MS,
      ),
      MAX_TLS_RELOAD_INTERVAL_MS,
    );
    try {
      this.currentValidTo = certificateExpiry(options.initial.cert);
      this.logger.log(
        `[tls] Loaded TLS certificate valid until ${this.currentValidTo.toISOString()}`,
      );
    } catch (err) {
      this.currentValidTo = null;
      this.logger.error("[tls] Could not parse the initial TLS certificate", err);
    }
    this.warnIfExpiring();
  }

  /** Polls the files once and applies them to all servers if they changed. */
  check(): TlsCheckResult {
    const result = this.reloadIfChanged();
    this.warnIfExpiring();
    return result;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.check(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get validTo(): Date | null {
    return this.currentValidTo;
  }

  private reloadIfChanged(): TlsCheckResult {
    let next: TlsPair & { validTo: Date };
    try {
      const key = readFileSync(this.options.keyPath);
      const cert = readFileSync(this.options.certPath);
      if (key.equals(this.current.key) && cert.equals(this.current.cert)) {
        return "unchanged";
      }
      // Throws on malformed PEM or when the key does not match the certificate
      // (e.g. a renewal caught halfway through repointing the symlinks).
      createSecureContext({ key, cert });
      next = { key, cert, validTo: certificateExpiry(cert) };
    } catch (err) {
      this.logger.error(
        "[tls] Failed to load renewed TLS certificate, keeping the current one",
        err,
      );
      return "failed";
    }

    let failed = false;
    for (const server of this.options.servers) {
      try {
        server.updateSecureContext({ key: next.key, cert: next.cert });
      } catch (err) {
        failed = true;
        this.logger.error("[tls] Failed to apply TLS certificate to a server", err);
      }
    }
    if (failed) {
      // Keep the old baseline so the next poll retries every server.
      return "failed";
    }

    this.current = { key: next.key, cert: next.cert };
    this.currentValidTo = next.validTo;
    this.logger.log(
      `[tls] TLS certificate reloaded, valid until ${next.validTo.toISOString()}`,
    );
    return "reloaded";
  }

  private warnIfExpiring(): void {
    if (!this.currentValidTo) return;
    const warning = expiryWarning(this.currentValidTo, this.now());
    if (warning) this.logger.warn(warning);
  }
}
