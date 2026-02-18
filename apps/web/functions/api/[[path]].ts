interface Env {
  API_ORIGIN?: string;
}

const DEFAULT_API_ORIGIN = 'https://expense-api.cromkake.workers.dev';

export const onRequest: PagesFunction<Env> = async (context) => {
  const origin = context.env.API_ORIGIN || DEFAULT_API_ORIGIN;
  const splat = Array.isArray(context.params.path)
    ? context.params.path.join('/')
    : (context.params.path || '');

  const requestUrl = new URL(context.request.url);
  const targetUrl = new URL(`/${splat}`, origin);
  targetUrl.search = requestUrl.search;

  const headers = new Headers(context.request.headers);
  headers.delete('host');

  const upstreamRequest = new Request(targetUrl.toString(), {
    method: context.request.method,
    headers,
    body: context.request.method === 'GET' || context.request.method === 'HEAD' ? undefined : context.request.body,
    redirect: 'manual',
  });

  const upstreamResponse = await fetch(upstreamRequest);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set('x-api-proxy', 'pages-function');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};
