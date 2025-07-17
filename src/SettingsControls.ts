import './settings-controls.css';

/**
 * SettingsControls component renders scene and model settings controls and dispatches events.
 */
export class SettingsControls {
  public rootElement: HTMLElement;

  constructor() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'settings-controls-container';
    this.rootElement.innerHTML = `
      <div class="settings-group">
        <h4>Scene</h4>
        <div class="setting-row">
          <label for="grid-visible">Show Grid</label>
          <input type="checkbox" id="grid-visible" checked>
        </div>
      </div>
      <div class="settings-group">
        <h4>3D Model</h4>
        <div class="setting-row">
          <label for="gltf-file">Load Model</label>
          <input type="file" id="gltf-file" accept=".glb,.gltf">
        </div>
        <div class="setting-row">
          <label for="show-gltf-model">Show Model</label>
          <input type="checkbox" id="show-gltf-model" checked>
        </div>
        <div class="setting-row">
          <label for="model-opacity">Model Opacity</label>
          <input type="range" id="model-opacity" min="0" max="1" step="0.1" value="1">
          <span class="value-display">1.0</span>
        </div>
        <div class="setting-row">
          <label for="model-scale">Model Scale</label>
          <input type="range" id="model-scale" min="0.1" max="5" step="0.1" value="1.0">
          <span class="value-display">1.0</span>
        </div>
        <div class="setting-row">
          <label for="bone-depth-limit">Bone Control Depth</label>
          <input type="range" id="bone-depth-limit" min="0" max="10" step="1" value="3">
          <span class="value-display">3</span>
        </div>
      </div>
    `;

    // Scene grid checkbox
    const gridCheckbox = this.rootElement.querySelector('#grid-visible') as HTMLInputElement;
    gridCheckbox.addEventListener('change', () => {
      this.rootElement.dispatchEvent(new CustomEvent('toggle-grid', { detail: gridCheckbox.checked }));
    });

    // Load model file input
    const fileInput = this.rootElement.querySelector('#gltf-file') as HTMLInputElement;
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        this.rootElement.dispatchEvent(new CustomEvent('load-model', { detail: file }));
      }
    });

    // Show model checkbox
    const showModelCheckbox = this.rootElement.querySelector('#show-gltf-model') as HTMLInputElement;
    showModelCheckbox.addEventListener('change', () => {
      this.rootElement.dispatchEvent(new CustomEvent('toggle-model-visibility', { detail: showModelCheckbox.checked }));
    });

    // Model opacity slider
    const opacitySlider = this.rootElement.querySelector('#model-opacity') as HTMLInputElement;
    opacitySlider.addEventListener('input', () => {
      const value = parseFloat(opacitySlider.value);
      const display = opacitySlider.parentElement?.querySelector('.value-display') as HTMLElement;
      if (display) display.textContent = value.toFixed(1);
      this.rootElement.dispatchEvent(new CustomEvent('model-opacity-change', { detail: value }));
    });

    // Model scale slider
    const scaleSlider = this.rootElement.querySelector('#model-scale') as HTMLInputElement;
    scaleSlider.addEventListener('input', () => {
      const value = parseFloat(scaleSlider.value);
      const display = scaleSlider.parentElement?.querySelector('.value-display') as HTMLElement;
      if (display) display.textContent = value.toFixed(1);
      this.rootElement.dispatchEvent(new CustomEvent('model-scale-change', { detail: value }));
    });

    // Bone depth limit slider
    const depthSlider = this.rootElement.querySelector('#bone-depth-limit') as HTMLInputElement;
    depthSlider.addEventListener('input', () => {
      const value = parseInt(depthSlider.value, 10);
      const display = depthSlider.parentElement?.querySelector('.value-display') as HTMLElement;
      if (display) display.textContent = value.toString();
      this.rootElement.dispatchEvent(new CustomEvent('bone-depth-limit-change', { detail: value }));
    });
  }
}
