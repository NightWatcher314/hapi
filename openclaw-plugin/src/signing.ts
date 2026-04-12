import { createHmac } from 'node:crypto'

export function signCallbackBody(timestamp: number, rawBody: string, secret: string): string {
    return createHmac('sha256', secret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex')
}
