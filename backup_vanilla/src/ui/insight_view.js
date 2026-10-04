/**
 * AI Insight Card Renderer (Answer-First Executive Focus)
 * Displays the primary business answer synthesized by the AI model.
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
    card.className = 'answer-card';

    card.innerHTML = `
      <div class="answer-card-header">
        <span>⚡ Executive Answer</span>
      </div>
      <div class="answer-text" id="answerTextEl"><span class="cursor">▋</span></div>
    `;

    this.container.appendChild(card);

    const textEl = card.querySelector('#answerTextEl');
    const cleanText = (insightText || '').trim();

    // Fast typewriter effect
    let displayed = '';
    for (let i = 0; i < cleanText.length; i++) {
      displayed += cleanText[i];
      textEl.innerHTML = escapeHTML(displayed) + '<span class="cursor">▋</span>';
      if (i % 5 === 0) {
        await sleep(8);
      }
    }

    // Final clean text
    textEl.innerHTML = escapeHTML(cleanText);
  }
}
