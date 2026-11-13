import type { ToastType } from '../components/Toast'
import { translateFunctionErrorMessage } from './functionError'

export const TOAST_EVENT = 'painelgestaa:toast'

export interface ToastNotification {
  id: number
  message: string
  type: ToastType
  duration?: number
}

let nextToastId = 0

export function notifyToast(
  message: unknown,
  type: ToastType = 'info',
  options?: { duration?: number; fallback?: string },
) {
  // Só erros/avisos passam pelo tradutor (ele troca texto não reconhecido pelo
  // fallback de erro). Sucesso e info são textos nossos: vão como estão.
  const translatedMessage = type === 'error' || type === 'warning'
    ? translateFunctionErrorMessage(message, options?.fallback ?? 'Não foi possível concluir a operação.')
    : String(message ?? '').trim() || 'Pronto.'

  const notification: ToastNotification = {
    id: ++nextToastId,
    message: translatedMessage,
    type,
    duration: options?.duration,
  }

  window.dispatchEvent(new CustomEvent<ToastNotification>(TOAST_EVENT, { detail: notification }))
  return notification.id
}

export const toast = {
  success: (message: unknown, duration?: number) => notifyToast(message, 'success', { duration }),
  error: (message: unknown, fallback?: string) => notifyToast(message, 'error', { fallback }),
  warning: (message: unknown, duration?: number) => notifyToast(message, 'warning', { duration }),
  info: (message: unknown, duration?: number) => notifyToast(message, 'info', { duration }),
}
