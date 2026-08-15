import { useEffect, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  ChartLine,
  CircleNotch,
  X,
} from "@phosphor-icons/react";

import { formatCostUsd, formatTokenCount } from "./agent-model.js";
import { AnimatedUsageValue } from "./AnimatedUsageValue.jsx";

const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Seoul",
});
const DATE_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const COMPACT_NUMBER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const CHART_LEFT = 72;
const CHART_RIGHT = 1028;
const CHART_TOP = 24;
const CHART_BOTTOM = 232;
const TOOLTIP_WIDTH = 112;
const TOOLTIP_HEIGHT = 49;
const TOOLTIP_GAP = 8;

function todayKey() {
  return KST_DATE.format(new Date());
}

function shiftDateKey(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value) {
  return DATE_LABEL.format(new Date(`${value}T00:00:00.000Z`));
}

function periodLabel(startDate, endDate) {
  return `${dateLabel(startDate)} — ${dateLabel(endDate)}`;
}

function axisMax(value) {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function smoothPath(points) {
  if (!points.length) return "";
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function compact(value) {
  return value === 0 ? "0" : COMPACT_NUMBER.format(value);
}

function axisCost(value, maximum) {
  const step = maximum / 4;
  const digits = Number.isInteger(step)
    ? 0
    : step >= 1
      ? 1
      : Math.min(4, Math.ceil(-Math.log10(step)) + 1);
  return `$${value.toFixed(digits)}`;
}

export function getUsageTooltipPosition(pointerX, pointerY) {
  const gap = 12;
  const padding = 8;
  const preferredX = pointerX + gap + TOOLTIP_WIDTH > CHART_RIGHT - padding
    ? pointerX - gap - TOOLTIP_WIDTH
    : pointerX + gap;
  const preferredY = pointerY + gap + TOOLTIP_HEIGHT > CHART_BOTTOM - padding
    ? pointerY - gap - TOOLTIP_HEIGHT
    : pointerY + gap;

  return {
    x: Math.max(CHART_LEFT + padding, Math.min(CHART_RIGHT - padding - TOOLTIP_WIDTH, preferredX)),
    y: Math.max(CHART_TOP + padding, Math.min(CHART_BOTTOM - padding - TOOLTIP_HEIGHT, preferredY)),
  };
}

export function getAnchoredUsageTooltipPosition(pointX, barTop) {
  const padding = 8;
  const above = barTop - TOOLTIP_GAP - TOOLTIP_HEIGHT;
  return {
    x: Math.max(
      CHART_LEFT + padding,
      Math.min(CHART_RIGHT - padding - TOOLTIP_WIDTH, pointX - TOOLTIP_WIDTH / 2),
    ),
    y: above >= CHART_TOP + padding ? above : barTop + TOOLTIP_GAP,
  };
}

export function applyLiveUsageToHistory(data, today, usage) {
  const index = data?.daily?.findIndex(({ date }) => date === today) ?? -1;
  if (index < 0) return data;

  const current = data.daily[index];
  const totalTokens = Number.isFinite(usage?.todayTokens) && usage.todayTokens >= 0
    ? usage.todayTokens
    : current.totalTokens;
  const costUsd = Number.isFinite(usage?.todayCostUsd) && usage.todayCostUsd >= 0
    ? usage.todayCostUsd
    : current.costUsd;
  if (current.totalTokens === totalTokens && current.costUsd === costUsd) return data;

  const daily = [...data.daily];
  daily[index] = { ...current, totalTokens, costUsd };
  return { ...data, daily };
}

function requestUsageHistory(days, endDate, selectedDate, signal) {
  const params = new URLSearchParams({
    days: String(days),
    end: endDate,
    selected: selectedDate,
  });
  return fetch(`/api/usage-history?${params}`, { signal, cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Usage history unavailable");
      return response.json();
    });
}

function Chart({ daily, selectedDate, onSelectDate }) {
  const left = CHART_LEFT;
  const right = CHART_RIGHT;
  const top = CHART_TOP;
  const bottom = CHART_BOTTOM;
  const width = right - left;
  const height = bottom - top;
  const cellWidth = width / Math.max(1, daily.length);
  const barWidth = Math.min(22, cellWidth * 0.52);
  const maxTokens = axisMax(Math.max(0, ...daily.map(({ totalTokens }) => totalTokens)));
  const maxCost = axisMax(Math.max(0, ...daily.map(({ costUsd }) => costUsd)));
  const points = daily.map((day, index) => ({
    ...day,
    x: left + cellWidth * (index + 0.5),
    tokenY: bottom - (day.totalTokens / maxTokens) * height,
    costY: bottom - (day.costUsd / maxCost) * height,
  }));
  const selected = points.find(({ date }) => date === selectedDate) ?? points.at(-1);

  return (
    <svg
      className="usage-chart-svg"
      viewBox="0 0 1100 282"
      role="group"
      aria-label="Daily token and cost usage"
      aria-describedby="usage-chart-description"
    >
      <desc id="usage-chart-description">
        Cyan capsule bars use the right token axis. The amber line uses the left cost axis.
      </desc>

      {selected && (
        <>
          <rect
            className="usage-selected-lane"
            x={selected.x - cellWidth / 2}
            y={top}
            width={cellWidth}
            height={height}
          />
          <line
            className="usage-selected-line"
            x1={selected.x}
            x2={selected.x}
            y1={top}
            y2={bottom}
          />
        </>
      )}

      {[0, 1, 2, 3, 4].map((tick) => {
        const y = bottom - (height * tick) / 4;
        const cost = (maxCost * tick) / 4;
        const tokens = (maxTokens * tick) / 4;
        return (
          <g key={tick}>
            <line className="usage-grid-line" x1={left} x2={right} y1={y} y2={y} />
            <text className="usage-axis-label" x={left - 10} y={y + 3} textAnchor="end">
              {axisCost(cost, maxCost)}
            </text>
            <text className="usage-axis-label" x={right + 10} y={y + 3}>
              {compact(tokens)}
            </text>
          </g>
        );
      })}

      <line className="usage-axis-line" x1={left} x2={left} y1={top} y2={bottom} />
      <line className="usage-axis-line" x1={right} x2={right} y1={top} y2={bottom} />
      <text className="usage-axis-title usage-axis-title--cost" x={34} y={15}>COST</text>
      <text className="usage-axis-title usage-axis-title--tokens" x={1038} y={15}>TOKENS</text>

      <path className="usage-cost-line" d={smoothPath(points.map(({ x, costY }) => ({ x, y: costY })))} />

      {points.map((point, index) => {
        const barHeight = point.totalTokens > 0 ? Math.max(3, bottom - point.tokenY) : 0;
        const showLabel = daily.length <= 7
          || index === 0
          || index === daily.length - 1
          || index % 3 === 0;
        const selectedPoint = point.date === selectedDate;
        const tooltip = getAnchoredUsageTooltipPosition(point.x, bottom - barHeight);
        return (
          <g
            key={point.date}
            className={selectedPoint
              ? "usage-chart-day usage-chart-day--selected"
              : "usage-chart-day"}
            role="button"
            tabIndex={0}
            aria-label={`${dateLabel(point.date)}: Cost ${formatCostUsd(point.costUsd)}, Tokens ${formatTokenCount(point.totalTokens)}`}
            aria-pressed={selectedPoint}
            onClick={() => onSelectDate(point.date)}
            onPointerMove={(event) => {
              const svg = event.currentTarget.ownerSVGElement;
              const matrix = svg?.getScreenCTM();
              if (!svg || !matrix) return;

              const cursor = svg.createSVGPoint();
              cursor.x = event.clientX;
              cursor.y = event.clientY;
              const pointer = cursor.matrixTransform(matrix.inverse());
              const position = getUsageTooltipPosition(pointer.x, pointer.y);
              event.currentTarget.querySelector(".usage-chart-tooltip")?.setAttribute(
                 "transform",
                `translate(${position.x - tooltip.x} ${position.y - tooltip.y})`,
              );
            }}
            onPointerLeave={(event) => {
              event.currentTarget.querySelector(".usage-chart-tooltip")?.removeAttribute("transform");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectDate(point.date);
              }
            }}
          >
            <rect
              className="usage-chart-hit"
              x={left + cellWidth * index}
              y={top}
              width={cellWidth}
              height={height + 28}
            />
            <rect
              className={selectedPoint
                ? "usage-token-bar usage-token-bar--selected"
                : "usage-token-bar"}
              x={point.x - barWidth / 2}
              y={bottom - barHeight}
              width={barWidth}
              height={barHeight}
              rx={barWidth / 2}
            />
            {point.totalTokens > 0 && (
              <circle className="usage-token-core" cx={point.x} cy={bottom - barHeight} r={3} />
            )}
            {showLabel && (
              <text className="usage-x-label" x={point.x} y={254} textAnchor="middle">
                {point.date.slice(8)}
              </text>
            )}
            <circle
              className={selectedPoint
                ? "usage-cost-node usage-cost-node--selected"
                : "usage-cost-node"}
              cx={point.x}
              cy={point.costY}
              r={selectedPoint ? 6 : 3.5}
            />
            <g
              className={selectedPoint
                ? "usage-chart-tooltip usage-chart-tooltip--selected"
                : "usage-chart-tooltip"}
              aria-hidden="true"
            >
              <rect x={tooltip.x} y={tooltip.y} width={TOOLTIP_WIDTH} height={TOOLTIP_HEIGHT} rx={4} />
              <text className="usage-tooltip-title" x={tooltip.x + 10} y={tooltip.y + 16}>
                {dateLabel(point.date)}
              </text>
              <text className="usage-tooltip-cost" x={tooltip.x + 10} y={tooltip.y + 31}>
                {`Cost ${formatCostUsd(point.costUsd)}`}
              </text>
              <text className="usage-tooltip-tokens" x={tooltip.x + 10} y={tooltip.y + 44}>
                {`Tokens ${formatTokenCount(point.totalTokens)}`}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export function UsageHistoryPanel({
  data,
  days,
  loading = false,
  refreshing = false,
  error = null,
  nextDisabled = false,
  onClose,
  onDaysChange,
  onMovePeriod,
  onSelectDate,
}) {
  const visibleData = loading || error ? null : data;
  const daily = visibleData?.daily ?? [];
  const sessions = [...(visibleData?.sessions ?? [])].sort(
    (a, b) => b.totalTokens - a.totalTokens || a.sessionId.localeCompare(b.sessionId),
  );
  const periodTokens = daily.reduce((sum, day) => sum + day.totalTokens, 0);
  const periodCost = daily.reduce((sum, day) => sum + day.costUsd, 0);
  const selected = daily.find(({ date }) => date === visibleData?.selectedDate);
  const topTokens = sessions[0]?.totalTokens ?? 0;

  return (
    <section className="usage-history" aria-labelledby="usage-history-title" aria-busy={loading || refreshing}>
      <header className="usage-history-header detail-heading">
        <div className="usage-history-heading">
          <div>
            <h2 id="usage-history-title">Usage history</h2>
            <p>Past token and cost usage</p>
          </div>
        </div>
        <div className="usage-history-actions">
          <div className="usage-history-controls">
            <div className="usage-range-group" aria-label="Usage period">
              {[7, 30].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={days === value ? "usage-range usage-range--active" : "usage-range"}
                  aria-pressed={days === value}
                  onClick={() => onDaysChange(value)}
                >
                  {value}D
                </button>
              ))}
            </div>
            <button
              type="button"
              className="usage-period-button"
              aria-label="Previous period"
              onClick={() => onMovePeriod(-1)}
            >
              <CaretLeft size={14} />
            </button>
            <time className="usage-period-label">
              {visibleData ? periodLabel(visibleData.startDate, visibleData.endDate) : "—"}
            </time>
            <button
              type="button"
              className="usage-period-button"
              aria-label="Next period"
              disabled={nextDisabled}
              onClick={() => onMovePeriod(1)}
            >
              <CaretRight size={14} />
            </button>
          </div>
          <span className="detail-meta usage-history-close-meta">
            <button
              type="button"
              className="detail-close"
              aria-label="Close usage history"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </span>
        </div>
      </header>

      <div className="usage-history-summary">
        <div>
          <span>Period cost</span>
          <strong className="usage-summary-cost">
            <AnimatedUsageValue
              value={periodCost}
              format={formatCostUsd}
              className="usage-summary-value"
            />
          </strong>
        </div>
        <div>
          <span>Period tokens</span>
          <strong className="usage-summary-tokens">
            <AnimatedUsageValue
              value={periodTokens}
              format={formatTokenCount}
              className="usage-summary-value"
            />
          </strong>
        </div>
        <div>
          <span>Selected day</span>
          <strong>{visibleData?.selectedDate ? dateLabel(visibleData.selectedDate) : "—"}</strong>
        </div>
      </div>

      <section className="usage-chart-section" aria-labelledby="daily-usage-title">
        <header className="usage-chart-header">
          <span id="daily-usage-title">
            <i><ChartLine size={12} /></i>
            Daily usage
            <b>KST</b>
          </span>
          <span className="usage-chart-legend">
            <span><i className="usage-legend-cost" />Cost · left</span>
            <span><i className="usage-legend-tokens" />Tokens · right</span>
          </span>
        </header>
        <div className="usage-chart-body">
          {loading && !visibleData && (
            <p className="usage-history-state"><CircleNotch size={16} /> Loading usage history</p>
          )}
          {error && !visibleData && <p className="usage-history-state usage-history-state--error">{error}</p>}
          {visibleData && (
            <Chart
              daily={daily}
              selectedDate={visibleData.selectedDate}
              onSelectDate={onSelectDate}
            />
          )}
        </div>
      </section>

      <section className="usage-session-section" aria-labelledby="usage-sessions-title">
        <header className="usage-session-header">
          <div>
            <h2 id="usage-sessions-title">Sessions by token use</h2>
            <span>{selected ? (
              <>
                <AnimatedUsageValue
                  value={selected.totalTokens}
                  format={formatTokenCount}
                  className="usage-summary-value"
                />
                {` on ${dateLabel(selected.date)}`}
              </>
            ) : "—"}</span>
          </div>
          {refreshing && <span className="usage-refreshing"><CircleNotch size={12} /> Updating</span>}
        </header>
        <div className="usage-session-columns" aria-hidden="true">
          <span>Project</span><span>Session</span><span>Usage</span><span>Tokens</span><span>Cost</span>
        </div>
        <div className="usage-session-list">
          {sessions.map((session) => (
            <div className="usage-session-row" key={session.sessionId}>
              <strong>{session.projectName}</strong>
              <span>{session.sessionName}</span>
              <span className="usage-session-meter" style={{
                "--usage-ratio": `${topTokens ? (session.totalTokens / topTokens) * 100 : 0}%`,
              }}><i /></span>
              <code>{formatTokenCount(session.totalTokens)}</code>
              <em>{formatCostUsd(session.costUsd)}</em>
            </div>
          ))}
          {visibleData && !sessions.length && (
            <p className="usage-session-empty">No sessions used tokens on this day</p>
          )}
        </div>
      </section>
    </section>
  );
}

export function UsageHistory({ usage, onClose }) {
  const today = todayKey();
  const titleRef = useRef(null);
  const [days, setDays] = useState(30);
  const [endDate, setEndDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const latestUsageCollection = useRef(usage?.collectedAt);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    requestUsageHistory(days, endDate, selectedDate, controller.signal)
      .then(setData)
      .catch((reason) => {
        if (reason.name !== "AbortError") setError("Usage history unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, endDate, selectedDate]);

  useEffect(() => {
    const collectedAt = usage?.collectedAt;
    if (!collectedAt || latestUsageCollection.current === collectedAt) return undefined;
    latestUsageCollection.current = collectedAt;
    if (!data || endDate !== today || selectedDate !== today) return undefined;

    const controller = new AbortController();
    setRefreshing(true);
    requestUsageHistory(days, endDate, selectedDate, controller.signal)
      .then(setData)
      .catch(() => {})
      .finally(() => setRefreshing(false));
    return () => controller.abort();
  }, [data, days, endDate, selectedDate, today, usage?.collectedAt]);

  const visibleData = applyLiveUsageToHistory(data, today, usage);

  const movePeriod = (direction) => {
    const nextEnd = direction > 0
      ? [shiftDateKey(endDate, days), today].sort()[0]
      : shiftDateKey(endDate, -days);
    setLoading(true);
    setEndDate(nextEnd);
    setSelectedDate(nextEnd);
  };

  return (
    <div className="usage-history-focus" ref={titleRef} tabIndex={-1}>
      <UsageHistoryPanel
        data={visibleData}
        days={days}
        loading={loading}
        refreshing={refreshing}
        error={error}
        nextDisabled={endDate >= today}
        onClose={onClose}
        onDaysChange={(value) => {
          if (value === days) return;
          setLoading(true);
          setDays(value);
          setSelectedDate(endDate);
        }}
        onMovePeriod={movePeriod}
        onSelectDate={(value) => {
          if (value === selectedDate) return;
          setLoading(true);
          setSelectedDate(value);
        }}
      />
    </div>
  );
}
