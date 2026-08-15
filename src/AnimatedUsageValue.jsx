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
  as: Element = "span",
  animateOnMount = false,
  value,
  format,
  className = "system-summary-value",
  ...elementProps
}) {
  const animateInitially = (
    animateOnMount
    && Number.isFinite(value)
    && value > 0
    && !(typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
  const initialValue = animateInitially ? 0 : value;
  const [displayedValue, setDisplayedValue] = useState(initialValue);
  const displayedValueRef = useRef(initialValue);
  const targetRef = useRef(initialValue);
  const [highlightKey, setHighlightKey] = useState(animateInitially ? 1 : 0);

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
    <Element
      key={highlightKey}
      {...elementProps}
      className={highlightKey ? `${className} ${className}--updated` : className}
      aria-label={format(value)}
    >
      {format(displayedValue)}
    </Element>
  );
}
