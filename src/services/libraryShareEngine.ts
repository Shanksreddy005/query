import { LocalQueryStorage, UserSavedQuery } from './localQueryStorage';

export class LibraryShareEngine {
  private storage = new LocalQueryStorage();

  public exportLocalLibraryToFile(): void {
    const rawQueries = this.storage.getSavedQueries();
    
    if (rawQueries.length === 0) {
      if (typeof alert !== 'undefined') {
        alert("No local template metrics logged. Execute successful queries first!");
      }
      return;
    }

    const payload = {
      platform: "QueryMind Local Analyst Architecture",
      version: "1.0.0",
      compiledAt: Date.now(),
      queries: rawQueries
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `query_mind_blueprints_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  public importLibraryFromFile(file: File, callback: (merged: number) => void): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (!parsed.queries || !Array.isArray(parsed.queries)) throw new Error("Invalid schema template context.");

        const current = this.storage.getSavedQueries();
        let addedCount = 0;

        parsed.queries.forEach((incoming: UserSavedQuery) => {
          const duplicate = current.some(
            ex => ex.userQuery.toLowerCase() === incoming.userQuery.toLowerCase() &&
                  ex.schemaContextFingerprint === incoming.schemaContextFingerprint
          );
          if (!duplicate) {
            current.push(incoming);
            addedCount++;
          }
        });

        localStorage.setItem("query_mind_local_library", JSON.stringify(current));
        callback(addedCount);
      } catch (err) {
        if (typeof alert !== 'undefined') {
          alert("Import aborted: Failed to parse structural data layers configuration.");
        }
      }
    };
    reader.readAsText(file);
  }
}
