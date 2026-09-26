"use client";

import { useEffect, useRef, useState } from "react";

const HEIGHT = 230;
const MARGIN = { top: 14, right: 44, bottom: 26, left: 34 };
const SERIES = [
  { key: "persist", label: "If you keep going", color: "var(--series-persist)" },
  { key: "shipped", label: "Counting the odds you quit", color: "var(--series-shipped)" }
];

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const percent = (value) => `${Math.round(value * 100)}%`;

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(520);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// Month ticks along a weekly axis, thinned so labels never collide.
function monthTicks(curve, x) {
  const ticks = [];
  let lastMonth = null;
  curve.forEach((point) => {
    const date = new Date(`${point.date}T00:00:00Z`);
    const month = date.getUTCMonth();
    if (month !== lastMonth) {
      ticks.push({ x: x(point.week), label: monthFormat.format(date) });
      lastMonth = month;
    }
  });
  const minGap = 34;
  return ticks.filter((tick, index) => index === 0 || tick.x - ticks[index - 1].x >= minGap).slice(1);
}

export default function SurvivalChart({ curve, deadline }) {
  const [containerRef, width] = useWidth();
  const [hoverIndex, setHoverIndex] = useState(null);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const lastWeek = curve[curve.length - 1].week || 1;
  const x = (week) => MARGIN.left + (week / lastWeek) * plotWidth;
  const y = (value) => MARGIN.top + (1 - value) * plotHeight;
  const path = (key) => curve.map((point, index) => `${index ? "L" : "M"}${x(point.week).toFixed(1)},${y(point[key]).toFixed(1)}`).join("");
  const area = `${path("shipped")}L${x(lastWeek)},${y(0)}L${x(0)},${y(0)}Z`;
  const end = curve[curve.length - 1];
  const deadlineX = deadline && deadline.weeks <= lastWeek ? x(deadline.weeks) : null;
  const hovered = hoverIndex === null ? null : curve[hoverIndex];

  // Keep the two end labels apart when the curves finish close together.
  let persistLabelY = y(end.persist);
  let shippedLabelY = y(end.shipped);
  if (shippedLabelY - persistLabelY < 13) shippedLabelY = persistLabelY + 13;

  function track(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const week = ((event.clientX - bounds.left - MARGIN.left) / plotWidth) * lastWeek;
    setHoverIndex(Math.min(curve.length - 1, Math.max(0, Math.round(week))));
  }

  function keyTrack(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    setHoverIndex((current) => Math.min(curve.length - 1, Math.max(0, (current ?? 0) + step)));
  }

  return (
    <figure className="survival">
      <div className="survival-legend">
        {SERIES.map((series) => (
          <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>
        ))}
      </div>
      <div className="survival-plot" ref={containerRef}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Chance of shipping over time. If you keep going, ${percent(end.persist)} by ${dayFormat.format(new Date(`${end.date}T00:00:00Z`))}; counting the odds you quit, ${percent(end.shipped)}.`}
          tabIndex={0}
          onPointerMove={track}
          onPointerLeave={() => setHoverIndex(null)}
          onKeyDown={keyTrack}
          onBlur={() => setHoverIndex(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line className="grid" x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} />
              <text className="axis" x={MARGIN.left - 7} y={y(tick) + 3} textAnchor="end">{percent(tick)}</text>
            </g>
          ))}
          {monthTicks(curve, x).map((tick) => (
            <text key={tick.x} className="axis" x={tick.x} y={HEIGHT - 8} textAnchor="middle">{tick.label}</text>
          ))}
          {deadlineX !== null && (
            <g>
              <line className="deadline" x1={deadlineX} x2={deadlineX} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
              <text className="axis deadline-label" x={deadlineX - 5} y={MARGIN.top + plotHeight - 6} textAnchor="end">Deadline</text>
            </g>
          )}
          <path d={area} fill="var(--series-shipped)" opacity="0.1" />
          <path d={path("persist")} fill="none" stroke="var(--series-persist)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={path("shipped")} fill="none" stroke="var(--series-shipped)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={x(end.week)} cy={y(end.persist)} r="4" fill="var(--series-persist)" stroke="var(--ink)" strokeWidth="2" />
          <circle cx={x(end.week)} cy={y(end.shipped)} r="4" fill="var(--series-shipped)" stroke="var(--ink)" strokeWidth="2" />
          <text className="end-label" x={x(end.week) + 8} y={persistLabelY + 4}>{percent(end.persist)}</text>
          <text className="end-label" x={x(end.week) + 8} y={shippedLabelY + 4}>{percent(end.shipped)}</text>
          {hovered && (
            <g>
              <line className="crosshair" x1={x(hovered.week)} x2={x(hovered.week)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
              <circle cx={x(hovered.week)} cy={y(hovered.persist)} r="4" fill="var(--series-persist)" stroke="var(--ink)" strokeWidth="2" />
              <circle cx={x(hovered.week)} cy={y(hovered.shipped)} r="4" fill="var(--series-shipped)" stroke="var(--ink)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hovered && (
          <div
            className="survival-tooltip"
            style={{ left: Math.min(width - 170, Math.max(0, x(hovered.week) + 10)), top: MARGIN.top }}
          >
            <div className="tooltip-date">{dayFormat.format(new Date(`${hovered.date}T00:00:00Z`))} · week {hovered.week}</div>
            {SERIES.map((series) => (
              <div key={series.key} className="tooltip-row">
                <i style={{ background: series.color }} />
                <strong>{percent(hovered[series.key])}</strong>
                <span>{series.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="survival-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Week</th><th>Date</th><th>If you keep going</th><th>Counting quitting</th></tr></thead>
          <tbody>
            {curve.map((point) => (
              <tr key={point.week}><td>{point.week}</td><td>{point.date}</td><td>{percent(point.persist)}</td><td>{percent(point.shipped)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
