import { CULTURE } from "@/lib/careers";
import { TestimonialCarousel } from "./TestimonialCarousel";

/**
 * Uses the reference's three-card testimonial composition as a "Life at Qubenix" showcase.
 * Add real testimonials (name, role, quote, consented photo) only once genuine ones exist.
 */
export function TeamExperience() {
  return (
    <section className="section section--cream team-experience" id="life-at-qubenix" aria-labelledby="life-title">
      <div className="container">
        <div className="team-experience__head reveal">
          <h2 className="section-title" id="life-title">
            Grow, Build &amp; Create
            <br />
            With Us
          </h2>
          <p className="section-lead">
            Discover what makes working with Qubenix different. Learn, collaborate, experiment, and contribute to
            meaningful technology projects alongside a growing team.
          </p>
        </div>
        <TestimonialCarousel items={CULTURE} />
      </div>
    </section>
  );
}
