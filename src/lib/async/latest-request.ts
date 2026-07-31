export type LatestRequestToken = {
  isCurrent: () => boolean;
};

/**
 * Tracks the newest asynchronous request in a UI flow.
 *
 * A completed request may update state only while its token is current.
 * Invalidating the gate makes every outstanding token stale.
 */
export class LatestRequestGate {
  private generation = 0;

  begin(): LatestRequestToken {
    const requestGeneration = ++this.generation;
    return {
      isCurrent: () => requestGeneration === this.generation,
    };
  }

  invalidate(): void {
    this.generation += 1;
  }
}
