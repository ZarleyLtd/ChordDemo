/* Router: one page for now. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
document.addEventListener('DOMContentLoaded', () => {
  window.Account.init();
  window.PlayerPage.init();
});
