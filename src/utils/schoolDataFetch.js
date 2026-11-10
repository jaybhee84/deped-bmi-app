const SCHOOL_TABLES = new Set(['students', 'sbfp_enrolment', 'school_info_sbmi', 'schools']);

// Keep auth and shared configuration on the division project.
export async function schoolDataFetch(input, init) {
  // Enable only after the server functions and existing records are ready.
  if (import.meta.env?.VITE_IECES_EXCLUSIVE_DATA !== 'true') return globalThis.fetch(input, init);
  const request = new Request(input, init);
  const url = new URL(request.url);
  const table = url.pathname.match(/^\/rest\/v1\/([^/]+)$/)?.[1];
  if (!SCHOOL_TABLES.has(table)) return globalThis.fetch(input, init);

  const response = await globalThis.fetch(`${url.origin}/functions/v1/school-data`, {
    method: 'POST',
    headers: {
      apikey: request.headers.get('apikey') || '',
      Authorization: request.headers.get('Authorization') || '',
      'Content-Type': 'application/json',
    },
    signal: request.signal,
    body: JSON.stringify({
      table, query: url.search, method: request.method,
      headers: Object.fromEntries(request.headers),
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text(),
    }),
  });
  if (!response.ok) return response;
  const result = await response.json();
  return new Response(request.method === 'HEAD' || result.status === 204 ? null : result.body, {
    status: result.status, headers: result.headers,
  });
}
