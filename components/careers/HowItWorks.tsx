import Image from "next/image";
import { Ellipsis, FileCheck, Video, type LucideIcon } from "lucide-react";
import { STEPS } from "@/lib/careers";

// Stock placeholders — replace with genuine team photos (e.g. /public/careers/*.jpg).
const PHOTOS = {
  back: {
    src: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=900&q=70",
    alt: "Two colleagues reviewing code together at a desktop monitor",
  },
  front: {
    src: "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=900&q=70",
    alt: "Teammates working side by side on laptops in a bright office",
  },
};

function FloatCard({
  variant,
  num,
  label,
  progress,
  Icon,
  tone,
}: {
  variant: 1 | 2;
  num: string;
  label: string;
  progress: number;
  Icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className={`float-card float-card--${variant}`} aria-hidden="true">
      <div className="float-card__row">
        <span className={`float-card__icon tone-${tone}`}>
          <Icon className="icon" />
        </span>
        <Ellipsis className="icon float-card__dots" />
      </div>
      <p className="float-card__num">{num}</p>
      <p className="float-card__label">{label}</p>
      <div className="float-card__bar">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export function CareerSteps() {
  return (
    <ol className="career-steps">
      {STEPS.map((step, i) => (
        <li key={step.title} className="career-step reveal">
          <span className="career-step__num" aria-hidden="true">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="career-step__title">
              <span className="sr-only">Step {i + 1}: </span>
              {step.title}
            </h3>
            <p className="career-step__text">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HowItWorks() {
  return (
    <section className="section section--cream how-it-works" id="how-it-works" aria-labelledby="how-title">
      <div className="container">
        <div className="how-it-works__head reveal">
          <h2 className="section-title" id="how-title">
            How Joining Qubenix Works
          </h2>
          <p className="section-lead">
            Discover a simple way to start your journey with Qubenix. Explore opportunities, apply for a position,
            connect with our team, and start building real-world experience.
          </p>
        </div>

        <div className="how-layout">
          <div className="collage reveal">
            <figure className="collage__photo collage__photo--back">
              <Image src={PHOTOS.back.src} alt={PHOTOS.back.alt} fill sizes="(max-width: 1023px) 64vw, 340px" />
            </figure>
            <figure className="collage__photo collage__photo--front">
              <Image src={PHOTOS.front.src} alt={PHOTOS.front.alt} fill sizes="(max-width: 1023px) 64vw, 340px" />
            </figure>
            <FloatCard variant={1} num="01" label="Application Received" progress={40} Icon={FileCheck} tone="purple" />
            <FloatCard variant={2} num="02" label="Interview & Assessment" progress={72} Icon={Video} tone="orange" />
          </div>

          <CareerSteps />
        </div>
      </div>
    </section>
  );
}
