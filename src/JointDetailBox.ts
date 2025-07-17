import './joint-detail-box.css';

/**
 * JointDetailBox displays details for a joint and manages its own UI and events.
 * Can be used for selected or hovered joints, etc.
 */
export class JointDetailBox {
  public rootElement: HTMLElement;
  private jointNameEl: HTMLElement;
  private resetBtn: HTMLButtonElement;
  private positionEls: { x: HTMLElement; y: HTMLElement; z: HTMLElement };
  private rotationEls: { x: HTMLElement; y: HTMLElement; z: HTMLElement };
  private detailsContainer: HTMLElement;

  constructor() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'joint-detail-box';
    this.rootElement.innerHTML = `
      <div class="selection-header">
        <strong>Joint:</strong>
        <span id="joint-name">None</span>
        <button id="reset-joint-btn" class="reset-btn" style="display: none;">Reset</button>
      </div>
      <div class="selection-details" id="joint-details" style="display: none;">
        <div class="detail-group">
          <span class="detail-label">Position:</span>
          <span class="detail-values">
            X: <span id="position-x">0.00</span>
            Y: <span id="position-y">0.00</span>
            Z: <span id="position-z">0.00</span>
          </span>
        </div>
        <div class="detail-group">
          <span class="detail-label">Rotation:</span>
          <span class="detail-values">
            X: <span id="rotation-x">0.00</span>
            Y: <span id="rotation-y">0.00</span>
            Z: <span id="rotation-z">0.00</span>
          </span>
        </div>
      </div>
    `;
    this.jointNameEl = this.rootElement.querySelector('#joint-name')!;
    this.resetBtn = this.rootElement.querySelector('#reset-joint-btn')!;
    this.detailsContainer = this.rootElement.querySelector('#joint-details')!;
    this.positionEls = {
      x: this.rootElement.querySelector('#position-x')!,
      y: this.rootElement.querySelector('#position-y')!,
      z: this.rootElement.querySelector('#position-z')!,
    };
    this.rotationEls = {
      x: this.rootElement.querySelector('#rotation-x')!,
      y: this.rootElement.querySelector('#rotation-y')!,
      z: this.rootElement.querySelector('#rotation-z')!,
    };
    this.resetBtn.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('reset-joint', { detail: { joint: this.jointNameEl.textContent } }));
    });
  }

  public show(jointName: string, position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }, canReset = false) {
    this.jointNameEl.textContent = jointName || 'None';
    this.positionEls.x.textContent = position.x.toFixed(2);
    this.positionEls.y.textContent = position.y.toFixed(2);
    this.positionEls.z.textContent = position.z.toFixed(2);
    this.rotationEls.x.textContent = rotation.x.toFixed(2);
    this.rotationEls.y.textContent = rotation.y.toFixed(2);
    this.rotationEls.z.textContent = rotation.z.toFixed(2);
    this.detailsContainer.style.display = '';
    this.resetBtn.style.display = canReset ? '' : 'none';
  }

  public hide() {
    this.jointNameEl.textContent = 'None';
    this.detailsContainer.style.display = 'none';
    this.resetBtn.style.display = 'none';
  }
}
