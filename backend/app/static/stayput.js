// Presentation only: no telemetry requests, no device state changes.
const descriptions = {
  DISARMED: ['Disarmed', "The phone isn't guarding."],
  GUARDING: ['Guarding', 'The phone is lying still and watching your stuff.'],
  ALERT: ['Picked up', 'Someone moved it. The alarm stays on until you disarm it.'],
};
const buttons = document.querySelectorAll('[data-preview]');
buttons.forEach(button => {
  button.addEventListener('click', () => {
    const mode = button.dataset.preview;
    const [title, description] = descriptions[mode];
    document.querySelector('.sp-preview-status').dataset.mode = mode;
    document.getElementById('preview-state').textContent = title;
    document.getElementById('preview-description').textContent = description;
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  });
});
