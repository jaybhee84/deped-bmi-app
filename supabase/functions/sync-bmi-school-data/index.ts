import { createHandler } from './sync.mjs';

export default { fetch: createHandler(Deno.env) };
