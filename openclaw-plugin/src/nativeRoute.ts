import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import type { Hono } from 'hono'

function isBodyAllowed(method: string): boolean {
    return method !== 'GET' && method !== 'HEAD'
}

function buildHeaders(req: IncomingMessage): Headers {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
            for (const item of value) {
                headers.append(key, item)
            }
            continue
        }

        if (typeof value === 'string') {
            headers.set(key, value)
        }
    }
    return headers
}

export async function forwardNodeRequestToHono(app: Hono, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://openclaw.local')
    const init: RequestInit & { duplex?: 'half' } = {
        method,
        headers: buildHeaders(req)
    }

    if (isBodyAllowed(method)) {
        init.body = Readable.toWeb(req) as ReadableStream<Uint8Array>
        init.duplex = 'half'
    }

    const response = await app.fetch(new Request(url.toString(), init))

    res.statusCode = response.status
    response.headers.forEach((value, key) => {
        res.setHeader(key, value)
    })

    if (!response.body) {
        res.end()
        return true
    }

    const body = Buffer.from(await response.arrayBuffer())
    res.end(body)
    return true
}
