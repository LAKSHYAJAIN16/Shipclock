const scopeData = {
  small: { weeks: 1.5, effort: "1–2 weeks", note: "Leave room for a final polish pass" },
  medium: { weeks: 5, effort: "5 weeks", note: "Keep a discovery week open" },
  large: { weeks: 12, effort: "12 weeks", note: "Break this into smaller milestones" }
};

const teamMultiplier = { solo: 1.35, small: 1, larger: 0.82 };
const riskBuffer = { low: 0.1, medium: 0.2, high: 0.35 };
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "2-digit", year: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

const form = document.querySelector("#estimate-form");
const startInput = document.querySelector("#start-date");
const projectName = document.querySelector("#project-name");
const copyButton = document.querySelector("#copy-button");
const copyStatus = document.querySelector("#copy-status");

function dateAtMidnight(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + Math.round(days));
  return result;
}

function formatDate(date, formatter = dateFormatter) {
  return formatter.format(date);
}

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function updateSelectedCards() {
  document.querySelectorAll(".choice-card").forEach((card) => {
    card.classList.toggle("is-selected", card.querySelector("input").checked);
  });
}

function calculateEstimate(event) {
  if (event) event.preventDefault();

  const scope = scopeData[selectedValue("scope")];
  const team = selectedValue("team");
  const risk = document.querySelector("#risk").value;
  const start = dateAtMidnight(startInput.value);
  const baseWeeks = scope.weeks * teamMultiplier[team];
  const buffer = riskBuffer[risk];
  const totalDays = baseWeeks * 7 * (1 + buffer);
  const shipDate = addDays(start, totalDays);
  const rangePadding = Math.max(4, Math.round(totalDays * 0.22));
  const lowerDate = addDays(shipDate, -rangePadding);
  const upperDate = addDays(shipDate, rangePadding);
  const confidenceLabel = risk === "low" ? "High confidence" : risk === "high" ? "Low confidence" : "Medium confidence";
  const confidenceColor = risk === "low" ? "high" : risk === "high" ? "low" : "medium";

  document.querySelector("#ship-date").textContent = formatDate(shipDate);
  document.querySelector("#range-text").textContent = `${formatDate(lowerDate, shortDateFormatter)} – ${formatDate(upperDate, shortDateFormatter)}`;
  document.querySelector("#start-label").textContent = formatDate(start, shortDateFormatter);
  document.querySelector("#duration-label").textContent = `${Math.round(totalDays / 7)} weeks`;
  document.querySelector("#effort-label").textContent = `${Math.round(totalDays / 7)} weeks`;
  document.querySelector("#buffer-label").textContent = `${Math.round(buffer * 100)}%`;
  document.querySelector("#note-label").textContent = scope.note;
  document.querySelector("#confidence-label").textContent = confidenceLabel;
  document.querySelector(".confidence").dataset.level = confidenceColor;
  copyStatus.textContent = "";
}

document.querySelectorAll('input[name="scope"], input[name="team"]').forEach((input) => {
  input.addEventListener("change", updateSelectedCards);
});

form.addEventListener("submit", calculateEstimate);

copyButton.addEventListener("click", async () => {
  const title = projectName.value.trim() || "Project";
  const forecast = `${title}: likely ship date ${document.querySelector("#ship-date").textContent} (${document.querySelector("#range-text").textContent}).`;
  try {
    await navigator.clipboard.writeText(forecast);
    copyStatus.textContent = "Forecast copied to clipboard";
  } catch {
    copyStatus.textContent = "Select the forecast text to copy it";
  }
});

startInput.value = new Date().toISOString().slice(0, 10);
updateSelectedCards();
calculateEstimate();
