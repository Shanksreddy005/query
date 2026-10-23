import { GOLDEN_TEMPLATES, GoldenTemplate } from '../config/genericPatterns';

export class TemplateMatcher {
  private tokenize(text: string): Set<string> {
    return new Set(
      text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2)
    );
  }

  public getTopKMatches(userQuery: string, k = 2): GoldenTemplate[] {
    const queryTokens = this.tokenize(userQuery);
    
    const scored = GOLDEN_TEMPLATES.map(tmpl => {
      let maxScore = 0;
      tmpl.patterns.forEach(pattern => {
        const patternTokens = this.tokenize(pattern);
        const intersection = new Set([...queryTokens].filter(x => patternTokens.has(x)));
        const union = new Set([...queryTokens, ...patternTokens]);
        const score = union.size === 0 ? 0 : intersection.size / union.size;
        if (score > maxScore) maxScore = score;
      });
      return { template: tmpl, score: maxScore };
    });

    return scored
      .filter(item => item.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.template);
  }
}
