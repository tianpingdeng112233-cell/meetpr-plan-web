import { ApiException } from './client'

export const isSessionExpired = (error: unknown): boolean =>
  error instanceof ApiException && error.status === 401

export const isBindLost = (error: unknown): boolean =>
  error instanceof ApiException && error.status === 403 && error.code === 'CHAT_BIND_REQUIRED'

export const isRateLimited = (error: unknown): boolean =>
  error instanceof ApiException && error.status === 429
