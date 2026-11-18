import { STATS } from "@/lib/careers";

export function CareersStats() {
  return (
    <section className="careers-stats" aria-label="Qubenix careers at a glance">
      <div className="container">
        <ul className="stats-grid">
          {STATS.map((s) => (
            <li key={s.value} className="stat reveal">
              <p className="stat__value">{s.value}</p>
              <p className="stat__label">{s.label}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
