import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
    CURSOR_HAPI_MCP_SERVER_ID,
    cursorHapiMcpServerId,
    installCursorMcpOverlay,
    withMcpJsonLock,
    writeMcpJsonAtomic,
} from './cursorMcpOverlay';

describe('installCursorMcpOverlay', () => {
    const roots: string[] = [];
    /** Unit tests must not shell out to a real Cursor `agent` binary. */
    const noopEnable = () => ({ status: 0 });

    afterEach(() => {
        for (const root of roots.splice(0)) {
            rmSync(root, { recursive: true, force: true });
        }
    });

    function makeProjectDir(initialMcpJson?: string): string {
        const root = join(tmpdir(), `hapi-cursor-mcp-${randomUUID()}`);
        mkdirSync(root, { recursive: true });
        roots.push(root);
        if (initialMcpJson !== undefined) {
            mkdirSync(join(root, '.cursor'), { recursive: true });
            writeFileSync(join(root, '.cursor', 'mcp.json'), initialMcpJson, 'utf-8');
        }
        return root;
    }

    it('writes per-session bridge into .cursor/mcp.json and removes only that id on cleanup', () => {
        const cwd = makeProjectDir(JSON.stringify({
            mcpServers: {
                other: { command: 'echo', args: ['x'] },
            },
        }, null, 2));
        const serverId = cursorHapiMcpServerId('session-a');

        const mcpPath = join(cwd, '.cursor', 'mcp.json');

        const handle = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
        }, { serverId, enableCursorMcp: noopEnable });

        const merged = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(merged.mcpServers.other).toEqual({ command: 'echo', args: ['x'] });
        expect(merged.mcpServers[serverId]).toEqual({
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
        });
        expect(merged.mcpServers[CURSOR_HAPI_MCP_SERVER_ID]).toBeUndefined();

        handle.cleanup();
        const after = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(after.mcpServers.other).toEqual({ command: 'echo', args: ['x'] });
        expect(after.mcpServers[serverId]).toBeUndefined();
    });

    it('leaves a newer session bridge intact when an older session cleans up first', () => {
        const cwd = makeProjectDir(JSON.stringify({
            mcpServers: {
                other: { command: 'echo', args: ['x'] },
            },
        }, null, 2));
        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        const idA = cursorHapiMcpServerId('session-a');
        const idB = cursorHapiMcpServerId('session-b');

        const handleA = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:1111/'],
        }, { serverId: idA, enableCursorMcp: noopEnable });

        const handleB = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:2222/'],
        }, { serverId: idB, enableCursorMcp: noopEnable });

        handleA.cleanup();

        const afterA = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(afterA.mcpServers[idA]).toBeUndefined();
        expect(afterA.mcpServers[idB]).toEqual({
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:2222/'],
        });

        handleB.cleanup();

        const afterB = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(afterB.mcpServers[idB]).toBeUndefined();
        expect(afterB.mcpServers.other).toEqual({ command: 'echo', args: ['x'] });
    });

    it('preserves mcpServers keys added during the session on cleanup', () => {
        const cwd = makeProjectDir(JSON.stringify({
            mcpServers: {
                other: { command: 'echo', args: ['x'] },
            },
        }, null, 2));
        const serverId = cursorHapiMcpServerId('session-a');

        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        const handle = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
        }, { serverId, enableCursorMcp: noopEnable });

        writeFileSync(mcpPath, JSON.stringify({
            mcpServers: {
                other: { command: 'echo', args: ['x'] },
                [serverId]: {
                    command: '/bin/hapi',
                    args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
                },
                concurrent: { command: 'npx', args: ['-y', 'some-mcp'] },
            },
        }, null, 2) + '\n', 'utf-8');

        handle.cleanup();

        const after = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(after.mcpServers.other).toEqual({ command: 'echo', args: ['x'] });
        expect(after.mcpServers.concurrent).toEqual({ command: 'npx', args: ['-y', 'some-mcp'] });
        expect(after.mcpServers[serverId]).toBeUndefined();
    });

    it('restores a pre-existing entry for the same server id instead of deleting it', () => {
        const serverId = cursorHapiMcpServerId('session-a');
        const prior = { command: 'old-hapi', args: ['mcp'] };
        const cwd = makeProjectDir(JSON.stringify({
            mcpServers: {
                [serverId]: prior,
            },
        }, null, 2));

        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        const handle = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
        }, { serverId, enableCursorMcp: noopEnable });

        handle.cleanup();

        const after = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(after.mcpServers[serverId]).toEqual(prior);
    });

    it('does not touch a legacy shared hapi key when using a per-session id', () => {
        const legacyHapi = { command: 'user-hapi', args: ['mcp', '--custom'] };
        const cwd = makeProjectDir(JSON.stringify({
            mcpServers: {
                [CURSOR_HAPI_MCP_SERVER_ID]: legacyHapi,
            },
        }, null, 2));
        const serverId = cursorHapiMcpServerId('session-a');

        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        const handle = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
        }, { serverId, enableCursorMcp: noopEnable });

        handle.cleanup();

        const after = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(after.mcpServers[CURSOR_HAPI_MCP_SERVER_ID]).toEqual(legacyHapi);
        expect(after.mcpServers[serverId]).toBeUndefined();
    });

    it('preserves a mid-session replacement of the session entry on cleanup', () => {
        const cwd = makeProjectDir(JSON.stringify({
            mcpServers: {
                other: { command: 'echo', args: ['x'] },
            },
        }, null, 2));
        const serverId = cursorHapiMcpServerId('session-a');

        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        const handle = installCursorMcpOverlay(cwd, {
            command: '/bin/hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:12345/'],
        }, { serverId, enableCursorMcp: noopEnable });

        const userOwned = { command: 'user-hapi', args: ['mcp', '--custom'] };
        writeFileSync(mcpPath, JSON.stringify({
            mcpServers: {
                other: { command: 'echo', args: ['x'] },
                [serverId]: userOwned,
            },
        }, null, 2) + '\n', 'utf-8');

        handle.cleanup();

        const after = JSON.parse(readFileSync(mcpPath, 'utf-8')) as {
            mcpServers: Record<string, { command: string; args: string[] }>;
        };
        expect(after.mcpServers[serverId]).toEqual(userOwned);
        expect(after.mcpServers.other).toEqual({ command: 'echo', args: ['x'] });
    });

    it('creates .cursor/mcp.json when missing and removes file when only the session entry was present', () => {
        const cwd = makeProjectDir();
        const serverId = cursorHapiMcpServerId('session-a');
        expect(existsSync(join(cwd, '.cursor', 'mcp.json'))).toBe(false);

        const handle = installCursorMcpOverlay(cwd, {
            command: 'hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:9999/'],
        }, { serverId, enableCursorMcp: noopEnable });

        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        expect(existsSync(mcpPath)).toBe(true);

        handle.cleanup();
        expect(existsSync(mcpPath)).toBe(false);
    });

    it('throws when existing .cursor/mcp.json is not valid JSON', () => {
        const cwd = makeProjectDir('{ not-json');
        expect(() => installCursorMcpOverlay(cwd, {
            command: 'hapi',
            args: ['mcp', '--url', 'http://127.0.0.1:9999/'],
        }, { serverId: cursorHapiMcpServerId('session-a'), enableCursorMcp: noopEnable })).toThrow();
        // Malformed project config must stay untouched for the launcher try/catch path.
        expect(readFileSync(join(cwd, '.cursor', 'mcp.json'), 'utf-8')).toBe('{ not-json');
    });

    it('writeMcpJsonAtomic replaces via rename and withMcpJsonLock serializes writers', () => {
        const cwd = makeProjectDir();
        const mcpPath = join(cwd, '.cursor', 'mcp.json');
        mkdirSync(join(cwd, '.cursor'), { recursive: true });
        const lockPath = `${mcpPath}.hapi.lock`;

        writeMcpJsonAtomic(mcpPath, {
            mcpServers: { a: { command: 'a', args: [] } },
        });
        expect(JSON.parse(readFileSync(mcpPath, 'utf-8')).mcpServers.a.command).toBe('a');

        const order: string[] = [];
        withMcpJsonLock(lockPath, () => {
            order.push('outer-enter');
            // Nested attempt would deadlock if same process re-entered; instead verify
            // exclusive create fails while lock is held.
            expect(() => openSync(lockPath, 'wx')).toThrow();
            order.push('outer-exit');
        });
        expect(order).toEqual(['outer-enter', 'outer-exit']);
        expect(existsSync(lockPath)).toBe(false);
    });
});
