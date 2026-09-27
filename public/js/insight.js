/**
 * AI Insight Card Renderer
 * Renders AI-narrated executive takeaway with typewriter animation and blinking cursor.
 */

async function renderInsightCard(container, insightText) {
  const card = document.createElement('div');
  card.className = 'insight-card';

  card.innerHTML = `
    <div class="insight-icon">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="8" cy="8" r="3"/>
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/>
      </svg>
    </div>
    <div class="insight-body">
      <div class="insight-label">AI insight</div>
      <div class="insight-text" id="insightTextEl"></div>
    </div>
  `;

  container.appendChild(card);

  const textEl = card.querySelector('#insightTextEl');
  textEl.classList.add('typing-cursor');

  const text = insightText || '';
  for (let c = 0; c < text.length; c++) {
    textEl.textContent += text[c];
    if (c % 4 === 0) {
      await sleep(11);
    }
  }

  // Remove cursor after slight delay
  await sleep(400);
  textEl.classList.remove('typing-cursor');
}

window.renderInsightCard = renderInsightCard;
