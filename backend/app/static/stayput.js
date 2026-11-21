// Presentation only: no telemetry requests, no device state changes.
const descriptions = {
  DISARMED: ['Disarmed', 'Taking a break. The phone is not guarding.'],
  GUARDING: ['Guarding', 'Phone resting. Watching for a change in orientation.'],
  ALERT: ['Picked up', 'Movement detected. The alert stays on until disarmed.'],
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
