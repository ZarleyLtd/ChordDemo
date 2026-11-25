/* Stomper API: the stomper-api Edge Function on the shared Supabase "Apps" project.
   This is the only place the URL is set. */
window.StomperApi = (function () {
  const URL = 'https://yzyipxvlsoxfphwobfkb.supabase.co/functions/v1/stomper-api';

  async function parse(res, action) {
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error || 'stomper-api ' + action + ' ' + res.status);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  /** Public reads: GET with query parameters and no custom headers. */
  async function get(params) {
    const res = await fetch(URL + '?' + new URLSearchParams(params), { cache: 'no-cache' });
    return parse(res, params.action);
  }

  /** Actions: POST a JSON string as text/plain, so the browser skips the CORS preflight. */
  async function post(action, data) {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(Object.assign({ action }, data)),
    });
    return parse(res, action);
  }

  return { URL, get, post };
})();
