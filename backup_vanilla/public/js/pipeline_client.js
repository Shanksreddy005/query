/**
 * Pipeline API Client
 * Dispatches natural language queries to /api/pipeline securely without exposing any secrets.
 */

class PipelineClient {
  static async executeQuery(question) {
    try {
      const response = await fetch('/api/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ question })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Failed to connect to QueryMind API.'
      };
    }
  }

  static async checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        return await res.json();
      }
      return null;
    } catch (e) {
      return null;
    }
  }
}

window.PipelineClient = PipelineClient;
