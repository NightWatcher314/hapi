/**
 * Cursor ACP does not connect MCP servers passed on session/new (upstream limitation).
 * The working path is project .cursor/mcp.json + `agent mcp enable <id>`.
 * See https://forum.cursor.com/t/acp-agent-silently-ignores-mcpservers-in-session-new/153623
 */

import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { logger } from '@/ui/logger';

/** Historical fixed id — prefer {@link cursorHapiMcpServerId} so concurrent sessions do not share one key. */
export const CURSOR_HAPI_MCP_SERVER_ID = 'hapi';

/**
 * Per-session MCP server id for `.cursor/mcp.json`.
 * Concurrent sessions in the same cwd must not share a single `hapi` key — cleanup of an
 * older session would otherwise restore a dead loopback URL over a newer live bridge.
 */
export function cursorHapiMcpServerId(sessionId: string): string {
    const trimmed = sessionId.trim();
    if (!trimmed) {
        throw new Error('sessionId is required for Cursor HAPI MCP overlay');
    }
    return `hapi-${trimmed}`;
}

type McpServerEntry = {
    command: string;
    args: string[];
    env?: Record<string, string>;
};

type CursorMcpJson = {
    mcpServers?: Record<string, McpServerEntry>;
};

export type CursorMcpOverlayHandle = {
    cleanup: () => void;
};

type EnableCursorMcpResult = {
    status: number | null;
    stdout?: string | null;
    stderr?: string | null;
};

export type EnableCursorMcp = (cwd: string, id: string) => EnableCursorMcpResult;

const LOCK_RETRY_INTERVAL_MS = 50;
const MAX_LOCK_ATTEMPTS = 100;
const STALE_LOCK_TIMEOUT_MS = 10_000;

function defaultEnableCursorMcp(cwd: string, id: string): EnableCursorMcpResult {
    return spawnSync('agent', ['mcp', 'enable', id], {
        cwd,
        encoding: 'utf-8',
        timeout: 30_000,
    });
}

function parseMcpJson(raw: string): CursorMcpJson {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') {
        return { mcpServers: {} };
    }
    return parsed as CursorMcpJson;
}

function readMcpJson(path: string): CursorMcpJson {
    if (!existsSync(path)) {
        return { mcpServers: {} };
    }
    return parseMcpJson(readFileSync(path, 'utf-8'));
}

/** Atomic replace so readers never see a partial mcp.json. */
export function writeMcpJsonAtomic(path: string, config: CursorMcpJson): void {
    const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    renameSync(tmp, path);
}

function sleepSync(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Exclusive cross-process lock for mcp.json read-modify-write.
 * Uses create-exclusive lockfile (same pattern as settings persistence).
 */
export function withMcpJsonLock(lockPath: string, fn: () => void): void {
    let attempts = 0;
    let fd: number | undefined;

    while (attempts < MAX_LOCK_ATTEMPTS) {
        try {
            fd = openSync(lockPath, 'wx');
            break;
        } catch (err: unknown) {
            const code = err && typeof err === 'object' && 'code' in err
                ? (err as { code?: string }).code
                : undefined;
            if (code !== 'EEXIST') {
                throw err;
            }
            attempts++;
            try {
                const stats = statSync(lockPath);
                if (Date.now() - stats.mtimeMs > STALE_LOCK_TIMEOUT_MS) {
                    unlinkSync(lockPath);
                    continue;
                }
            } catch {
                // lock disappeared between EEXIST and stat — retry
            }
            sleepSync(LOCK_RETRY_INTERVAL_MS);
        }
    }

    if (fd === undefined) {
        throw new Error(`Timed out waiting for Cursor MCP overlay lock: ${lockPath}`);
    }

    try {
        fn();
    } finally {
        try {
            closeSync(fd);
        } catch {
            // ignore
        }
        try {
            unlinkSync(lockPath);
        } catch {
            // ignore
        }
    }
}

function sameMcpEntry(a: McpServerEntry | undefined, b: McpServerEntry | undefined): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge the per-session HAPI stdio bridge into `<cwd>/.cursor/mcp.json` and approve it
 * for Cursor's native MCP loader.
 *
 * Cleanup undoes only the exact entry this session installed under `serverId` (or restores a
 * pre-existing value for that same id). Concurrent edits to other mcpServers keys — and to
 * this id when it no longer matches the installed overlay — survive the session.
 *
 * Install and cleanup serialize via a lockfile and write mcp.json atomically so concurrent
 * CLI processes in the same cwd cannot clobber each other's `hapi-*` entries.
 */
export function installCursorMcpOverlay(
    cwd: string,
    bridge: { command: string; args: string[] },
    options: { serverId: string; enableCursorMcp?: EnableCursorMcp },
): CursorMcpOverlayHandle {
    const serverId = options.serverId.trim();
    if (!serverId) {
        throw new Error('serverId is required for Cursor HAPI MCP overlay');
    }

    const cursorDir = join(cwd, '.cursor');
    const mcpJsonPath = join(cursorDir, 'mcp.json');
    const lockPath = `${mcpJsonPath}.hapi.lock`;
    mkdirSync(cursorDir, { recursive: true });

    const installedHapi: McpServerEntry = {
        command: bridge.command,
        args: [...bridge.args],
    };

    let hadFile = false;
    let hadServer = false;
    let previousServer: McpServerEntry | undefined;

    withMcpJsonLock(lockPath, () => {
        hadFile = existsSync(mcpJsonPath);
        const previous = hadFile ? readMcpJson(mcpJsonPath) : { mcpServers: {} as Record<string, McpServerEntry> };
        previous.mcpServers ??= {};
        hadServer = Object.prototype.hasOwnProperty.call(previous.mcpServers, serverId);
        previousServer = hadServer ? previous.mcpServers[serverId] : undefined;

        const config: CursorMcpJson = {
            ...previous,
            mcpServers: {
                ...previous.mcpServers,
                [serverId]: installedHapi,
            },
        };
        writeMcpJsonAtomic(mcpJsonPath, config);
    });

    const enable = (options.enableCursorMcp ?? defaultEnableCursorMcp)(cwd, serverId);

    if (enable.status !== 0) {
        const detail = (enable.stderr || enable.stdout || '').trim();
        logger.warn(
            `[cursor-acp] agent mcp enable ${serverId} failed (status=${enable.status ?? 'null'}${detail ? `: ${detail}` : ''})`
        );
    } else {
        logger.debug(`[cursor-acp] enabled native MCP server ${serverId} via .cursor/mcp.json`);
    }

    return {
        cleanup: () => {
            try {
                withMcpJsonLock(lockPath, () => {
                    if (!existsSync(mcpJsonPath)) {
                        return;
                    }

                    const current = readMcpJson(mcpJsonPath);
                    current.mcpServers ??= {};

                    const currentServer = current.mcpServers[serverId];
                    if (!sameMcpEntry(currentServer, installedHapi)) {
                        // User/Cursor replaced or removed our overlay entry — leave alone.
                        return;
                    }

                    if (hadServer && previousServer) {
                        current.mcpServers[serverId] = previousServer;
                    } else {
                        delete current.mcpServers[serverId];
                    }

                    const remaining = Object.keys(current.mcpServers);
                    if (!hadFile && remaining.length === 0) {
                        rmSync(mcpJsonPath, { force: true });
                        return;
                    }

                    writeMcpJsonAtomic(mcpJsonPath, current);
                });
            } catch (error) {
                logger.debug('[cursor-acp] cursor MCP overlay cleanup failed', error);
            }
        },
    };
}
