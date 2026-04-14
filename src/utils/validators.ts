export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())
}

export function normalizePhone(input: string): string | null {
  // Remove tudo que nao for digito
  const digits = input.replace(/\D/g, '')

  // Aceita: 11 digitos (DDD+numero), 13 digitos (55+DDD+numero)
  if (digits.length === 11) return `55${digits}`
  if (digits.length === 13 && digits.startsWith('55')) return digits
  if (digits.length === 12 && digits.startsWith('55')) return digits // fixo

  return null
}
