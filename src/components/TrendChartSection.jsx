import React from "react";
import "./TrendChartSection.css";

const BMI_CATEGORIES = [
  { key: "Normal", label: "Normal", color: "#10b981" },
  { key: "Wasted", label: "Wasted", color: "#f59e0b" },
  { key: "Severely Wasted", label: "Severely Wasted", color: "#ef4444" },
  { key: "Overweight", label: "Overweight", color: "#6366f1" },
  { key: "Obese", label: "Obese", color: "#b91c1c" },
];

const HFA_CATEGORIES = [
  { key: "Normal Height", label: "Normal Height", color: "#10b981" },
  { key: "Stunted", label: "Stunted", color: "#f59e0b" },
  { key: "Severely Stunted", label: "Severely Stunted", color: "#ef4444" },
  { key: "Tall", label: "Tall", color: "#3b82f6" },
];

function PeriodBarChart({ data, categories }) {
  const values = categories.map((item) => Number(data?.[item.key]) || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 1);
  if (!total) return <div className="trend-no-data">No data recorded</div>;
  return (
    <div className="trend-bars">
      {categories.map((item, index) => (
        <div className="trend-bar-item" key={item.key}>
          <div className="trend-bar-value" style={{ animationDelay: `${index * 90 + 250}ms` }}>{values[index]}</div>
          <div className="trend-bar-track">
            <div className="trend-bar-fill" style={{ height: `${Math.max((values[index] / max) * 100, values[index] ? 4 : 0)}%`, background: item.color, animationDelay: `${index * 90}ms` }} />
          </div>
          <div className="trend-bar-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function StackedPeriodChart({ periods, categories }) {
  return (
    <div className="trend-stacked-chart">
      {periods.map((data, periodIndex) => {
        const total = categories.reduce((sum, item) => sum + (Number(data?.[item.key]) || 0), 0);
        return (
          <div className="trend-stacked-period" key={data?.period || periodIndex}>
            <div className="trend-stacked-bar">
              {total ? categories.map((item, categoryIndex) => {
                const value = Number(data?.[item.key]) || 0;
                return value ? <div key={item.key} title={`${item.label}: ${value} (${((value / total) * 100).toFixed(1)}%)`} style={{ width: `${(value / total) * 100}%`, background: item.color, animationDelay: `${periodIndex * 140 + categoryIndex * 60}ms` }} /> : null;
              }) : <span>No data</span>}
            </div>
            <strong>{data?.period || ["Baseline", "Midline", "Endline"][periodIndex]}</strong>
            <small>{total ? `${total.toLocaleString()} learners` : "No measurements"}</small>
          </div>
        );
      })}
    </div>
  );
}

export default function TrendChartSection({ timelineData, hfaTimelineData, onOpen, school, schoolYear }) {
  const sections = [
    { title: "Nutritional Status Distribution", categories: BMI_CATEGORIES, data: timelineData },
    { title: "Height-for-Age (HFA) Distribution", categories: HFA_CATEGORIES, data: hfaTimelineData },
  ];
  return sections.map((section) => (
    <div className="trend-section" key={section.title}>
      <h4>{section.title}</h4>
      <div className="trend-chart-grid">
        {section.data.map((period) => (
          <button type="button" className="trend-chart-card" key={period.period} onClick={() => onOpen({ title: `${period.period} — ${section.title}`, subtitle: `${school} (${schoolYear})`, content: <PeriodBarChart data={period} categories={section.categories} /> })}>
            <span>{period.period}</span>
            <PeriodBarChart data={period} categories={section.categories} />
          </button>
        ))}
        <button type="button" className="trend-chart-card trend-combined-card" onClick={() => onOpen({ title: `Period Comparison — ${section.title}`, subtitle: `${school} (${schoolYear})`, content: <StackedPeriodChart periods={section.data} categories={section.categories} /> })}>
          <span>Period Comparison (%)</span>
          <div className="trend-legend">{section.categories.map((item) => <i key={item.key} style={{ color: item.color }}>● {item.label}</i>)}</div>
          <StackedPeriodChart periods={section.data} categories={section.categories} />
        </button>
      </div>
    </div>
  ));
}
