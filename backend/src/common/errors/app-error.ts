// Erro de domínio com código estável e status HTTP. O handler central
// (http/error-handler.ts) converte para o envelope de erro da API.

export type ErrorDetail = { field?: string; message: string };

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: ErrorDetail[];
  readonly expose: boolean;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    details: ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.expose = true;
  }
}

// Fábricas para os erros mais comuns, com códigos estáveis consumidos pelo
// frontend (ver docs/API.md).
export const Errors = {
  unauthorized: (message = 'Não autenticado.') =>
    new AppError('UNAUTHORIZED', message, 401),
  invalidCredentials: (message = 'E-mail ou senha inválidos.') =>
    new AppError('INVALID_CREDENTIALS', message, 401),
  forbidden: (message = 'Sem permissão para esta ação.') =>
    new AppError('FORBIDDEN', message, 403),
  notFound: (code: string, message: string) => new AppError(code, message, 404),
  validation: (details: ErrorDetail[], message = 'Dados inválidos.') =>
    new AppError('VALIDATION_ERROR', message, 422, details),
  conflict: (code: string, message: string) => new AppError(code, message, 409),
  versionConflict: (message = 'O registro foi alterado por outra pessoa.') =>
    new AppError('VERSION_CONFLICT', message, 409),
  rateLimited: (message = 'Muitas requisições. Tente novamente em instantes.') =>
    new AppError('RATE_LIMITED', message, 429),
  internal: (message = 'Erro interno.') =>
    new AppError('INTERNAL_ERROR', message, 500),
};
