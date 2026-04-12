import { Database } from 'bun:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'

import { MachineStore } from './machineStore'
import { MessageStore } from './messageStore'
import { OpenClawApprovalStore } from './openclawApprovalStore'
import { OpenClawCommandStore } from './openclawCommandStore'
import { OpenClawConversationStore } from './openclawConversationStore'
import { OpenClawMessageStore } from './openclawMessageStore'
import { OpenClawReceiptStore } from './openclawReceiptStore'
import { PushStore } from './pushStore'
import { SessionStore } from './sessionStore'
import { UserStore } from './userStore'

export type {
    StoredMachine,
    StoredMessage,
    StoredOpenClawApproval,
    StoredOpenClawCommand,
    StoredOpenClawConversation,
    StoredOpenClawMessage,
    StoredOpenClawReceipt,
    StoredPushSubscription,
    StoredSession,
    StoredUser,
    VersionedUpdateResult
} from './types'
export { MachineStore } from './machineStore'
export { MessageStore } from './messageStore'
export { OpenClawApprovalStore } from './openclawApprovalStore'
export { OpenClawCommandStore } from './openclawCommandStore'
export { OpenClawConversationStore } from './openclawConversationStore'
export { OpenClawMessageStore } from './openclawMessageStore'
export { OpenClawReceiptStore } from './openclawReceiptStore'
export { PushStore } from './pushStore'
export { SessionStore } from './sessionStore'
export { UserStore } from './userStore'

const SCHEMA_VERSION: number = 10
const REQUIRED_TABLES = [
    'sessions',
    'machines',
    'messages',
    'users',
    'push_subscriptions',
    'openclaw_conversations',
    'openclaw_messages',
    'openclaw_approvals',
    'openclaw_commands',
    'openclaw_receipts'
] as const

export class Store {
    private db: Database
    private readonly dbPath: string

    readonly sessions: SessionStore
    readonly machines: MachineStore
    readonly messages: MessageStore
    readonly openclawConversations: OpenClawConversationStore
    readonly openclawMessages: OpenClawMessageStore
    readonly openclawApprovals: OpenClawApprovalStore
    readonly openclawCommands: OpenClawCommandStore
    readonly openclawReceipts: OpenClawReceiptStore
    readonly users: UserStore
    readonly push: PushStore

    constructor(dbPath: string) {
        this.dbPath = dbPath
        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            const dir = dirname(dbPath)
            mkdirSync(dir, { recursive: true, mode: 0o700 })
            try {
                chmodSync(dir, 0o700)
            } catch {
            }

            if (!existsSync(dbPath)) {
                try {
                    const fd = openSync(dbPath, 'a', 0o600)
                    closeSync(fd)
                } catch {
                }
            }
        }

        this.db = new Database(dbPath, { create: true, readwrite: true, strict: true })
        this.db.exec('PRAGMA journal_mode = WAL')
        this.db.exec('PRAGMA synchronous = NORMAL')
        this.db.exec('PRAGMA foreign_keys = ON')
        this.db.exec('PRAGMA busy_timeout = 5000')
        this.initSchema()

        if (dbPath !== ':memory:' && !dbPath.startsWith('file::memory:')) {
            for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
                try {
                    chmodSync(path, 0o600)
                } catch {
                }
            }
        }

        this.sessions = new SessionStore(this.db)
        this.machines = new MachineStore(this.db)
        this.messages = new MessageStore(this.db)
        this.openclawConversations = new OpenClawConversationStore(this.db)
        this.openclawMessages = new OpenClawMessageStore(this.db)
        this.openclawApprovals = new OpenClawApprovalStore(this.db)
        this.openclawCommands = new OpenClawCommandStore(this.db)
        this.openclawReceipts = new OpenClawReceiptStore(this.db)
        this.users = new UserStore(this.db)
        this.push = new PushStore(this.db)
    }

    private initSchema(): void {
        const currentVersion = this.getUserVersion()
        if (currentVersion === 0) {
            if (this.hasAnyUserTables()) {
                this.migrateLegacySchemaIfNeeded()
                this.createSchema()
                this.setUserVersion(SCHEMA_VERSION)
                this.assertRequiredTablesPresent()
                return
            }

            this.createSchema()
            this.setUserVersion(SCHEMA_VERSION)
            this.assertRequiredTablesPresent()
            return
        }

        if (currentVersion === SCHEMA_VERSION) {
            this.assertRequiredTablesPresent()
            return
        }

        if (currentVersion !== SCHEMA_VERSION) {
            this.migrateToCurrentSchema(currentVersion)
            this.setUserVersion(SCHEMA_VERSION)
            this.assertRequiredTablesPresent()
            return
        }
    }

    private createSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tag TEXT,
                namespace TEXT NOT NULL DEFAULT 'default',
                machine_id TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                agent_state TEXT,
                agent_state_version INTEGER DEFAULT 1,
                model TEXT,
                model_reasoning_effort TEXT,
                effort TEXT,
                todos TEXT,
                todos_updated_at INTEGER,
                team_state TEXT,
                team_state_updated_at INTEGER,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_tag ON sessions(tag);
            CREATE INDEX IF NOT EXISTS idx_sessions_tag_namespace ON sessions(tag, namespace);

            CREATE TABLE IF NOT EXISTS machines (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                metadata TEXT,
                metadata_version INTEGER DEFAULT 1,
                runner_state TEXT,
                runner_state_version INTEGER DEFAULT 1,
                active INTEGER DEFAULT 0,
                active_at INTEGER,
                seq INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace);

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                local_id TEXT,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_local_id ON messages(session_id, local_id) WHERE local_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                platform_user_id TEXT NOT NULL,
                namespace TEXT NOT NULL DEFAULT 'default',
                created_at INTEGER NOT NULL,
                UNIQUE(platform, platform_user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_users_platform ON users(platform);
            CREATE INDEX IF NOT EXISTS idx_users_platform_namespace ON users(platform, namespace);

            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(namespace, endpoint)
            );
            CREATE INDEX IF NOT EXISTS idx_push_subscriptions_namespace ON push_subscriptions(namespace);
        `)
        this.createOpenClawCoreTables()
        this.createOpenClawCommandTables()
    }

    private migrateLegacySchemaIfNeeded(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            return
        }

        const hasDaemon = columns.has('daemon_state') || columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') || columns.has('runner_state_version')

        if (hasDaemon && hasRunner) {
            throw new Error('SQLite schema has both daemon_state and runner_state columns in machines; manual cleanup required.')
        }

        if (hasDaemon && !hasRunner) {
            this.migrateFromV1ToV2()
        }
    }

    private migrateFromV1ToV2(): void {
        const columns = this.getMachineColumnNames()
        if (columns.size === 0) {
            throw new Error('SQLite schema missing machines table for v1 to v2 migration.')
        }

        const hasDaemon = columns.has('daemon_state') && columns.has('daemon_state_version')
        const hasRunner = columns.has('runner_state') && columns.has('runner_state_version')

        if (hasRunner && !hasDaemon) {
            return
        }

        if (!hasDaemon) {
            throw new Error('SQLite schema missing daemon_state columns for v1 to v2 migration.')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state TO runner_state')
            this.db.exec('ALTER TABLE machines RENAME COLUMN daemon_state_version TO runner_state_version')
            this.db.exec('COMMIT')
            return
        } catch (error) {
            this.db.exec('ROLLBACK')
        }

        try {
            this.db.exec('BEGIN')
            this.db.exec(`
                CREATE TABLE machines_new (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL DEFAULT 'default',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    metadata TEXT,
                    metadata_version INTEGER DEFAULT 1,
                    runner_state TEXT,
                    runner_state_version INTEGER DEFAULT 1,
                    active INTEGER DEFAULT 0,
                    active_at INTEGER,
                    seq INTEGER DEFAULT 0
                );
            `)
            this.db.exec(`
                INSERT INTO machines_new (
                    id, namespace, created_at, updated_at,
                    metadata, metadata_version,
                    runner_state, runner_state_version,
                    active, active_at, seq
                )
                SELECT id, namespace, created_at, updated_at,
                       metadata, metadata_version,
                       daemon_state, daemon_state_version,
                       active, active_at, seq
                FROM machines;
            `)
            this.db.exec('DROP TABLE machines')
            this.db.exec('ALTER TABLE machines_new RENAME TO machines')
            this.db.exec('CREATE INDEX IF NOT EXISTS idx_machines_namespace ON machines(namespace)')
            this.db.exec('COMMIT')
        } catch (error) {
            this.db.exec('ROLLBACK')
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(`SQLite schema migration v1->v2 failed: ${message}`)
        }
    }

    private migrateFromV2ToV3(): void {
        return
    }

    private migrateFromV3ToV4(): void {
        const columns = this.getSessionColumnNames()
        if (!columns.has('team_state')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN team_state TEXT')
        }
        if (!columns.has('team_state_updated_at')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN team_state_updated_at INTEGER')
        }
    }

    private migrateFromV4ToV5(): void {
        const columns = this.getSessionColumnNames()
        if (!columns.has('model')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN model TEXT')
        }
    }

    private migrateFromV5ToV6(): void {
        const columns = this.getSessionColumnNames()
        if (!columns.has('effort')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN effort TEXT')
        }
    }

    private migrateFromV6ToV7(): void {
        const columns = this.getSessionColumnNames()
        if (!columns.has('model_reasoning_effort')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN model_reasoning_effort TEXT')
        }
    }

    private migrateFromV7ToV8(): void {
        this.createOpenClawCoreTables()
    }

    private migrateFromV8ToV9(): void {
        this.createOpenClawCoreTables()

        const rows = this.db.prepare('PRAGMA table_info(openclaw_conversations)').all() as Array<{ name: string }>
        const conversationColumns = new Set(rows.map((row) => row.name))

        if (!conversationColumns.has('connected')) {
            this.db.exec('ALTER TABLE openclaw_conversations ADD COLUMN connected INTEGER NOT NULL DEFAULT 1')
        }
        if (!conversationColumns.has('thinking')) {
            this.db.exec('ALTER TABLE openclaw_conversations ADD COLUMN thinking INTEGER NOT NULL DEFAULT 0')
        }
        if (!conversationColumns.has('last_error')) {
            this.db.exec('ALTER TABLE openclaw_conversations ADD COLUMN last_error TEXT')
        }
    }

    private migrateFromV9ToV10(): void {
        const sessionColumns = this.getSessionColumnNames()
        if (!sessionColumns.has('model_reasoning_effort')) {
            this.db.exec('ALTER TABLE sessions ADD COLUMN model_reasoning_effort TEXT')
        }

        this.createOpenClawCoreTables()
        this.migrateFromV8ToV9()
        this.createOpenClawCommandTables()
    }

    private migrateToCurrentSchema(currentVersion: number): void {
        if (currentVersion > SCHEMA_VERSION) {
            throw this.buildSchemaMismatchError(currentVersion)
        }

        let version = currentVersion
        while (version < SCHEMA_VERSION) {
            switch (version) {
                case 1:
                    this.migrateFromV1ToV2()
                    version = 2
                    break
                case 2:
                    this.migrateFromV2ToV3()
                    version = 3
                    break
                case 3:
                    this.migrateFromV3ToV4()
                    version = 4
                    break
                case 4:
                    this.migrateFromV4ToV5()
                    version = 5
                    break
                case 5:
                    this.migrateFromV5ToV6()
                    version = 6
                    break
                case 6:
                    this.migrateFromV6ToV7()
                    version = 7
                    break
                case 7:
                    this.migrateFromV7ToV8()
                    version = 8
                    break
                case 8:
                    this.migrateFromV8ToV9()
                    version = 9
                    break
                case 9:
                    this.migrateFromV9ToV10()
                    version = 10
                    break
                default:
                    throw this.buildSchemaMismatchError(currentVersion)
            }
        }
    }

    private createOpenClawCoreTables(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS openclaw_conversations (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL,
                user_key TEXT NOT NULL,
                external_id TEXT NOT NULL,
                title TEXT,
                status TEXT NOT NULL,
                connected INTEGER NOT NULL DEFAULT 1,
                thinking INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_openclaw_conversations_namespace_user
                ON openclaw_conversations(namespace, user_key);
            CREATE INDEX IF NOT EXISTS idx_openclaw_conversations_namespace
                ON openclaw_conversations(namespace);

            CREATE TABLE IF NOT EXISTS openclaw_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                namespace TEXT NOT NULL,
                external_id TEXT,
                role TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                seq INTEGER NOT NULL,
                status TEXT,
                FOREIGN KEY (conversation_id) REFERENCES openclaw_conversations(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_openclaw_messages_conversation
                ON openclaw_messages(conversation_id, seq);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_openclaw_messages_external
                ON openclaw_messages(conversation_id, external_id)
                WHERE external_id IS NOT NULL;

            CREATE TABLE IF NOT EXISTS openclaw_approvals (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                namespace TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                resolved_at INTEGER,
                FOREIGN KEY (conversation_id) REFERENCES openclaw_conversations(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_openclaw_approvals_conversation
                ON openclaw_approvals(conversation_id, status);
        `)
    }

    private createOpenClawCommandTables(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS openclaw_commands (
                id TEXT PRIMARY KEY,
                namespace TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                type TEXT NOT NULL,
                local_message_id TEXT,
                approval_request_id TEXT,
                idempotency_key TEXT NOT NULL,
                upstream_conversation_id TEXT,
                upstream_request_id TEXT,
                status TEXT NOT NULL,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (conversation_id) REFERENCES openclaw_conversations(id) ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_openclaw_commands_namespace_idempotency
                ON openclaw_commands(namespace, idempotency_key);
            CREATE INDEX IF NOT EXISTS idx_openclaw_commands_conversation
                ON openclaw_commands(conversation_id, created_at);

            CREATE TABLE IF NOT EXISTS openclaw_receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                namespace TEXT NOT NULL,
                event_id TEXT NOT NULL,
                upstream_conversation_id TEXT,
                event_type TEXT NOT NULL,
                first_seen_at INTEGER NOT NULL,
                processed_at INTEGER,
                UNIQUE(namespace, event_id)
            );
            CREATE INDEX IF NOT EXISTS idx_openclaw_receipts_namespace_conversation
                ON openclaw_receipts(namespace, upstream_conversation_id);
        `)
    }
    private getSessionColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getMachineColumnNames(): Set<string> {
        const rows = this.db.prepare('PRAGMA table_info(machines)').all() as Array<{ name: string }>
        return new Set(rows.map((row) => row.name))
    }

    private getUserVersion(): number {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
        return row?.user_version ?? 0
    }

    private setUserVersion(version: number): void {
        this.db.exec(`PRAGMA user_version = ${version}`)
    }

    private hasAnyUserTables(): boolean {
        const row = this.db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1"
        ).get() as { name?: string } | undefined
        return Boolean(row?.name)
    }

    private assertRequiredTablesPresent(): void {
        const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
        const rows = this.db.prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`
        ).all(...REQUIRED_TABLES) as Array<{ name: string }>
        const existing = new Set(rows.map((row) => row.name))
        const missing = REQUIRED_TABLES.filter((table) => !existing.has(table))

        if (missing.length > 0) {
            throw new Error(
                `SQLite schema is missing required tables (${missing.join(', ')}). ` +
                'Back up and rebuild the database, or run an offline migration to the expected schema version.'
            )
        }
    }

    private buildSchemaMismatchError(currentVersion: number): Error {
        const location = (this.dbPath === ':memory:' || this.dbPath.startsWith('file::memory:'))
            ? 'in-memory database'
            : this.dbPath
        return new Error(
            `SQLite schema version mismatch for ${location}. ` +
            `Expected ${SCHEMA_VERSION}, found ${currentVersion}. ` +
            'This build does not run compatibility migrations. ' +
            'Back up and rebuild the database, or run an offline migration to the expected schema version.'
        )
    }
}
