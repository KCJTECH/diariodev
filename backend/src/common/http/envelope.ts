// Envelopes padronizados de resposta (ver §17.1 do prompt mestre).

export type Meta = {
  requestId: string;
  page?: number;
  perPage?: number;
  total?: number;
  totalPages?: number;
};

export type SuccessBody<T> = { data: T; meta: Meta };

export function ok<T>(data: T, requestId: string): SuccessBody<T> {
  return { data, meta: { requestId } };
}

export function paginated<T>(
  data: T[],
  requestId: string,
  page: number,
  perPage: number,
  total: number,
): SuccessBody<T[]> {
  return {
    data,
    meta: {
      requestId,
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details: { field?: string; message: string }[];
    requestId: string;
  };
};
