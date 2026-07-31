import { getCounterStoreName, type LastDayCounter } from "@/lib/last-day-counters";
import { LastDayCounterShareButton } from "@/components/last-day-counter-share-button";
import { adjustLastDayCounterAction } from "@/app/admin/son-gun-sayac/actions";

export function LastDayCounters({
  counters,
  canShare = false,
  canEdit = false
}: {
  counters: LastDayCounter[];
  canShare?: boolean;
  canEdit?: boolean;
}) {
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
              {canEdit ? (
                <div className="admin-counter-adjust">
                  <form action={adjustLastDayCounterAction}>
                    <input name="counterId" type="hidden" value={counter.id} />
                    <input name="adjustment" type="hidden" value="-1" />
                    <input name="returnTo" type="hidden" value="/" />
                    <button aria-label="Sayacı bir azalt" disabled={completed} type="submit">−</button>
                  </form>
                  <span>{counter.remaining_count.toLocaleString("tr-TR")}</span>
                  <form action={adjustLastDayCounterAction}>
                    <input name="counterId" type="hidden" value={counter.id} />
                    <input name="adjustment" type="hidden" value="1" />
                    <input name="returnTo" type="hidden" value="/" />
                    <button aria-label="Sayacı bir artır" type="submit">+</button>
                  </form>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
