/* Router: one page for now. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(function () {});
}
document.addEventListener('DOMContentLoaded', () => {
  // Help first: its capture listeners must be registered before the page binds its own.
  window.ContextualHelp.init();
  window.Account.init();
  window.PlayerPage.init();
});
