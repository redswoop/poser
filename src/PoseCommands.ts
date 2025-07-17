import './pose-commands.css';

/**
 * PoseCommands component renders preset pose controls and dispatches reset events.
 */
export class PoseCommands {
  public rootElement: HTMLElement;

  constructor() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'pose-commands-container';
    this.rootElement.innerHTML = `
      <div class="pose-commands-block">
        <div class="pose-commands-header"><h4>🎭 Pose Commands</h4></div>
        <div class="pose-commands-buttons">
          <button id="reset-default-pose-btn" class="pose-cmd-btn reset-pose">
            <span class="btn-icon">🔄</span>
            <span class="btn-text">Reset to Default</span>
          </button>
        </div>
      </div>
    `;
    const btn = this.rootElement.querySelector('#reset-default-pose-btn') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('reset-pose'));
    });
  }
}
