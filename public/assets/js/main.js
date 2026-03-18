// Mobile burger menu toggle
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('#burger');
  const menu = document.querySelector('#mobileMenu');
  if (btn && menu) {
    btn.addEventListener('click', () => {
      const open = menu.getAttribute('data-open') === 'true';
      menu.setAttribute('data-open', String(!open));
      menu.classList.toggle('hidden');
    });
  }
});
