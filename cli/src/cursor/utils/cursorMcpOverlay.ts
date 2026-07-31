/**
 * Cursor ACP does not connect MCP servers passed on session/new (upstream limitation).
 * The working path is project .cursor/mcp.json + `agent mcp enable <id>`.
 * See https://forum.cursor.com/t/acp-agent-silently-ignores-mcpservers-in-session-new/153623
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

function writeMcpJson(path: string, config: CursorMcpJson): void {
    writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
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
    mkdirSync(cursorDir, { recursive: true });

    const hadFile = existsSync(mcpJsonPath);
    const previous = hadFile ? readMcpJson(mcpJsonPath) : { mcpServers: {} as Record<string, McpServerEntry> };
    previous.mcpServers ??= {};
    const hadServer = Object.prototype.hasOwnProperty.call(previous.mcpServers, serverId);
    const previousServer = hadServer ? previous.mcpServers[serverId] : undefined;

    const installedHapi: McpServerEntry = {
        command: bridge.command,
        args: [...bridge.args],
    };

    const config: CursorMcpJson = {
        ...previous,
        mcpServers: {
            ...previous.mcpServers,
            [serverId]: installedHapi,
        },
    };

    writeMcpJson(mcpJsonPath, config);

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

                writeMcpJson(mcpJsonPath, current);
            } catch (error) {
                logger.debug('[cursor-acp] cursor MCP overlay cleanup failed', error);
            }
        },
    };
}
