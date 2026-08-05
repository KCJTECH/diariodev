// Utilidades de data civil no fuso da organização. Comparações de "atrasada"
// e agregações por dia usam a data civil, não divisão de milissegundos (§10).
export function civilTodayISO(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Meia-noite UTC da data civil informada (para comparar campos @db.Date).
export function civilDateAsUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
