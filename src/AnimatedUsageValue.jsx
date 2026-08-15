import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export function animateUsageValue({
  from,
  to,
  reduceMotion = false,
  onUpdate,
}) {
  const canAnimate = (
    Number.isFinite(from)
    && from >= 0
    && Number.isFinite(to)
    && to >= 0
    && !reduceMotion
  );

  if (!canAnimate) {
    onUpdate(to);
    return null;
  }

  const frame = { value: from };
  return gsap.to(frame, {
    value: to,
    duration: 1.5,
    ease: "power2.out",
    onUpdate: () => onUpdate(frame.value),
    onComplete: () => onUpdate(to),
  });
}

export function AnimatedUsageValue({
  value,
  format,
  className = "system-summary-value",
}) {
  const [displayedValue, setDisplayedValue] = useState(value);
  const displayedValueRef = useRef(value);
  const targetRef = useRef(value);
  const [highlightKey, setHighlightKey] = useState(0);

  useEffect(() => {
    if (Object.is(targetRef.current, value)) return undefined;

    targetRef.current = value;
    setHighlightKey((key) => key + 1);

    const tween = animateUsageValue({
      from: displayedValueRef.current,
      to: value,
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onUpdate: (nextValue) => {
        displayedValueRef.current = nextValue;
        setDisplayedValue(nextValue);
      },
    });

    return tween ? () => tween.kill() : undefined;
  }, [value]);

  return (
    <span
      key={highlightKey}
      className={highlightKey ? `${className} ${className}--updated` : className}
      aria-label={format(value)}
    >
      {format(displayedValue)}
    </span>
  );
}
