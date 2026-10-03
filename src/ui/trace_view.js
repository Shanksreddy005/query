/**
 * Compact AI Activity Stream
 * Operational progress indicator (Linear / Perplexity inspired)
 * Displays active step with pulsing indicator, completed with green checkmark, waiting with muted circle.
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TraceView {
  constructor(containerEl) {
    this.container = containerEl;
    this.steps = [];
    this.cardEl = null;
  }

  renderShell(steps = []) {
    this.steps = steps;
    const card = document.createElement('div');
    card.className = 'ai-activity-card';
    card.id = 'aiActivityCard';

    card.innerHTML = `
      <div class="ai-activity-header">
        <span style="display: flex; align-items: center; gap: 8px;">
          <span style="color: var(--accent); font-size: 14px;">⚡</span>
          <span>Querying your data...</span>
        </span>
        <span id="activityStatusBadge" style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono);">
          Processing
        </span>
      </div>
      <div class="ai-activity-steps">
        ${steps.map((step, idx) => `
          <div class="activity-step waiting" id="actStep_${idx}">
            <span class="activity-step-dot" id="actDot_${idx}">○</span>
            <div class="activity-step-body">
              <span class="activity-step-label" id="actLabel_${idx}">${escapeHTML(step.label)}</span>
              <span class="activity-step-detail" id="actDetail_${idx}" style="display: none;"></span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    this.container.appendChild(card);
    this.cardEl = card;
  }

  async animateStep(index, detailText) {
    const stepRow = document.getElementById(`actStep_${index}`);
    const dot = document.getElementById(`actDot_${index}`);
    const detail = document.getElementById(`actDetail_${index}`);
    if (!stepRow || !dot || !detail) return;

    // Set to running
    stepRow.className = 'activity-step running';
    dot.textContent = '●';

    if (detailText) {
      detail.style.display = 'block';
      detail.textContent = detailText;
    }

    await sleep(80);

    // Set previous step to done if not already
    if (index > 0) {
      const prevRow = document.getElementById(`actStep_${index - 1}`);
      const prevDot = document.getElementById(`actDot_${index - 1}`);
      if (prevRow && prevDot) {
        prevRow.className = 'activity-step done';
        prevDot.textContent = '✓';
      }
    }
  }

  complete() {
    // Mark all steps as done
    this.steps.forEach((_, idx) => {
      const row = document.getElementById(`actStep_${idx}`);
      const dot = document.getElementById(`actDot_${idx}`);
      if (row && dot) {
        row.className = 'activity-step done';
        dot.textContent = '✓';
      }
    });

    const badge = document.getElementById('activityStatusBadge');
    if (badge) {
      badge.style.color = 'var(--success)';
      badge.textContent = 'Ready ✓';
    }
  }

  setError(errorText) {
    const badge = document.getElementById('activityStatusBadge');
    if (badge) {
      badge.style.color = 'var(--error)';
      badge.textContent = 'Failed';
    }
  }
}
