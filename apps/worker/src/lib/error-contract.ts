type ErrorBody = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  [key: string]: unknown;
};

function defaultCodeForStatus(status: number): string {
  if (status === 400) return 'bad_request';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422) return 'validation_error';
  if (status >= 500) return 'internal_error';
  return 'request_error';
}

function defaultMessageForStatus(status: number): string {
  if (status === 400) return 'Bad request';
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  if (status === 404) return 'Not found';
  if (status === 409) return 'Conflict';
  if (status === 422) return 'Validation failed';
  if (status >= 500) return 'Internal server error';
  return 'Request failed';
}

export function normalizeErrorBody(status: number, input: ErrorBody): Record<string, unknown> {
  const existingError = typeof input.error === 'string' ? input.error : undefined;
  const existingMessage = typeof input.message === 'string' ? input.message : undefined;
  const existingCode = typeof input.code === 'string' ? input.code : undefined;

  const code = existingCode ?? defaultCodeForStatus(status);
  const message = existingMessage ?? existingError ?? defaultMessageForStatus(status);
  const error = existingError ?? message;

  return {
    ...input,
    error,
    message,
    code,
  };
}

export function createErrorResponse(status: number, input: ErrorBody, headers?: Headers): Response {
  const normalized = normalizeErrorBody(status, input);
  const outHeaders = new Headers(headers);
  outHeaders.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(normalized), {
    status,
    headers: outHeaders,
  });
}
