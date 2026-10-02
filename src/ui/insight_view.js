/**
 * AI Insight Card Renderer
 * Renders the business takeaway card with dark gradient, sparkle icon, and typewriter animation.
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

export class InsightView {
  constructor(containerEl) {
    this.container = containerEl;
  }

  async render(insightText) {
    const card = document.createElement('div');
    card.className = 'insight-card';

    card.innerHTML = `
      <div class="insight-icon">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 1zm3.854 2.146a.5.5 0 0 1 0 .708l-1.414 1.414a.5.5 0 1 1-.708-.708l1.414-1.414a.5.5 0 0 1 .708 0zm2.646 4.354a.5.5 0 0 1 .5.5v.002a.5.5 0 0 1-1 0V8a.5.5 0 0 1 .5-.5zm-2.146 3.854a.5.5 0 0 1 .708 0l1.414 1.414a.5.5 0 0 1-.708.708l-1.414-1.414a.5.5 0 0 1 0-.708zM8 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm-3.854-2.146a.5.5 0 0 1 0-.708l1.414-1.414a.5.5 0 1 1 .708.708l-1.414 1.414a.5.5 0 0 1-.708 0zm-2.646-4.354a.5.5 0 0 1-.5-.5V6a.5.5 0 0 1 1 0v.002a.5.5 0 0 1-.5.5zm2.146-3.854a.5.5 0 0 1-.708 0L1.524 1.232a.5.5 0 0 1 .708-.708l1.414 1.414a.5.5 0 0 1 0 .708z"/>
        </svg>
      </div>
      <div class="insight-content">
        <div class="insight-label">AI INSIGHT</div>
        <div class="insight-text" id="insightTextEl"><span class="cursor">▋</span></div>
      </div>
    `;

    this.container.appendChild(card);

    const textEl = card.querySelector('#insightTextEl');
    const cleanText = (insightText || '').trim();

    // Typewriter effect: ~4 chars per 11ms
    let displayed = '';
    for (let i = 0; i < cleanText.length; i++) {
      displayed += cleanText[i];
      textEl.innerHTML = escapeHTML(displayed) + '<span class="cursor">▋</span>';
      if (i % 4 === 0) {
        await sleep(11);
      }
    }

    // Remove cursor at end
    textEl.innerHTML = escapeHTML(cleanText);
  }
}
