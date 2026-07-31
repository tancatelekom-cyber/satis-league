import { getCounterStoreName, type LastDayCounter } from "@/lib/last-day-counters";
import { LastDayCounterShareButton } from "@/components/last-day-counter-share-button";

export function LastDayCounters({ counters, canShare = false }: { counters: LastDayCounter[]; canShare?: boolean }) {
  if (!counters.length) return null;

  return (
    <section className="last-day-counter-section">
      <div className="last-day-counter-heading">
        <div><span>SON GÜN</span><h2>Sayaçlar</h2></div>
        {canShare ? (
          <LastDayCounterShareButton counters={counters.map((counter) => ({
            category: counter.category_name,
            scope: counter.scope === "company" ? "Firma" : getCounterStoreName(counter),
            remaining: counter.remaining_count
          }))} />
        ) : null}
      </div>
      <div className="last-day-counter-grid">
        {counters.map((counter) => {
          const completed = counter.remaining_count <= 0;
          return (
            <article className={`last-day-counter-card${completed ? " completed" : ""}`} key={counter.id}>
              <span className="last-day-counter-scope">
                {counter.scope === "company" ? "Firma" : getCounterStoreName(counter)}
              </span>
              <h3>{counter.category_name}</h3>
              {completed ? (
                <div className="last-day-counter-check" aria-label="Tamamlandı">✓</div>
              ) : (
                <strong className="last-day-counter-value">{counter.remaining_count.toLocaleString("tr-TR")}</strong>
              )}
              <p>{completed ? "Tamamlandı" : "Kalan"}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
