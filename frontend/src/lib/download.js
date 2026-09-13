import api from './api';

/**
 * Fetches a file through the API client and hands it to the browser as a
 * download. A plain link cannot carry the sign-in token, and every export is
 * admin only, so the request has to go through the client that holds it.
 */
export async function downloadFile(url, filename) {
  const response = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(response.data);

  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoked on the next tick, once the browser has taken hold of the file.
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
