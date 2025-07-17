import './ik-controls.css';

/**
 * IKControls component renders inverse kinematics controls and chain list.
 */
export class IKControls {
  public rootElement: HTMLElement;

  constructor() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'ik-controls-root';
    this.rootElement.innerHTML = `
      <div class="ik-controls">
        <button class="ik-btn" id="setup-ik-chains">🔗 Setup IK Chains</button>
        <button class="ik-btn" id="clear-ik-chains">🗑️ Clear IK Chains</button>
        <button class="ik-btn" id="test-ik">🧪 Test IK</button>
      </div>
      <div class="ik-chains-list" id="ik-chains-list">
        <p class="no-chains">No IK chains created yet</p>
      </div>
    `;
    this.attachListeners();
  }

  private attachListeners(): void {
    this.rootElement.querySelector('#setup-ik-chains')?.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('setup-ik-chains'));
    });
    this.rootElement.querySelector('#clear-ik-chains')?.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('clear-ik-chains'));
    });
    this.rootElement.querySelector('#test-ik')?.addEventListener('click', () => {
      this.rootElement.dispatchEvent(new CustomEvent('test-ik'));
    });
  }

  /**
   * Update the IK chains list UI with given chain data.
   */
  public updateChainsList(chains: { chainName: string; bones: string[] }[]): void {
    const chainsList = this.rootElement.querySelector('#ik-chains-list') as HTMLElement;
    if (!chainsList) return;
    if (chains.length === 0) {
      chainsList.innerHTML = '<p class="no-chains">No IK chains created yet</p>';
      return;
    }
    chainsList.innerHTML = chains.map(({ chainName, bones }) => `
      <div class="ik-chain-item">
        <div class="ik-chain-header">
          <span class="ik-chain-name">${chainName}</span>
          <span class="ik-chain-toggle">▼</span>
        </div>
        <div class="ik-chain-details" style="display: none;">
          <div class="ik-chain-bones">
            <strong>Bones (${bones.length}):</strong>
            <ul class="bone-list">
              ${bones.map(b => `<li class="bone-item">${b}</li>`).join('')}
            </ul>
          </div>
          <div class="ik-chain-controls">
            <button class="ik-chain-btn target" data-chain="${chainName}" title="Toggle target visibility">👁️ Target</button>
            <button class="ik-chain-btn solve" data-chain="${chainName}" title="Test solve">🎯 Test</button>
          </div>
        </div>
      </div>
    `).join('');

    // Toggle details on header click
    chainsList.querySelectorAll('.ik-chain-header').forEach(header => {
      header.addEventListener('click', () => {
        const details = (header as HTMLElement).nextElementSibling as HTMLElement;
        const toggle = header.querySelector('.ik-chain-toggle') as HTMLElement;
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
        toggle.textContent = isHidden ? '▲' : '▼';
      });
    });

    // Chain control buttons
    chainsList.querySelectorAll('.ik-chain-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const button = e.target as HTMLButtonElement;
        const chainName = button.getAttribute('data-chain');
        if (!chainName) return;
        if (button.classList.contains('target')) {
          this.rootElement.dispatchEvent(new CustomEvent('toggle-ik-target', { detail: chainName }));
        } else if (button.classList.contains('solve')) {
          this.rootElement.dispatchEvent(new CustomEvent('activate-ik-solving', { detail: chainName }));
        }
      });
    });
  }
}
