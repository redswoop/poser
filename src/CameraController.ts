import './camera-controller.css';

/**
 * CameraController handles camera-related UI controls and event display for the poser3d app.
 * It is independent of 3D logic and can be tested standalone.
 */
export class CameraController {
  public rootElement: HTMLElement;
  private controlPanel: HTMLElement;

  constructor() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'camera-controller-root';
    this.controlPanel = this.createControlPanel();
    this.rootElement.appendChild(this.controlPanel);
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


  private attachListeners(): void {
    this.controlPanel.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLButtonElement).id;
        // Optionally, emit custom events for integration
        this.rootElement.dispatchEvent(new CustomEvent('control-action', { detail: { action: id } }));
      });
    });
  }

}

// For standalone testing:
// window.CameraController = CameraController;
