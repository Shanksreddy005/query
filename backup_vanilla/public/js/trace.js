/**
 * Reasoning Trace Animation Controller
 * Handles 6-step process trace visualization according to exact timing specifications:
 * - waiting -> running (blue pulse) -> done (green ✓)
 * - typewriter effect at ~3 chars per 8ms
 * - 180-250ms step-to-step pause
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class TraceController {
  constructor(containerEl) {
    this.container = containerEl;
    this.steps = [];
  }

  renderShell(steps) {
    this.steps = steps;
    const card = document.createElement('div');
    card.className = 'trace-card';
    card.id = 'traceCard';

    card.innerHTML = `
      <div class="card-hdr">
        <div class="card-hdr-left">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#4f8ef7" stroke-width="1.6">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 5v3l2 2"/>
          </svg>
          Reasoning trace
        </div>
        <span class="badge badge-blue" id="traceStatusBadge">
          Running<span class="dots"></span>
        </span>
      </div>
      <div class="trace-steps">
        ${steps.map((step, idx) => `
          <div class="step" id="stepRow_${idx}">
            <div class="step-dot waiting" id="stepDot_${idx}">${idx + 1}</div>
            <div class="step-body">
              <div class="step-label waiting" id="stepLabel_${idx}">${step.label || step.name}</div>
              <div class="step-detail" id="stepDetail_${idx}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    this.container.appendChild(card);
  }

  async animateStep(index, detailText) {
    const dot = document.getElementById(`stepDot_${index}`);
    const label = document.getElementById(`stepLabel_${index}`);
    const detail = document.getElementById(`stepDetail_${index}`);
    if (!dot || !label || !detail) return;

    // Set to running
    dot.className = 'step-dot running';
    label.className = 'step-label running';
    detail.className = 'step-detail active';
    detail.textContent = '';

    // Typewriter effect: ~3 chars per 8ms
    const text = detailText || '';
    for (let c = 0; c < text.length; c++) {
      detail.textContent += text[c];
      if (c % 3 === 0) {
        await sleep(8);
      }
    }

    // Pause before completion
    await sleep(200);

    // Set to done
    dot.className = 'step-dot done';
    dot.textContent = '✓';
    label.className = 'step-label done';
  }

  complete() {
    const badge = document.getElementById('traceStatusBadge');
    if (badge) {
      badge.className = 'badge badge-green';
      badge.textContent = 'Complete ✓';
    }
  }
}

window.TraceController = TraceController;
window.sleep = sleep;
