import './new-style.css';

/**
 * CameraController handles camera-related UI controls and event display for the poser3d app.
 * It is independent of 3D logic and can be tested standalone.
 */
export class CameraController {
  public rootElement: HTMLElement;
  private controlPanel: HTMLElement;
  private eventLog: HTMLTextAreaElement;

  constructor() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'camera-controller-root';
    this.controlPanel = this.createControlPanel();
    this.eventLog = this.createEventLog();
    this.rootElement.appendChild(this.controlPanel);
    this.rootElement.appendChild(this.eventLog);
    this.attachListeners();
  }

  private createControlPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'control-panel';
    panel.innerHTML = `
      <button id="reset-camera">Reset Camera</button>
      <button id="undo-btn">Undo</button>
      <button id="redo-btn">Redo</button>
      <button id="view-front">Front View</button>
      <button id="view-back">Back View</button>
      <button id="view-left">Left View</button>
      <button id="view-right">Right View</button>
      <button id="view-top">Top View</button>
      <button id="view-bottom">Bottom View</button>
    `;
    return panel;
  }

  private createEventLog(): HTMLTextAreaElement {
    const log = document.createElement('textarea');
    log.className = 'event-log';
    log.rows = 8;
    log.readOnly = true;
    log.placeholder = 'Event log...';
    return log;
  }

  private attachListeners(): void {
    this.controlPanel.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLButtonElement).id;
        this.logEvent(`Button clicked: ${id}`);
        // Optionally, emit custom events for integration
        this.rootElement.dispatchEvent(new CustomEvent('control-action', { detail: { action: id } }));
      });
    });
  }

  public logEvent(msg: string): void {
    this.eventLog.value += msg + '\n';
    this.eventLog.scrollTop = this.eventLog.scrollHeight;
  }
}

// For standalone testing:
// window.CameraController = CameraController;
