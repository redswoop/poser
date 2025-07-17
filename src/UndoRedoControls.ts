import './undo-redo-controls.css';
import { UndoRedoManager } from './UndoRedoManager';

/**
 * UndoRedoControls manages the undo/redo UI content and events.
 * Provides undo/redo buttons and keyboard shortcuts.
 */
export class UndoRedoControls {
  public rootElement: HTMLElement;
  private undoRedoManager: UndoRedoManager;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  constructor(undoRedoManager: UndoRedoManager) {
    this.undoRedoManager = undoRedoManager;
    
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'undo-redo-controls-container';
    this.rootElement.innerHTML = `
      <div class="undo-redo-buttons">
        <button id="undo-btn" disabled>⟲ Undo</button>
        <button id="redo-btn" disabled>⟳ Redo</button>
      </div>
      <div class="undo-redo-shortcuts">
        <p><strong>Shortcuts:</strong></p>
        <p>Ctrl+Z: Undo</p>
        <p>Ctrl+Y: Redo</p>
      </div>
    `;

    // Get references to elements
    this.undoBtn = this.rootElement.querySelector('#undo-btn')!;
    this.redoBtn = this.rootElement.querySelector('#redo-btn')!;

    this.setupEventListeners();
    this.updateUI();
  }

  private setupEventListeners(): void {
    // Undo button
    this.undoBtn.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('undo-requested'));
    });

    // Redo button
    this.redoBtn.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('redo-requested'));
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.rootElement.dispatchEvent(new CustomEvent('undo-requested'));
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.rootElement.dispatchEvent(new CustomEvent('redo-requested'));
      }
    });
  }

  /**
   * Update the UI state based on undo/redo manager state
   */
  public updateUI(): void {
    this.undoBtn.disabled = !this.undoRedoManager.canUndo();
    this.redoBtn.disabled = !this.undoRedoManager.canRedo();
  }
}
