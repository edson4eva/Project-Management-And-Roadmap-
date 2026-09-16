const DAY = 86400000;
const AS_OF_DATE = new Date("2025-09-10T12:00:00");
const AS_OF_ISO = "2025-09-10";
// Bumped when the seed portfolio changes shape, so a browser holding the previous
// seed picks up the new one instead of silently keeping stale projects.
const STORAGE = { projects: "pb-projects-v2", teams: "pb-teams-v2", roadmap: "pb-roadmap-v2", collapsed: "pb-collapsed-units-v1", labelWidth: "pb-timeline-label-width-v1", viewport: "pb-timeline-viewport-v1", scoreModel: "pb-score-model-v1", ideas: "pb-ideas-v1", feedback: "pb-feedback-v1", releases: "pb-releases-v1", views: "pb-saved-views-v1", fields: "pb-custom-fields-v1", notes: "pb-project-notes-v1", history: "pb-project-history-v1", specs: "pb-project-specs-v1", taxonomy: "pb-taxonomy-v1" };
// ---------------------------------------------------------------------------
// Strategy alignment, dependencies and prioritization.
// Every figure below is computed from the project records - a project's goal
// links, its declared predecessors, and the scoring numbers a user typed in.
// Nothing here carries data of its own, and nothing is seeded.
// ---------------------------------------------------------------------------
const SCORE_MODELS = {
  "value-effort": {
    label: "Value vs effort",
    hint: "Value divided by effort. A higher score is more return for the work.",
    decimals: 2,
    fields: [
      { key: "value", label: "Value", min: 1, max: 5, step: 1, help: "1 low - 5 high" },
      { key: "effort", label: "Effort", min: 1, max: 5, step: 1, help: "1 small - 5 large" }
    ],
    score: scoring => (scoring.value && scoring.effort ? scoring.value / scoring.effort : null)
  },
  rice: {
    label: "RICE",
    hint: "Reach x Impact x Confidence / Effort - the standard RICE formula.",
    decimals: 1,
    fields: [
      { key: "reach", label: "Reach", min: 0, max: null, step: 1, help: "people affected per quarter" },
      { key: "impact", label: "Impact", min: 0, max: 3, step: 0.25, help: "0.25 minimal - 3 massive" },
      { key: "confidence", label: "Confidence", min: 0, max: 100, step: 5, help: "% certainty in the numbers" },
      { key: "effort", label: "Effort", min: 0, max: null, step: 0.5, help: "person-months" }
    ],
    score: scoring => (scoring.reach && scoring.impact && scoring.confidence && scoring.effort
      ? scoring.reach * scoring.impact * (scoring.confidence / 100) / scoring.effort
      : null)
  },
  weighted: {
    label: "Weighted scoring",
    hint: "(Value x4 + Urgency x3 + Strategic fit x3) / 10, divided by effort.",
    decimals: 2,
    fields: [
      { key: "value", label: "Value", min: 1, max: 5, step: 1, help: "1 low - 5 high" },
      { key: "urgency", label: "Urgency", min: 1, max: 5, step: 1, help: "1 can wait - 5 now" },
      { key: "fit", label: "Strategic fit", min: 1, max: 5, step: 1, help: "1 peripheral - 5 core" },
      { key: "effort", label: "Effort", min: 1, max: 5, step: 1, help: "1 small - 5 large" }
    ],
    score: scoring => (scoring.value && scoring.urgency && scoring.fit && scoring.effort
      ? (scoring.value * 4 + scoring.urgency * 3 + scoring.fit * 3) / 10 / scoring.effort
      : null)
  }
};
const SCORE_FIELD_KEYS = [...new Set(Object.values(SCORE_MODELS).flatMap(model => model.fields.map(field => field.key)))];
const DEFAULT_SCORE_MODEL = "value-effort";

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadScoreModel() {
  const saved = localStorage.getItem(STORAGE.scoreModel);
  return SCORE_MODELS[saved] ? saved : DEFAULT_SCORE_MODEL;
}

function saveScoreModel() {
  localStorage.setItem(STORAGE.scoreModel, scoreModel);
  pushRecords("settings", { scoreModel, taxonomy: customTaxonomy }, "the prioritization model");
}

// Adds the alignment fields to a stored project without inventing values:
// an unlinked, unscored project stays unlinked and unscored.
function normalizeProjectAlignment(project) {
  const scoring = project.scoring && typeof project.scoring === "object" ? project.scoring : {};
  project.goalIds = Array.isArray(project.goalIds) ? [...new Set(project.goalIds.map(Number).filter(Number.isFinite))] : [];
  project.dependsOn = Array.isArray(project.dependsOn) ? [...new Set(project.dependsOn.map(Number).filter(Number.isFinite))] : [];
  project.scoring = Object.fromEntries(SCORE_FIELD_KEYS.map(key => [key, numberOrNull(scoring[key])]));
  project.releaseId = numberOrNull(project.releaseId);
  project.custom = project.custom && typeof project.custom === "object" ? project.custom : {};
  // A category is kept whether or not it is in the known list. Validating it
  // away was silent data loss: a workspace's own category would vanish if the
  // project record happened to load before the list did. Anything unrecognised
  // still groups and still saves; it simply is not offered to others until it
  // is added to the list.
  project.subCategory = typeof project.subCategory === "string" ? project.subCategory.trim().slice(0, 60) : "";
  return project;
}

function activeScoreModel() {
  return SCORE_MODELS[scoreModel] || SCORE_MODELS[DEFAULT_SCORE_MODEL];
}

function projectScore(project, model = activeScoreModel()) {
  const raw = model.score(project.scoring || {});
  return raw === null || !Number.isFinite(raw) ? null : Number(raw.toFixed(model.decimals));
}

function isScored(project) {
  return projectScore(project) !== null;
}

// Only models carrying both a value and an effort can place work on the
// classic two-by-two; RICE has no value axis, so it returns nothing.
function scoreQuadrant(project) {
  const value = project.scoring?.value;
  const effort = project.scoring?.effort;
  if (!value || !effort) return null;
  const highValue = value >= 4;
  const highEffort = effort >= 4;
  if (highValue && !highEffort) return { key: "quick-win", label: "Quick win" };
  if (highValue && highEffort) return { key: "big-bet", label: "Big bet" };
  if (!highValue && !highEffort) return { key: "fill-in", label: "Fill-in" };
  return { key: "costly", label: "High cost, low value" };
}

function rankedByScore(list) {
  return list
    .filter(isScored)
    .slice()
    .sort((first, second) => projectScore(second) - projectScore(first) || first.name.localeCompare(second.name));
}

function goalInitiatives(goalId, list = projects) {
  return list.filter(project => project.goalIds.includes(Number(goalId)));
}

function goalsForProject(project) {
  return (roadmapStrategy.goals || []).filter(goal => project.goalIds.includes(goal.id));
}

function predecessorsOf(project, list = projects) {
  return project.dependsOn.map(id => list.find(item => item.id === id)).filter(Boolean);
}

function dependentsOf(project, list = projects) {
  return list.filter(item => item.dependsOn.includes(project.id));
}

// A link is in conflict when the predecessor is still running after the
// dependent is due to start. Both dates come from the project records.
function dependencyLinks(list = projects) {
  const byId = new Map(list.map(project => [project.id, project]));
  const links = [];
  list.forEach(project => project.dependsOn.forEach(id => {
    const predecessor = byId.get(id);
    if (!predecessor) return;
    const overlap = Math.ceil((new Date(`${predecessor.end}T12:00:00`) - new Date(`${project.start}T12:00:00`)) / DAY);
    links.push({ predecessor, dependent: project, conflict: overlap > 0, days: Math.max(0, overlap) });
  }));
  return links;
}

function wouldCreateCycle(projectId, dependsOn, list = projects) {
  const edges = new Map(list.map(project => [project.id, project.id === projectId ? dependsOn : project.dependsOn]));
  edges.set(projectId, dependsOn);
  const visit = (id, seen) => {
    if (id === projectId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (edges.get(id) || []).some(next => visit(next, seen));
  };
  return dependsOn.some(id => visit(id, new Set()));
}

const AS_OF_LONG = "September 10, 2025";
const AUTH_STORAGE_KEY = "platforms-branch-session";
// The workspace password, matching the server's default so one password works
// whether or not a server is reachable. Eight characters is the server's
// minimum, so the same value is valid for a real account.
const DEFAULT_PASSWORD = "12345678";
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const colors = ["teal", "coral", "amber", "blue"];
const teamRoleFields = [
  ["productOwner", "Product Owner"], ["solutionSponsor", "Solution Sponsor"],
  ["developer", "Developer"], ["architect", "Architect"], ["devLead", "Dev Lead"],
  ["scrumMaster", "Scrum Master"], ["projectManager", "Project Manager"], ["businessAnalyst", "Business Analyst"],
  ["frontEndDesigner", "Front End Designer"], ["serviceDesigner", "Service Designer"], ["qa", "QA"]
];
const resourceRoles = ["Product Owner", "Scrum Master", "Project Manager", "Developer", "Architect", "Service Designer", "Front End Designer", "QA", "Business Analyst"];
const projectUnits = ["Unified Identity and Access Management", "Alberta Wallet and Credentials", "Alberta Payments", "CRA Income and Data Verification Services", "Web Services", "Platforms Operations"];
// Units that have been renamed, so stored projects follow the rename.
// Optional second level under a unit. A unit with no entry has no sub-categories.
// Two grouping levels below the unit, as the roadmap deck itself is organised:
// a CATEGORY (its own page in the deck) and a SUB-CATEGORY (a labelled row on
// that page). The category level is stored under the long-standing key
// "subUnit", so no existing record needs migrating; everything user-facing
// calls it Category.
const unitSubCategories = {
  "Unified Identity and Access Management": ["UIAM - Verification", "Strategy and Operations", "Alberta.ca Account Features", "Unified Messaging Service"],
  "Alberta Wallet and Credentials": ["Alberta Wallet"],
  "CRA Income and Data Verification Services": ["Income Verification Service"],
  "Alberta Payments": ["eServices", "Common Payment Platform (CPP) and Common Payment Services (CPS)"],
  "Web Services": ["Learning Management System"],  // the deck's LMS section, slides 35 to 39
  "Platforms Operations": ["Privacy Portal"]
};

// ---------------------------------------------------------------------------
// Units and categories a workspace adds for itself.
//
// The taxonomy that came from the roadmap deck is fixed in code, because it is
// a transcription of the deck. Anything a workspace needs beyond it is kept
// here instead of being hard-coded, so the dropdowns can grow without a code
// change - and so a name someone typed is never silently dropped.
//
// Keyed exactly as the declared lists are: units by branch unit, categories by
// "branch unit::unit", so the same label under a different parent stays
// separate.
// ---------------------------------------------------------------------------
function loadCustomTaxonomy() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.taxonomy));
    return normalizeTaxonomy(saved);
  } catch {
    return { units: {}, categories: {} };
  }
}

function normalizeTaxonomy(saved) {
  // Only strings are names. Anything else is dropped rather than coerced -
  // String(null) is the truthy "null", which would otherwise become a unit.
  const dedupe = list => {
    const seen = new Set();
    return list.filter(name => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const clean = source => Object.fromEntries(Object.entries(source && typeof source === "object" && !Array.isArray(source) ? source : {})
    .map(([key, list]) => [key, dedupe((Array.isArray(list) ? list : [])
      .filter(name => typeof name === "string")
      .map(name => name.trim().slice(0, 60))
      .filter(Boolean))])
    .filter(([, list]) => list.length));
  return { units: clean(saved?.units), categories: clean(saved?.categories) };
}

function saveCustomTaxonomy() {
  localStorage.setItem(STORAGE.taxonomy, JSON.stringify(customTaxonomy));
  pushRecords("settings", { scoreModel, taxonomy: customTaxonomy }, "the unit and category lists");
}

// Declared first, then whatever this workspace added, so the deck's own order
// is preserved and additions appear after it.
function customUnitsFor(branchUnit) {
  return customTaxonomy.units[branchUnit] || [];
}

function customCategoriesFor(branchUnit, unit) {
  return customTaxonomy.categories[`${branchUnit}::${unit}`] || [];
}

function taxonomyNameTaken(existing, name) {
  return existing.some(item => item.toLowerCase() === name.trim().toLowerCase());
}

// Returns the reason it was refused, or "" when it was added. The caller shows
// the reason rather than the name disappearing without explanation.
function addCustomUnit(branchUnit, rawName) {
  const name = String(rawName || "").trim().slice(0, 60);
  if (!name) return "Give the unit a name.";
  if (!projectUnits.includes(branchUnit)) return "Choose a branch unit first.";
  if (taxonomyNameTaken(subCategoriesFor(branchUnit), name)) return `${branchUnit} already has a unit called "${name}".`;
  customTaxonomy.units[branchUnit] = [...customUnitsFor(branchUnit), name];
  saveCustomTaxonomy();
  return "";
}

function addCustomCategory(branchUnit, unit, rawName) {
  const name = String(rawName || "").trim().slice(0, 60);
  if (!name) return "Give the category a name.";
  if (!unit) return "Choose a unit first.";
  if (taxonomyNameTaken(subCategoryOptionsFor(branchUnit, unit), name)) return `${unit} already has a category called "${name}".`;
  const key = `${branchUnit}::${unit}`;
  customTaxonomy.categories[key] = [...customCategoriesFor(branchUnit, unit), name];
  saveCustomTaxonomy();
  return "";
}

// A name is only removable while nothing is filed under it, so removing one
// can never orphan a project.
function unitInUse(branchUnit, unit) {
  return projects.some(project => project.unit === branchUnit && project.subUnit === unit);
}

function categoryInUse(branchUnit, unit, category) {
  return projects.some(project => project.unit === branchUnit && project.subUnit === unit && project.subCategory === category);
}

function removeCustomUnit(branchUnit, unit) {
  if (unitInUse(branchUnit, unit)) return `Projects are still filed under "${unit}".`;
  customTaxonomy.units[branchUnit] = customUnitsFor(branchUnit).filter(name => name !== unit);
  delete customTaxonomy.categories[`${branchUnit}::${unit}`];
  saveCustomTaxonomy();
  return "";
}

function removeCustomCategory(branchUnit, unit, category) {
  if (categoryInUse(branchUnit, unit, category)) return `Projects are still filed under "${category}".`;
  const key = `${branchUnit}::${unit}`;
  customTaxonomy.categories[key] = customCategoriesFor(branchUnit, unit).filter(name => name !== category);
  saveCustomTaxonomy();
  return "";
}

function subCategoriesFor(unit) {
  return [...(unitSubCategories[unit] || []), ...customUnitsFor(unit)];
}

// Sub-categories belong to a unit AND a category, because the same label can
// appear under more than one category - "Service Integration" is a row on both
// the Verification and the Alberta.ca Account Features pages.
const categorySubCategories = {
  "Unified Identity and Access Management::UIAM - Verification": [
    "Sign-in / 2-Step Verification (Multifactor)",
    "Banking Verification",
    "Person Verification",
    "Organizations Verification"
  ],
  "Unified Identity and Access Management::Strategy and Operations": [
    "Office of the Auditor General (OAG) Response Plan",
    "IAM Unification",
    "Administration and Support"
  ],
  "Unified Identity and Access Management::Alberta.ca Account Features": [
    "Design Improvements",
    "Alberta.ca Account Branding",
    "Service Integration"
  ],
  // The eight labelled rows of the deck's Common Payments timelines, 28 and 29.
  "Alberta Payments::Common Payment Platform (CPP) and Common Payment Services (CPS)": [
    "Evacuation Payment System (EPS) - Transformation",
    "CPP - Public Portal",
    "CPP - Internal Portal",
    "CPP - Admin Portal",
    "CPS",
    "CPP and CPS - post MVP",
    "Emergency Benefit Payment System (EBS) - modernization",
    "Emergency Registration System (ERS) - modernization"
  ],
  // The three labelled rows of the deck's LMS timeline, slide 36.
  "Web Services::Learning Management System": [
    "Phase 1",
    "Phase 2 - PSES Migration",
    "Phase 2 - Justice and JET"
  ],
  // The five labelled rows of the deck's eServices timelines, slides 23 and 25.
  "Alberta Payments::eServices": [
    "Service Enhancements",
    "Payment Enhancements",
    "Integrations",
    "Security Improvements",
    "Administration and Reporting"
  ],
  // The three labelled rows of the deck's Alberta Wallet timeline, slide 20.
  "Alberta Wallet and Credentials::Alberta Wallet": [
    "Wallet",
    "Wallet & Credentials",
    "Account App"
  ]
};

function subCategoryOptionsFor(unit, category) {
  return [...(categorySubCategories[`${unit}::${category}`] || []), ...customCategoriesFor(unit, category)];
}

function hasSubCategories(unit, category) {
  return subCategoryOptionsFor(unit, category).length > 0;
}

// Categories renamed after they were first stored. Keyed by unit, so the same
// label under a different unit is left alone.
const legacyCategoryAliases = {
  "Unified Identity and Access Management": { Verification: "UIAM - Verification" }
};

const legacyUnitAliases = {
  "Alberta Mobile Wallet": "Alberta Wallet and Credentials",
  "Learning Management System": "Web Services::Learning Management System",
  "eServices": "Alberta Payments::eServices",
  "Unified Messaging Service": "Unified Identity and Access Management::Unified Messaging Service",
  "Privacy Portal": "Platforms Operations::Privacy Portal",
  "Platform Operations": "Platforms Operations",
  "Identity and Access Management": "Unified Identity and Access Management",
  "CRA Data Verification Service": "CRA Income and Data Verification Services",
  "Common Payments": "Alberta Payments"
};

const unitTeamAssignments = { "Unified Identity and Access Management": "Team 1", "Alberta Wallet and Credentials": "Team 5", "Alberta Payments": "Team 7", "CRA Income and Data Verification Services": "Team 8", "Web Services": "Team 9", "Platforms Operations": "Team 10" };
const projectTemplateColumns = ["Project Name", "Team", "Branch Unit", "Owner", "Objective", "Start Date", "Target Date", "Status", "Progress (%)", "Priority", "Risk Level", "Approx. Cost in dollars", "Schedule Variance (days)", "Contributors", "Milestone Name", "Milestone Date"];
const projectStatuses = ["Planned", "On track", "At risk", "Off track", "Completed", "In-flight", "Next", "Later", "Pause"];
const statusGroups = {
  healthy: ["On track", "In-flight"],
  attention: ["At risk", "Off track", "Pause"],
  upcoming: ["Planned", "Next", "Later"],
  done: ["Completed"]
};
const deliveryStatuses = [...statusGroups.healthy, ...statusGroups.attention];
const unitMixBands = [
  { key: "delivery", label: "In delivery", color: "var(--bar-delivery)", statuses: statusGroups.healthy },
  { key: "attention", label: "Needs attention", color: "var(--bar-attention)", statuses: statusGroups.attention },
  { key: "upcoming", label: "Upcoming", color: "var(--bar-upcoming)", statuses: statusGroups.upcoming },
  { key: "done", label: "Completed", color: "var(--bar-done)", statuses: statusGroups.done }
];
// The five statuses the roadmap deck uses take the deck's own colours, read
// out of its theme: Completed grey, In-flight green, Next amber, Later pink,
// Pause the theme's accent4 blue. The four statuses the deck does not carry
// keep the app's own palette.
const DECK_STATUS_COLORS = {
  Completed: "#B9B9B9",
  "In-flight": "#78BF26",
  Next: "#FFC836",
  Later: "#EF4B8B",
  Pause: "#5FCEEA"
};
const statusLegendColors = {
  "On track": "var(--green)", "At risk": "var(--amber)", "Off track": "var(--red)", "Planned": "var(--blue)",
  ...DECK_STATUS_COLORS
};

const seedProjects = [
  {"id": 1001, "name": "Release Candidate 1", "code": "RC1", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Release of functioning mobile application integrated with MyHealth Records to issue the mobile health card.", "status": "In-flight", "progress": 90, "start": "2025-01-01", "end": "2025-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1002, "name": "Mobile Health Card", "code": "MHC", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "In-flight", "progress": 90, "start": "2025-01-01", "end": "2025-05-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-05-31", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1003, "name": "mDL Planning and Governance", "code": "MPA", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "In-flight", "progress": 90, "start": "2025-02-01", "end": "2025-06-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-06-30", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1004, "name": "Application Discovery", "code": "AD", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "Next", "progress": 0, "start": "2025-04-01", "end": "2025-06-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-06-30", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1005, "name": "RC 2", "code": "R2", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "Next", "progress": 0, "start": "2025-05-01", "end": "2025-06-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-06-30", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1006, "name": "Credential Intake & Expansion", "code": "CI&", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "In-flight", "progress": 40, "start": "2025-05-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1007, "name": "Target Launch August 7", "code": "TLA", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "In-flight", "progress": 90, "start": "2025-05-01", "end": "2025-08-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-08-31", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1008, "name": "Application Features expansion", "code": "AFE", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Allow Albertans to store digital credentials in a cloud wallet and access them from a mobile application or their Alberta.ca Account.", "status": "Next", "progress": 0, "start": "2025-06-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1009, "name": "mDL Implementation", "code": "MI", "team": "Team 5", "unit": "Alberta Wallet and Credentials", "owner": "Chad Bostock", "objective": "Implementation of mDL into Mobile Wallet Credential Expansion : Implementation of other credentials into the Mobile Wallet with ministry partners – Potentially divers registration, teaching certif.", "status": "In-flight", "progress": 21, "start": "2025-07-01", "end": "2026-05-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-05-31", "memberNames": ["Chad Bostock", "Anh Lang"], "members": ["CB", "AL"]},
  {"id": 1010, "name": "Service Development for Student Aid", "code": "SDF", "team": "Team 8", "unit": "CRA Income and Data Verification Services", "owner": "Caleb Kwok", "objective": "Enterprise service letting GoA business programs verify demographic, income and dependent information from CRA data without exposing sensitive personal information.", "status": "In-flight", "progress": 87, "start": "2024-10-01", "end": "2025-10-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-10-31", "memberNames": ["Caleb Kwok", "Andrew Van Der Kley"], "members": ["CK", "AVD"]},
  {"id": 1011, "name": "Student Aid / CRA MOU", "code": "SA/", "team": "Team 8", "unit": "CRA Income and Data Verification Services", "owner": "Caleb Kwok", "objective": "Enterprise service letting GoA business programs verify demographic, income and dependent information from CRA data without exposing sensitive personal information.", "status": "In-flight", "progress": 78, "start": "2024-12-01", "end": "2025-11-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-11-30", "memberNames": ["Caleb Kwok", "Andrew Van Der Kley"], "members": ["CK", "AVD"]},
  {"id": 1012, "name": "On board new programs", "code": "OBN", "team": "Team 8", "unit": "CRA Income and Data Verification Services", "owner": "Caleb Kwok", "objective": "Enterprise service letting GoA business programs verify demographic, income and dependent information from CRA data without exposing sensitive personal information.", "status": "Later", "progress": 0, "start": "2025-11-01", "end": "2026-05-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-05-31", "memberNames": ["Caleb Kwok", "Andrew Van Der Kley"], "members": ["CK", "AVD"]},
  {"id": 1013, "name": "Student Aid Integration", "code": "SAI", "team": "Team 8", "unit": "CRA Income and Data Verification Services", "owner": "Caleb Kwok", "objective": "Enterprise service letting GoA business programs verify demographic, income and dependent information from CRA data without exposing sensitive personal information.", "status": "In-flight", "progress": 10, "start": "2025-11-01", "end": "2026-02-28", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-02-28", "memberNames": ["Caleb Kwok", "Andrew Van Der Kley"], "members": ["CK", "AVD"]},
  {"id": 1014, "name": "Tech Upgrades, Security Compliance for the 2025 emergency evacuation season", "code": "TUS", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1015, "name": "Emergency Evacuation Payments (EEP) Application Submission Pilot – 2026 Evacuation Season", "code": "EEP", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "In-flight", "progress": 75, "start": "2024-10-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1016, "name": "EEP Application Payment Management Pilot– 2026 Evacuation Season", "code": "EAP", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "In-flight", "progress": 75, "start": "2024-10-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1017, "name": "Payment Management (eTransfer)", "code": "PM(", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "In-flight", "progress": 75, "start": "2024-10-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1018, "name": "EEP One-time Payment Program Management Pilot– 2026 Evacuation Season", "code": "EOP", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "In-flight", "progress": 75, "start": "2024-10-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1019, "name": "EPS Enhancements for the 2025 emergency evacuation season", "code": "EEF", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1020, "name": "Financial Payment Management – real time GL posting", "code": "FPM", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Next", "progress": 0, "start": "2025-08-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1021, "name": "Berkeley Integration – Debit Card Payment Management", "code": "BI–", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Next", "progress": 0, "start": "2025-08-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1022, "name": "Modernization utilize Common Payments Platform - Exploration", "code": "MUC", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Later", "progress": 0, "start": "2025-10-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1023, "name": "Modernization Exploration and Implementation – Exploration", "code": "MEA", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Later", "progress": 0, "start": "2025-10-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1024, "name": "Post MVP functions for 2027 Season – (i.e. Physical Address, Ineract Bank Verification, Messaging Service, Payment Preference Options, Financial Mangement Con't )", "code": "PMF", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Later", "progress": 0, "start": "2025-11-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1025, "name": "EEP readiness for the 2026 emergency season", "code": "ERF", "team": "Team 7", "unit": "Alberta Payments", "owner": "Tu Duong-Witte", "objective": "Replace the Evacuation Payment System with common payment services and a common payment platform to deliver emergency payments better, smarter and faster.", "status": "Next", "progress": 0, "start": "2026-01-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1026, "name": "Phase 1 Migration", "subUnit": "Learning Management System", "code": "P1M", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1027, "name": "Phase 1 Improvements", "subUnit": "Learning Management System", "code": "P1I", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "In-flight", "progress": 76, "start": "2025-04-01", "end": "2025-10-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-10-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1028, "name": "Police Review Commission", "subUnit": "Learning Management System", "code": "PRC", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "In-flight", "progress": 90, "start": "2025-05-01", "end": "2025-08-31", "risk": "Medium", "priority": "High", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-08-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1029, "name": "Justice - Parenting After Separation", "subUnit": "Learning Management System", "code": "J-P", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-06-01", "end": "2025-10-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-10-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1030, "name": "AEMA - Public Alerting", "subUnit": "Learning Management System", "code": "A-P", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-07-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1031, "name": "AEMA - Wildland Urban Interface", "subUnit": "Learning Management System", "code": "A-W", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-07-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1032, "name": "Training Academy", "subUnit": "Learning Management System", "code": "TA", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-07-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1033, "name": "AEMA - Emergency Social Services", "subUnit": "Learning Management System", "code": "A-E", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-09-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1034, "name": "JET – Asbestos OHS", "subUnit": "Learning Management System", "code": "J–A", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-09-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1035, "name": "Hazard Identification and Risk", "subUnit": "Learning Management System", "code": "HIA", "team": "Team 9", "unit": "Web Services", "owner": "Ismail Esmail", "objective": "Implement a modern, scalable learning management system that removes the risk of unsupported software and meets external client training needs.", "status": "Later", "progress": 0, "start": "2025-10-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Ismail Esmail", "Arif Kassam"], "members": ["IE", "AK"]},
  {"id": 1036, "name": "Phase 1.0 PIB - Personal Information Bank", "code": "P1P", "team": "Team 3", "unit": "Platforms Operations", "subUnit": "Privacy Portal", "owner": "Chad Bostock", "objective": "Give Albertans access to details on how their personal information is being used across government services.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1037, "name": "Phase 3.0 Discovery", "code": "P3D", "team": "Team 3", "unit": "Platforms Operations", "subUnit": "Privacy Portal", "owner": "Chad Bostock", "objective": "Give Albertans access to details on how their personal information is being used across government services.", "status": "Pause", "progress": 60, "start": "2025-04-01", "end": "2025-07-31", "risk": "High", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-07-31", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1038, "name": "Phase 3.0 Development", "code": "P3D", "team": "Team 3", "unit": "Platforms Operations", "subUnit": "Privacy Portal", "owner": "Chad Bostock", "objective": "Give Albertans access to details on how their personal information is being used across government services.", "status": "Pause", "progress": 40, "start": "2025-05-01", "end": "2026-03-31", "risk": "High", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1039, "name": "Phase 2.1 Unified Messaging Service", "code": "P2U", "team": "Team 3", "unit": "Platforms Operations", "subUnit": "Privacy Portal", "owner": "Chad Bostock", "objective": "Give Albertans access to details on how their personal information is being used across government services.", "status": "In-flight", "progress": 10, "start": "2025-10-01", "end": "2026-09-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-09-30", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1040, "name": "SMS MFA", "code": "SM", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-03-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-03-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1041, "name": "PCTF Assessment", "code": "PA", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Complete a Pan Canadian Trust Framework (PCTF) v1.5 assessment of Unified IAM.", "status": "In-flight", "progress": 64, "start": "2025-01-01", "end": "2026-01-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-01-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1042, "name": "OAG Plan Changes", "code": "OPC", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1043, "name": "Data analytics and reporting", "code": "DAA", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Enhancements to tools in UIAM, and development of reporting outside of UIAM to increase the ability to report and correct data in UIAM.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1044, "name": "TRAVIS (OLS) Migration", "code": "T(M", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Migrate OLS users to support commercial carrier organizations accessing the new TRAVIS permit application.", "status": "Pause", "progress": 52, "start": "2025-01-01", "end": "2026-04-30", "risk": "High", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1045, "name": "Operational Admin Tools", "code": "OAT", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Improvement of admin tools in UIAM for Tier 1 and Tier 2 support, and ongoing operational needs.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1046, "name": "Onboarding Improvements", "code": "OI", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Operational and technical changes needed to improve onboarding process, capture data necessary to meet OAG requirements.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1047, "name": "UIAM Governance", "code": "UG", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1048, "name": "Accessibility Improvements", "code": "AI", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1049, "name": "Mobile Application Auth API", "code": "MAA", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-01-01", "end": "2025-08-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-08-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1050, "name": "Bank Verification Service Procurement", "code": "BVS", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 73, "start": "2025-02-01", "end": "2025-11-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-11-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1051, "name": "ID Document Verification Service Procurement", "code": "IDV", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 73, "start": "2025-02-01", "end": "2025-11-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-11-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1052, "name": "TOTP MFA", "code": "TM", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-03-01", "end": "2025-07-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-07-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1053, "name": "Agentic AI for Contact Centre Pilot", "code": "AAF", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-03-01", "end": "2025-06-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-06-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1054, "name": "Interim DL or ID documents from MOVES", "code": "IDO", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-04-01", "end": "2025-10-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-10-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1055, "name": "Onboarding RITM Enhancements", "code": "ORE", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-04-01", "end": "2025-06-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-06-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1056, "name": "DTIAS", "code": "D", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Completed", "progress": 100, "start": "2025-04-01", "end": "2025-05-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-05-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1057, "name": "Performance Metrics Design", "code": "PMD", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 59, "start": "2025-04-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1058, "name": "ROADS (EXTERN) Migration", "code": "R(M", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Migrate ROADS users from the EXTERN domain Parks Migration : Migrate Alberta Parks shop website users from Aspira.", "status": "Pause", "progress": 59, "start": "2025-04-01", "end": "2025-12-31", "risk": "High", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1059, "name": "Organization Updates", "code": "OU", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Improvements to the User Experience of joining and managing an organization within Alberta.ca Accounts for Organizations.", "status": "In-flight", "progress": 36, "start": "2025-05-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1060, "name": "SLO Enhancements", "code": "SE", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 83, "start": "2025-06-01", "end": "2025-09-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-09-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1061, "name": "Corporate Registries", "code": "CR", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Provides businesses with the ability to verify their organization through an integration with the Corporate Registries System.", "status": "In-flight", "progress": 33, "start": "2025-06-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1062, "name": "Digital Credential Standards", "code": "DCS", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 47, "start": "2025-06-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1063, "name": "Stakeholder Repository and Knowledge Base", "code": "SRA", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 47, "start": "2025-06-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1064, "name": "Remove username", "code": "RU", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "No longer support username sign in and will expect people to sign in with email only.", "status": "In-flight", "progress": 39, "start": "2025-07-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1065, "name": "Service Integration - Banking Verification", "code": "SI-", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Next", "progress": 0, "start": "2025-09-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1066, "name": "Manage Bank Information Feature", "code": "MBI", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Later", "progress": 0, "start": "2025-09-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1067, "name": "Compromised Account Recovery Feature", "code": "CAR", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Later", "progress": 0, "start": "2025-09-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1068, "name": "Service Integration - Person Verification", "code": "SI-", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Next", "progress": 0, "start": "2025-09-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1069, "name": "Alberta.ca Account Promotional Campaign", "code": "AAP", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Promote Account verification ahead of the Mobile Wallet launch.", "status": "In-flight", "progress": 10, "start": "2025-09-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1070, "name": "New OIDC Endpoint Service", "code": "NOE", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "In-flight", "progress": 10, "start": "2025-10-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1071, "name": "Common Payments Integration Planning and PoC", "code": "CPI", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Next", "progress": 0, "start": "2025-10-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1072, "name": "Relying Party UX POC", "code": "RPU", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Enhancements to create a singular common control for how users interact with UIAM from relying parties.", "status": "Next", "progress": 0, "start": "2025-11-01", "end": "2026-06-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-06-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1073, "name": "Design System Uplift", "code": "DSU", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Pause", "progress": 5, "start": "2025-11-01", "end": "2026-06-30", "risk": "High", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-06-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1074, "name": "Parks Migration", "code": "PM", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Migrate Alberta Parks shop website users from Aspira.", "status": "Later", "progress": 0, "start": "2025-12-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1075, "name": "Chatbot POC", "code": "CP", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Later", "progress": 0, "start": "2026-01-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1076, "name": "Unification Plan", "code": "UP", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Analysis and recommendations for how to remove identity brokers such as Keycloak and ADFS to meet auditing requirements of the OAG and improve data in the Privacy Portal.", "status": "Later", "progress": 0, "start": "2026-01-01", "end": "2026-06-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-06-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1077, "name": "Access Management Research and POC", "code": "AMR", "team": "Team 1", "unit": "Unified Identity and Access Management", "owner": "Robert Salloum", "objective": "Unify the pre-existing IAM solutions across the GoA enterprise onto the Unified IAM platform for a consistent, streamlined user experience.", "status": "Later", "progress": 0, "start": "2026-04-01", "end": "2026-06-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-06-30", "memberNames": ["Robert Salloum", "Syed Hashmi"], "members": ["RS", "SH"]},
  {"id": 1078, "name": "Discovery", "code": "D", "team": "Team 4", "unit": "Unified Identity and Access Management", "subUnit": "Unified Messaging Service", "owner": "Chad Bostock", "objective": "Plan for phase 3 of privacy portal and generalized messaging queue for UIAM Phase 3 Development : Implementation of personalized data in privacy portal in partnership with at least one stakeholder.", "status": "In-flight", "progress": 31, "start": "2025-09-01", "end": "2025-09-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-09-30", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1079, "name": "Alpha", "code": "A", "team": "Team 4", "unit": "Unified Identity and Access Management", "subUnit": "Unified Messaging Service", "owner": "Chad Bostock", "objective": "Implement a unified messaging platform integrated with MOVES and the verified Alberta.ca Account delivering proactive motor vehicle expiry notifications.", "status": "Next", "progress": 0, "start": "2025-11-01", "end": "2026-01-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-01-31", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1080, "name": "Build and Configure", "code": "BAC", "team": "Team 4", "unit": "Unified Identity and Access Management", "subUnit": "Unified Messaging Service", "owner": "Chad Bostock", "objective": "Implement a unified messaging platform integrated with MOVES and the verified Alberta.ca Account delivering proactive motor vehicle expiry notifications.", "status": "Next", "progress": 0, "start": "2025-12-01", "end": "2026-02-28", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-02-28", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1081, "name": "Implementation and Testing", "code": "IAT", "team": "Team 4", "unit": "Unified Identity and Access Management", "subUnit": "Unified Messaging Service", "owner": "Chad Bostock", "objective": "Implement a unified messaging platform integrated with MOVES and the verified Alberta.ca Account delivering proactive motor vehicle expiry notifications.", "status": "Next", "progress": 0, "start": "2026-02-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1082, "name": "Launch", "code": "L", "team": "Team 4", "unit": "Unified Identity and Access Management", "subUnit": "Unified Messaging Service", "owner": "Chad Bostock", "objective": "Implement a unified messaging platform integrated with MOVES and the verified Alberta.ca Account delivering proactive motor vehicle expiry notifications.", "status": "Next", "progress": 0, "start": "2026-04-01", "end": "2026-05-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-05-31", "memberNames": ["Chad Bostock", "Edson Roopnarine"], "members": ["CB", "ER"]},
  {"id": 1083, "name": "Electric Vehicle Tax", "code": "EVT", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "This project entails the implementation of the Electric Vehicle Tax for specific vehicle registration renewals.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-01-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-01-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1084, "name": "Learning Management System Integration", "code": "LMS", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "The business area managing the learning management system would like to integrate with eServices to collect fees related to their program.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-03-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1085, "name": "Apply Pay Integration", "code": "API", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1086, "name": "Save and Reuse Credit Card", "code": "SAR", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-06-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-06-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1087, "name": "Privacy Portal Integration", "code": "PPI", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "This integration provides a convenient way for Albertans to view their eServices transaction history, aligning with the Privacy Portal initiative's goals of enhancing transparency and user access .", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2024-11-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2024-11-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1088, "name": "Straight to Checkout", "code": "STC", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-03-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1089, "name": "F5 Shape - Exploration", "code": "FS-", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-04-30", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-04-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1090, "name": "Product Import/Export Functionality", "code": "PIF", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Allows administrators to export products from one environment and import into another environment.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-02-28", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-02-28", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1091, "name": "F5 Distributed Cloud Client-Side Defense – PCI DSS 4.0 Compliance", "code": "FDC", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Completed", "progress": 100, "start": "2024-10-01", "end": "2025-03-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1092, "name": "Approved Scanning Vendor (ASV) External Passing Scan – PCI DSS 4.0 Compliance", "code": "ASV", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Completed", "progress": 100, "start": "2024-11-01", "end": "2025-03-31", "risk": "Low", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1093, "name": "Adobe Commerce Upgrade 2.4.6-p11", "code": "ACU", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "In-flight", "progress": 90, "start": "2025-03-01", "end": "2025-08-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-08-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1094, "name": "Quantum Metric Pilot", "code": "QMP", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "In-flight", "progress": 72, "start": "2025-05-01", "end": "2025-10-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-10-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1095, "name": "1GX API Integration for Journal Posting", "code": "1AI", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "In-flight", "progress": 33, "start": "2025-07-01", "end": "2026-01-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-01-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1096, "name": "Child Care Administrative Penalties Integration", "code": "CCA", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "In-flight", "progress": 39, "start": "2025-07-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1097, "name": "Address Validation Service Integration", "code": "AVS", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "In-flight", "progress": 22, "start": "2025-08-01", "end": "2026-01-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-01-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1098, "name": "F5 Shape Implementation", "code": "FSI", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Next", "progress": 0, "start": "2025-08-01", "end": "2025-12-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2025-12-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1099, "name": "Automated Refunds", "code": "AR", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Later", "progress": 0, "start": "2025-09-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1100, "name": "Court of Appeal Management System Integration", "code": "COA", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Next", "progress": 0, "start": "2025-10-01", "end": "2026-01-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-01-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1101, "name": "Financial Reporting from Data Services", "code": "FRF", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Move eServices financial reporting from Adobe Commerce to the data warehouse/ Metabase thereby improving performance of eServices.", "status": "Later", "progress": 0, "start": "2025-10-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1102, "name": "Automatic Vehicle Registration Renewals", "code": "AVR", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "This project would allow customers to opt-in (and opt-out) of automatic vehicle registration renewals.", "status": "Later", "progress": 0, "start": "2025-12-01", "end": "2026-04-30", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-04-30", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
  {"id": 1103, "name": "Health Card Modernization: DL/ID", "code": "HCM", "team": "Team 6", "unit": "Alberta Payments", "subUnit": "eServices", "owner": "Tu Duong-Witte", "objective": "Digital platform enabling Albertans to pay for government services including motor vehicle services, fine payments and court-related searches.", "status": "Later", "progress": 0, "start": "2025-12-01", "end": "2026-03-31", "risk": "Medium", "priority": "Medium", "approxCost": 0, "scheduleVariance": 0, "milestone": "Target completion", "milestoneDate": "2026-03-31", "memberNames": ["Tu Duong-Witte", "Supriya Kallianpur"], "members": ["TD", "SK"]},
];

const seedTeams = [
  { id: 1, name: "Team 1", specialty: "Product Strategy", lead: "Lena Ford", capacity: 76, headcount: 8, projectIds: [2, 7], members: ["Lena Ford", "Jon Bell", "Ava Green", "Noah Reed"] },
  { id: 2, name: "Team 2", specialty: "Platform Engineering", lead: "Ana Silva", capacity: 88, headcount: 12, projectIds: [3, 5], members: ["Ana Silva", "Rina Patel", "Nia King", "Evan Hart"] },
  { id: 3, name: "Team 3", specialty: "Experience Design", lead: "Maya Chen", capacity: 94, headcount: 7, projectIds: [1], members: ["Maya Chen", "Jules Ross", "Amir Noor", "Sofia Kim"] },
  { id: 4, name: "Team 4", specialty: "Growth Marketing", lead: "Theo Martin", capacity: 69, headcount: 9, projectIds: [4], members: ["Theo Martin", "Lena Fox", "Owen Price", "Iris Cole"] },
  { id: 5, name: "Team 5", specialty: "Portfolio Operations", lead: "Sam Okafor", capacity: 82, headcount: 6, projectIds: [6], members: ["Sam Okafor", "Edson Roopnarine", "Bea Cruz", "Mia Hall"] },
  { id: 6, name: "Team 6", specialty: "Mobile Engineering", lead: "Jon Bell", capacity: 84, headcount: 10, projectIds: [2], members: ["Jon Bell", "Ravi Lin", "Kara Moss", "Tariq Dean"] },
  { id: 7, name: "Team 7", specialty: "Identity and Security", lead: "Rina Patel", capacity: 79, headcount: 8, projectIds: [5], members: ["Rina Patel", "Evan Hart", "Will Young", "Nora James"] },
  { id: 8, name: "Team 8", specialty: "Data and Analytics", lead: "Nia King", capacity: 72, headcount: 11, projectIds: [3], members: ["Nia King", "Ana Silva", "Drew Miles", "Kai Brooks"] },
  { id: 9, name: "Team 9", specialty: "Customer Enablement", lead: "Priya Shah", capacity: 67, headcount: 7, projectIds: [1, 7], members: ["Priya Shah", "Lena Ford", "Alex Grant", "Pia Stone"] },
  { id: 10, name: "Team 10", specialty: "Quality and Release", lead: "Daniel Wu", capacity: 74, headcount: 9, projectIds: [2, 3, 4], members: ["Daniel Wu", "Tariq Dean", "Owen Price", "Will Young"] }
];

const seedRoadmapStrategy = {
  vision: "Deliver trusted, reusable digital platforms so every Government of Alberta service team can build once and serve Albertans everywhere.",
  goals: [
    { id: 1, title: "Reusable platform adoption", outcome: "Service teams build on shared identity, wallet and payments platforms instead of bespoke stacks.", target: 80, current: 55, unit: "%" },
    { id: 2, title: "Delivery predictability", outcome: "Initiatives land inside their committed quarter with no unplanned schedule slip.", target: 90, current: 71, unit: "%" },
    { id: 3, title: "Service reach", outcome: "Albertans can complete priority journeys end to end on a digital channel.", target: 12, current: 7, unit: " journeys" }
  ]
};

function loadRoadmapStrategy() {
  const fallback = { vision: seedRoadmapStrategy.vision, goals: seedRoadmapStrategy.goals.map(goal => ({ ...goal })) };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.roadmap));
    if (!saved || typeof saved.vision !== "string") return fallback;
    return { vision: saved.vision, goals: Array.isArray(saved.goals) ? saved.goals : [] };
  } catch {
    return fallback;
  }
}

function saveRoadmapStrategy() {
  localStorage.setItem(STORAGE.roadmap, JSON.stringify(roadmapStrategy));
  pushRecords("strategy", (() => roadmapStrategy)(), "the roadmap strategy");
}

let roadmapStrategy = loadRoadmapStrategy();
let customTaxonomy = loadCustomTaxonomy();
let scoreModel = loadScoreModel();
let ideas = loadIdeas();
let feedbackEntries = loadFeedback();
let ideaBeingEdited = null;
let ideaAwaitingPromotion = null;
let releases = loadReleases();
let projectSpecs = loadKeyedStore(STORAGE.specs);
let projectNotes = loadKeyedStore(STORAGE.notes);
let projectHistory = loadKeyedStore(STORAGE.history);
let specProjectId = null;
let customFields = loadCustomFields();
let savedViews = loadSavedViews();
let activeSavedViewId = null;
let releaseBeingEdited = null;
let draggedIdeaId = null;
let draggedProjectId = null;
let suppressNextBarClick = false;
// The deck tracks Privacy Portal as one initiative broken into phases, so the
// four separate phase-projects collapse into a single project holding them.
// Runs over seed and stored data alike, and is idempotent.
// ---------------------------------------------------------------------------
// UIAM structure taken from the September 2025 Platforms Roadmap deck,
// slides 7 to 12. Each timeline page (7, 9, 11) gives a category and its
// labelled rows; the facing detail page (8, 10, 12) gives the initiative and
// the per-deliverable descriptions.
//
// Every value below is transcribed from the deck. A project appears here only
// if the deck places it on one of those pages, and a description is set only
// where the deck actually writes one - the rest keep the initiative-level
// description they already carry, because inventing a per-project one would be
// making it up.
// ---------------------------------------------------------------------------
const UIAM_DECK_PAGES = {
  "UIAM - Verification": {
    slide: 7,
    initiative: "Unified Identity Access Management (UIAM)",
    description: "The strategic vision is to unify the pre-existing IAM solutions available in the GoA enterprise to the Unified IAM platform to provide a consistent and streamlined user experience."
  },
  "Strategy and Operations": {
    slide: 9,
    initiative: "Unified Identity Access Management (UIAM)",
    description: "The strategic vision is to unify the pre-existing IAM solutions available in the GoA enterprise to the Unified IAM platform to provide a consistent and streamlined user experience."
  },
  "Alberta.ca Account Features": {
    slide: 11,
    initiative: "Alberta.ca Account",
    description: "The Alberta.ca Account Program is being expanded to include new identity documents for account verification, a way to manage and verify bank account information to receive government payments, a way for organizations to verify themselves. The system is receiving a rebrand to refresh its look and feel in alignment with the Mobile Wallet, as well as receive user experience improvements and security enhancements."
  }
};

const UIAM_DECK_PROJECTS = [
  // Slide 7 - UIAM - Verification
  { name: "SMS MFA", category: "UIAM - Verification", subCategory: "Sign-in / 2-Step Verification (Multifactor)",
    objective: "SMS Multi-Factor Authentication (MFA): Provides users with the ability to enable SMS-based MFA, which will send a text message to their verified phone number." },
  { name: "TOTP MFA", category: "UIAM - Verification", subCategory: "Sign-in / 2-Step Verification (Multifactor)",
    objective: "Time-based One-Time Password (TOTP) MFA: Provides users with the ability to enable TOTP MFA, which will work with standards-based authenticator apps including Google Authenticator, Microsoft Authenticator, LastPass, FreeOTP and others." },
  { name: "SLO Enhancements", category: "UIAM - Verification", subCategory: "Sign-in / 2-Step Verification (Multifactor)",
    objective: "Single Log Out (SLO) Enhancements: Ensures log out of all active sessions (e.g., when a user changes a password or initiates a password reset). Includes cross protocol support for Wallet and Privacy Portal." },
  { name: "Remove username", category: "UIAM - Verification", subCategory: "Sign-in / 2-Step Verification (Multifactor)",
    objective: "Remove Username: No longer support username sign in and will expect people to sign in with email only. This was a legacy MADI method that was carried to Unified IAM with the intent that email sign-in will be the standard at a later date." },
  { name: "Compromised Account Recovery Feature", category: "UIAM - Verification", subCategory: "Sign-in / 2-Step Verification (Multifactor)" },
  { name: "Bank Verification Service Procurement", category: "UIAM - Verification", subCategory: "Banking Verification",
    objective: "Bank Verification Service: Will provide the ability to validate a bank account, including ownership of account." },
  { name: "Service Integration - Banking Verification", category: "UIAM - Verification", subCategory: "Banking Verification" },
  { name: "Manage Bank Information Feature", category: "UIAM - Verification", subCategory: "Banking Verification" },
  { name: "ID Document Verification Service Procurement", category: "UIAM - Verification", subCategory: "Person Verification",
    objective: "Alternative Document ID verification: Will give users the ability to verify using other Identity documents (e.g. Passport, Indian Status Card, etc.) through Interact." },
  { name: "Service Integration - Person Verification", category: "UIAM - Verification", subCategory: "Person Verification" },
  { name: "Interim DL or ID documents from MOVES", category: "UIAM - Verification", subCategory: "Person Verification",
    objective: "Interim DL / ID document: Will give users the ability to verify using the interim documents provided by the Alberta Registries from MOVES." },
  { name: "PCTF Assessment", category: "UIAM - Verification", subCategory: "Person Verification",
    objective: "PCTF Assessment: Complete a Pan Canadian Trust Framework (PCTF) v1.5 assessment of Unified IAM." },
  { name: "Corporate Registries", category: "UIAM - Verification", subCategory: "Organizations Verification",
    objective: "Corporate Registries: Provides businesses with the ability to verify their organization through an integration with the Corporate Registries System." },

  // Slide 9 - UIAM - Strategy and Operations
  { name: "OAG Plan Changes", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan",
    objective: "OAG Plan: Planned product enhancements in response to the findings from the Auditor General, ACN Mask, Activation Code Timeout." },
  { name: "Data analytics and reporting", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan",
    objective: "Data Analytics and Reporting: Enhancements to tools in UIAM, and development of reporting outside of UIAM to increase the ability to report and correct data in UIAM." },
  { name: "Onboarding Improvements", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan",
    objective: "Onboarding improvements: Operational and technical changes needed to improve onboarding process, capture data necessary to meet OAG requirements." },
  { name: "Onboarding RITM Enhancements", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan" },
  { name: "Stakeholder Repository and Knowledge Base", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan" },
  { name: "Performance Metrics Design", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan" },
  { name: "Digital Credential Standards", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan" },
  { name: "DTIAS", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan" },
  { name: "UIAM Governance", category: "Strategy and Operations", subCategory: "Office of the Auditor General (OAG) Response Plan" },
  { name: "Unification Plan", category: "Strategy and Operations", subCategory: "IAM Unification",
    objective: "Unification Plan: Analysis and recommendations for how to remove identity brokers such as Keycloak and ADFS to meet auditing requirements of the OAG and improve data in the Privacy Portal. Outcomes include technical, policy, and budget recommendations." },
  { name: "TRAVIS (OLS) Migration", category: "Strategy and Operations", subCategory: "IAM Unification",
    objective: "TRAVIS (OLS) Migration: Migrate OLS users to support commercial carrier organizations accessing the new TRAVIS permit application." },
  { name: "ROADS (EXTERN) Migration", category: "Strategy and Operations", subCategory: "IAM Unification",
    objective: "ROADS (EXTERN) Migration: Migrate ROADS users from the EXTERN domain." },
  { name: "Parks Migration", category: "Strategy and Operations", subCategory: "IAM Unification",
    objective: "Parks Migration: Migrate Alberta Parks shop website users from Aspira." },
  { name: "Operational Admin Tools", category: "Strategy and Operations", subCategory: "Administration and Support",
    objective: "Operational Admin Tools: Improvement of admin tools in UIAM for Tier 1 and Tier 2 support, and ongoing operational needs." },
  { name: "Chatbot POC", category: "Strategy and Operations", subCategory: "Administration and Support",
    objective: "SearchAI Chatbot: Widget instance of SearchAI tool placed on Alberta.ca Account 'Get help' page to act as a chatbot and provide insights into questions being asked by users." },
  { name: "Agentic AI for Contact Centre Pilot", category: "Strategy and Operations", subCategory: "Administration and Support",
    objective: "Agentic AI: Introduction of Agentic AI to the Alberta.ca Account Contact Centre is expected to improved customer support." },

  // Slide 11 - UIAM - Alberta.ca Account Features
  { name: "Accessibility Improvements", category: "Alberta.ca Account Features", subCategory: "Design Improvements",
    objective: "Accessibility Audit: Work underway conducting interviews with users who experience real-life accessibility issues to test how UIAM performs. Report will guide accessibility improvements for UIAM and other services in the GoA." },
  { name: "Relying Party UX POC", category: "Alberta.ca Account Features", subCategory: "Design Improvements",
    objective: "Relying Party UX POC: Enhancements to create a singular common control for how users interact with UIAM from relying parties. POC will test integration with the Alberta.ca Web Property." },
  { name: "Organization Updates", category: "Alberta.ca Account Features", subCategory: "Design Improvements",
    objective: "Organization updates: Improvements to the User Experience of joining and managing an organization within Alberta.ca Accounts for Organizations." },
  { name: "Alberta.ca Account Promotional Campaign", category: "Alberta.ca Account Features", subCategory: "Alberta.ca Account Branding",
    objective: "Alberta.ca Account Promotional Campaign: Promote Account verification ahead of the Mobile Wallet launch. Campaign includes a joint MFA awareness campaign, promotion of services available (Motor Vehicles), and community outreach." },
  { name: "Design System Uplift", category: "Alberta.ca Account Features", subCategory: "Alberta.ca Account Branding",
    objective: "Design System Uplift: Improvements to UIAM design resulting from the Design System Uplift project." },
  { name: "Mobile Application Auth API", category: "Alberta.ca Account Features", subCategory: "Service Integration",
    objective: "Wallet and Credentials Integration: Services needed to integrate the application into the UIAM experience to allow users to access their digital credentials." },
  { name: "Common Payments Integration Planning and PoC", category: "Alberta.ca Account Features", subCategory: "Service Integration",
    objective: "Common Payment Integration: Service to integrate Common Payments into the UIAM experience to enable to the storage of payments information at the identity level rather than at the service level." },
  { name: "New OIDC Endpoint Service", category: "Alberta.ca Account Features", subCategory: "Service Integration",
    objective: "OIDC Support: Develop a new OIDC Endpoint service to provide an alternative to SAML2 as well as support for unifying other IDP brokers." },
  { name: "Access Management Research and POC", category: "Alberta.ca Account Features", subCategory: "Service Integration",
    objective: "Access (Authorization) Management: Makes available the existing UIAM Role Base Access Controls to Relying Parties." }
];

// Idempotent: it matches on the project name, only ever fills the category,
// sub-category and description, and never touches dates, status or anything
// else already recorded.
function applyUiamDeckStructure(list) {
  const byName = new Map(UIAM_DECK_PROJECTS.map(entry => [entry.name, entry]));
  list.forEach(project => {
    const entry = byName.get(project.name);
    if (!entry || project.unit !== "Unified Identity and Access Management") return;
    project.subUnit = entry.category;
    project.subCategory = entry.subCategory;
    if (entry.objective) project.objective = entry.objective;
  });
  return list;
}

// A phase can record its own progress, independently of the phases around it.
// An empty field means no progress has been recorded for that phase - which is
// different from recording zero - so it stays empty rather than becoming a 0.
function phaseProgressValue(value) {
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Math.min(100, Math.max(0, Math.round(number)));
}

function hasPhaseProgress(phase) {
  return Boolean(phase) && phase.progress !== "" && phase.progress !== null
    && phase.progress !== undefined && Number.isFinite(Number(phase.progress));
}

// The project's progress is the combined average of all its phases: every
// phase counts once, and a phase with no figure counts as none of its share.
//
// Returns null only when no phase records progress at all, in which case the
// project keeps the progress recorded against it rather than dropping to zero.
function phaseProgressRollup(phases) {
  const list = Array.isArray(phases) ? phases : [];
  if (!list.length || !list.some(hasPhaseProgress)) return null;
  const total = list.reduce((sum, phase) => sum + (hasPhaseProgress(phase) ? Number(phase.progress) : 0), 0);
  return Math.round(total / list.length);
}

// ---------------------------------------------------------------------------
// Learning Management System, from the same deck, slides 35 to 39. Slide 35
// names the section, slide 36 carries the timeline with three labelled rows,
// and slides 37 to 39 give the initiative and the per-deliverable descriptions.
//
// The deck's timeline tables are stretched to fit their frames, so a bar's row
// cannot be read from the raw row heights - the frame height has to be divided
// across them first. Done that way every bar on this page lands inside a band
// cleanly, and the deck's own deliverable names confirm it: the Hazard
// Identification bar is written up as "PSES - AEMA - Hazard Identification and
// Risk Assessment", which is the PSES Migration row it computes to.
//
// The deck writes a description for nine of the ten bars, each named as the
// deck names the deliverable, with the Domain and Release it gives recorded
// below. "Phase 1 Improvements" is the one bar the deck describes nowhere, so
// it keeps the objective it already had.
// ---------------------------------------------------------------------------
const LMS_DECK_PAGES = {
  "Learning Management System": {
    slides: [35, 36, 37, 38, 39],
    initiative: "Learning Management System (LMS)",
    description: "The strategic vision is to implement a new learning management system that eliminates the risks associated with using unsupported software, while providing a modern, scalable platform that meets Ministry current and future external client facing educational and training needs. The new system will offer enhanced user experience, improved accessibility, and flexible features that can adapt to evolving organizational learning requirements. The solution will be based off a common core platform but provide users with the flexibility to implement a solution that meets their respective needs.",
    deliverables: {
      "Phase 1 Migration": { domain: "", release: "Q1 25/26" },
      "PSES - Police Review Commission": { domain: "Migration", release: "Q2 25/26" },
      "Justice - Parenting after Separation online training": { domain: "Migration", release: "Q2 25/26" },
      "PSES - AEMA - Public Alerting System": { domain: "Enhancement", release: "Q3 25/26" },
      "PSES - AEMA - Wildland Urban Interface": { domain: "Enhancement", release: "Q3 25/26" },
      "PSES - AEMA - Emergency Social Services": { domain: "Enhancement", release: "Q3 25/26" },
      "PSES - AEMA - Hazard Identification and Risk Assessment": { domain: "Enhancement", release: "Q4 25/26" },
      "PSES - Training Academy": { domain: "Migration", release: "Q3 25/26" },
      "JET - OHS Asbestos & Blasters Training Agencies portal": { domain: "Migration", release: "Q3 25/26" }
    }
  }
};

const LMS_DECK_PROJECTS = [
  // Slide 36, row "Phase 1"
  { name: "Phase 1 Migration", category: "Learning Management System", subCategory: "Phase 1",
    objective: "Phase 1 Migration. CFS - Learning Environment Online: enables CFS staff and contractors to complete mandatory & legislated training. This instance has been operational since late 2021. TEC - Class 1 Driver Training: enable the replacement of the Ministry's Mandatory Entry Level Training (MELT) program with a new Class 1 Leaner Pathways Program. The new LMS will provide a platform to provide an accessible learning site for the new tiered and restricted Class 1 learning pathway that will be made available to Albertans and some driving schools. MA - Firefighter Training: replace the Ministry's legacy LMS to eliminate risks associated with using unsupported software. PSES - Local Authorities Emergency Management Training. Forestry - Wildfire training (implementation delayed until Fall 2025 due to wildfire season): replace the Ministry's legacy LMS to eliminate risks associated with using unsupported software. Note, LMS solution supports FIRES operations. Petrinex Reporting portal training: Petrinex currently provides LMS support to four (4) provincial government jurisdictions and the Canadian Association of Petroleum. SARTR - Registry Agents Training: legacy platform licensing expiring in April '25, no alternative available." },
  // Slide 36, row "Phase 2 - PSES Migration"
  { name: "Phase 1 Improvements", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration" },
  { name: "Police Review Commission", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration",
    objective: "PSES - Police Review Commission: Implement LMS to support Ministry's current and future external client facing educational and training needs. Importance: High - Minister's priority." },
  { name: "AEMA - Public Alerting", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration",
    objective: "PSES - AEMA - Public Alerting System: Add Public Alerting business requirements to Alberta Emergency Management Agency LMS. Importance: Medium." },
  { name: "Training Academy", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration",
    objective: "PSES - Training Academy: Replace legacy LMS to eliminate risks associated with using unsupported software, while providing a modern, scalable platform that meets the agency's current and future external client facing educational and training needs. Importance: Medium." },
  { name: "AEMA - Wildland Urban Interface", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration",
    objective: "PSES - AEMA - Wildland Urban Interface: Add Wildland Urban Interface business requirements to Alberta Emergency Management Agency LMS. Importance: Medium." },
  { name: "AEMA - Emergency Social Services", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration",
    objective: "PSES - AEMA - Emergency Social Services: Add Enhancement business requirements to Alberta Emergency Management Agency LMS. Importance: Medium." },
  { name: "Hazard Identification and Risk", category: "Learning Management System", subCategory: "Phase 2 - PSES Migration",
    objective: "PSES - AEMA - Hazard Identification and Risk Assessment: Add Hazard Identification and Risk Assessment business requirements to Alberta Emergency Management Agency LMS. Importance: Medium." },
  // Slide 36, row "Phase 2 - Justice and JET"
  { name: "Justice - Parenting After Separation", category: "Learning Management System", subCategory: "Phase 2 - Justice and JET",
    objective: "Justice - Parenting after Separation online training: Replace the Ministry's legacy LMS with a modern, scalable platform that meets the Ministry's current and future external client facing educational and training needs. Importance: High - Legacy platform licensing expiring." },
  { name: "JET – Asbestos OHS", category: "Learning Management System", subCategory: "Phase 2 - Justice and JET",
    objective: "JET - OHS Asbestos & Blasters Training Agencies portal: Replace legacy LMS to eliminate risks associated with using unsupported software, while providing a modern, scalable platform that meets the agency's current and future external client facing educational and training needs. Importance: Medium." }
];

// Same contract as the other importers.
function applyLmsDeckStructure(list) {
  const byName = new Map(LMS_DECK_PROJECTS.map(entry => [entry.name, entry]));
  list.forEach(project => {
    const entry = byName.get(project.name);
    if (!entry || project.unit !== "Web Services") return;
    project.subUnit = entry.category;
    project.subCategory = entry.subCategory;
    if (entry.objective) project.objective = entry.objective;
  });
  return list;
}

// ---------------------------------------------------------------------------
// CRA Data Verification Service, from the same deck, slides 32 to 34. Slide 32
// names the section, slide 33 carries the timeline and the deliverable table,
// slide 34 gives the initiative.
//
// This page has one labelled row, and its label is the page heading itself -
// "Income Verification Service" - so the deck gives one level of nesting here,
// not two. The projects sit under that unit with no category rather than being
// given a category band that would repeat the unit's own name.
//
// The deck's deliverable table names three deliverables against four bars. Two
// map plainly: TI / CRA MOU Development to "Student Aid / CRA MOU", and
// End-point - GoA Program areas to "On board new programs". The third,
// End-point - Alberta Student Aid, is released Q1/Q2 25/26, which is the window
// "Service Development for Student Aid" runs in, so it carries that
// description; "Student Aid Integration" runs later and the deck writes nothing
// for it, so it keeps the objective it already had.
// ---------------------------------------------------------------------------
const CRA_DECK_PAGES = {
  "Income Verification Service": {
    slides: [32, 33, 34],
    initiative: "CRA Data Verification Service",
    description: "CRA Data Verification Service is provided by the ministry of Technology and Information (TI) as an enterprise service, designed to enable business programs within ministries at the Government of Alberta to verify demographic statistic (such as marital status), income, and dependent information based on Canada Revenue Agency data without exposing sensitive personal information. This supports the administration of affordability programs, subsidy programs, grants, and more. The data verification service will be delivered via a secure application programming interface (API).\n\nThe use of the CRA data with this service is governed by the Memorandum of Understanding (MOU) between TI and CRA (also referred to as \"the TI and CRA MOU\" in this document). Additionally, the use of the data is determined on a per-business program basis and is specified in the TI and CRA MOU.\n\nA MOU between TI and each business program is also required to ensure the proper use of this service and the CRA data.",
    deliverables: {
      "End-point - Alberta Student Aid": { domain: "New Service", release: "Q1/Q2 25/26" },
      "TI / CRA MOU Development": { domain: "New Service", release: "Q3 25/26" },
      "End-point - GoA Program areas": { domain: "New Service", release: "Q3/Q4 25/26, Q1 26/27" }
    }
  }
};

const CRA_DECK_PROJECTS = [
  { name: "Service Development for Student Aid", category: "Income Verification Service", subCategory: "",
    objective: "End-point - Alberta Student Aid: Develop an end-point to deliver data verification service specific to Alberta Student Aid using their existing MOU." },
  { name: "Student Aid / CRA MOU", category: "Income Verification Service", subCategory: "",
    objective: "TI / CRA MOU Development: Develop an overarching MOU between TI and CRA. Develop MOUs between TI and GoA Program areas to consume CRA data." },
  { name: "On board new programs", category: "Income Verification Service", subCategory: "",
    objective: "End-point - GoA Program areas: Onboard Program areas to consume CRA data, based on their respective MOUs." },
  { name: "Student Aid Integration", category: "Income Verification Service", subCategory: "" }
];

// Same contract as the other importers.
function applyCraDeckStructure(list) {
  const byName = new Map(CRA_DECK_PROJECTS.map(entry => [entry.name, entry]));
  list.forEach(project => {
    const entry = byName.get(project.name);
    if (!entry || project.unit !== "CRA Income and Data Verification Services") return;
    project.subUnit = entry.category;
    project.subCategory = entry.subCategory;
    if (entry.objective) project.objective = entry.objective;
  });
  return list;
}

// ---------------------------------------------------------------------------
// Common Payment Platform (CPP) and Common Payment Services (CPS), from the
// same deck, slides 27 to 31. Slide 27 names the section; slides 28 and 29 are
// two timeline pages sharing one heading, which is the unit here; slides 30 and
// 31 give the initiative and the descriptions.
//
// The row each bar sits on was read off the rendered pages. On these two slides
// the bars are positioned independently of the table's row heights, so working
// the row out from the shape geometry puts several bars a band out - the pages
// themselves are the reliable source and were used instead.
//
// The deck writes its descriptions against the rows rather than the individual
// bars, so every bar on a row carries that row's description, named as the deck
// names it. The deck also gives each row a Domain and a Release, which the app
// has no field for; both are recorded below rather than dropped.
//
// "EEP readiness for the 2026 emergency season" is one tall bar drawn across
// the CPP and CPS rows rather than on any one of them, so it carries no
// category and sits directly under the unit.
// ---------------------------------------------------------------------------
const PAYMENTS_DECK_PAGES = {
  "Common Payment Platform (CPP) and Common Payment Services (CPS)": {
    slides: [27, 28, 29, 30, 31],
    initiative: "Common Payments Platform",
    description: "Evacuation Payment System (EPS) was created in 2018 in response to the challenges faced in distributing evacuation payments during the 2016 Fort McMurray wildfires. The system is used to disburse funds electronically to eligible Albertans in response to evacuation orders. EPS will be replaced by a future common payment services and common payment platform with the goal to deliver emergency payment programs to Albertans better, smarter, and faster.",
    rows: {
      "Evacuation Payment System (EPS) - Transformation": { slide: 28, domain: "Existing Service", release: "Q4 24/25" },
      "CPP - Public Portal": { slide: 28, domain: "New Service", release: "Q3 25/26" },
      "CPP - Internal Portal": { slide: 28, domain: "New Service", release: "Q3 25/26" },
      "CPP - Admin Portal": { slide: 28, domain: "New Service", release: "Q3 25/26" },
      "CPS": { slide: 28, domain: "New Service", release: "Q3 25/26" },
      "CPP and CPS - post MVP": { slide: 29, domain: "", release: "" },
      "Emergency Benefit Payment System (EBS) - modernization": { slide: 29, domain: "New Service", release: "Q4 25/26" },
      "Emergency Registration System (ERS) - modernization": { slide: 29, domain: "New Service", release: "Q4 25/26" }
    }
  }
};

const PAYMENTS_DECK_PROJECTS = [
  { name: "Tech Upgrades, Security Compliance for the 2025 emergency evacuation season", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "Evacuation Payment System (EPS) - Transformation",
    objective: "Evacuation Payment System (EPS) - Tech Upgrades and System Enhancements: Tech upgrading and portal enhancing the existing system to be ready for the 2025 wildfire season and to comply with current technologies and cybersecurity standards minimizing vulnerability risks impacting Albertans and SCSS business operations." },
  { name: "EPS Enhancements for the 2025 emergency evacuation season", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "Evacuation Payment System (EPS) - Transformation",
    objective: "Evacuation Payment System (EPS) - Tech Upgrades and System Enhancements: Tech upgrading and portal enhancing the existing system to be ready for the 2025 wildfire season and to comply with current technologies and cybersecurity standards minimizing vulnerability risks impacting Albertans and SCSS business operations." },
  { name: "Emergency Evacuation Payments (EEP) Application Submission Pilot – 2026 Evacuation Season", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPP - Public Portal",
    objective: "Public Portal: A portal for one-time payment application forms. The initial launch will be piloting with SCSS to support the Emergency Evacuation Payment (EEP) program." },
  { name: "EEP Application Payment Management Pilot– 2026 Evacuation Season", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPP - Internal Portal",
    objective: "Payment Services Portal: A common Payments Service Portal that enables workflows for adjudication, proxy, approval, EO audit and financial management journal processes to support business issuing one-time payments based on program eligibility requirements. Enables Ministry business programs with automated end-to-end financial reconciliation, audit, and journal management capabilities which streamline financial process with audit tracking." },
  { name: "Financial Payment Management – real time GL posting", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPP - Internal Portal",
    objective: "Payment Services Portal: A common Payments Service Portal that enables workflows for adjudication, proxy, approval, EO audit and financial management journal processes to support business issuing one-time payments based on program eligibility requirements. Enables Ministry business programs with automated end-to-end financial reconciliation, audit, and journal management capabilities which streamline financial process with audit tracking." },
  { name: "EEP One-time Payment Program Management Pilot– 2026 Evacuation Season", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPP - Admin Portal",
    objective: "Admin Portal: An Administrative platform that enables Ministry business programs to quickly spin up payment services responding to urgent one-time payments to Albertan. The Admin portal is housed with form creation, payment configurations, program setting, and service lifecycle management capabilities." },
  { name: "Payment Management (eTransfer)", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPS",
    objective: "Common Payments Service: A Common Payments Service consists of application programing interfaces (APIs) that enables issuing real-time eTransfer payments with complete payment audit and tracking capabilities. Enables general ledger journal posting to 1GX which streamlines end-to-end payment issuing and payment journaling processes." },
  { name: "Berkeley Integration – Debit Card Payment Management", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPS",
    objective: "Common Payments Service: A Common Payments Service consists of application programing interfaces (APIs) that enables issuing real-time eTransfer payments with complete payment audit and tracking capabilities. Enables general ledger journal posting to 1GX which streamlines end-to-end payment issuing and payment journaling processes." },
  { name: "EEP readiness for the 2026 emergency season", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "" },
  { name: "Post MVP functions for 2027 Season – (i.e. Physical Address, Ineract Bank Verification, Messaging Service, Payment Preference Options, Financial Mangement Con't )", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "CPP and CPS - post MVP" },
  { name: "Modernization utilize Common Payments Platform - Exploration", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "Emergency Benefit Payment System (EBS) - modernization",
    objective: "Modernize Emergency Benefit Payment System (EBS) - exploration: Enables Ministry business programs with automated end-to-end financial reconciliation, audit, and journal management capabilities which streamline financial process with audit tracking in the Payments Service Portal." },
  { name: "Modernization Exploration and Implementation – Exploration", category: "Common Payment Platform (CPP) and Common Payment Services (CPS)", subCategory: "Emergency Registration System (ERS) - modernization",
    objective: "Modernize Emergency Registration System (ERS) - exploration: Enables general ledger journal posting to 1GX which streamlines end-to-end payment issuing and payment journaling processes." }
];

// Same contract as the other importers.
function applyPaymentsDeckStructure(list) {
  const byName = new Map(PAYMENTS_DECK_PROJECTS.map(entry => [entry.name, entry]));
  list.forEach(project => {
    const entry = byName.get(project.name);
    if (!entry || project.unit !== "Alberta Payments") return;
    project.subUnit = entry.category;
    project.subCategory = entry.subCategory;
    if (entry.objective) project.objective = entry.objective;
  });
  return list;
}

// ---------------------------------------------------------------------------
// eServices structure taken from the same deck, slides 22 to 26. Slide 22
// names the section; slides 23 and 25 carry two timeline pages with five
// labelled rows between them; slides 24 and 26 give the initiative and the
// per-deliverable descriptions.
//
// A project appears here only because the deck draws a bar for it on one of
// those rows, and a description is set only where the deck writes one. Two
// details of the deck are worth recording rather than smoothing over: it names
// two deliverables differently in the description tables than on the timeline
// (Apple Pay / "Apply Pay Integration", Direct to Checkout / "Straight to
// Checkout", Save and Reuse Payment Card / "Save and Reuse Credit Card"), and
// it writes the Court of Appeal description under Service Enhancements while
// drawing its bar on the Integrations row - the bar's row wins here, because
// that is where the deck places the work.
// ---------------------------------------------------------------------------
const ESERVICES_DECK_PAGES = {
  eServices: {
    slides: [22, 23, 24, 25, 26],
    initiative: "eServices",
    description: "eServices is a digital platform that enables Albertans to pay for government services and products including motor vehicle services, fine payments, and court-related searches. The platform processes hundreds of thousands of transactions and generates hundreds of millions in revenue for the government, annually.",
    rows: {
      "Service Enhancements": 23,
      "Payment Enhancements": 23,
      "Integrations": 23,
      "Security Improvements": 25,
      "Administration and Reporting": 25
    }
  }
};

const ESERVICES_DECK_PROJECTS = [
  // Slide 23, row "Service Enhancements"
  { name: "Electric Vehicle Tax", category: "eServices", subCategory: "Service Enhancements",
    objective: "Motor Vehicles Electric Vehicle Tax: This project entails the implementation of the Electric Vehicle Tax for specific vehicle registration renewals. The official rollout is scheduled for January 1, 2025." },
  { name: "Learning Management System Integration", category: "eServices", subCategory: "Service Enhancements",
    objective: "Learning Management System Integration: The business area managing the learning management system would like to integrate with eServices to collect fees related to their program." },
  { name: "Automated Refunds", category: "eServices", subCategory: "Service Enhancements" },
  { name: "Health Card Modernization: DL/ID", category: "eServices", subCategory: "Service Enhancements" },
  { name: "Automatic Vehicle Registration Renewals", category: "eServices", subCategory: "Service Enhancements",
    objective: "Automatic Vehicle Registration Renewals: This project would allow customers to opt-in (and opt-out) of automatic vehicle registration renewals." },

  // Slide 23, row "Payment Enhancements"
  { name: "Apply Pay Integration", category: "eServices", subCategory: "Payment Enhancements",
    objective: "Apple Pay Integration: Facilitates fast and secure payments via Apple Pay, enhancing checkout, while ensuring transaction security through tokenization and biometric authentication for mobile wallet users." },
  { name: "Save and Reuse Credit Card", category: "eServices", subCategory: "Payment Enhancements",
    objective: "Save and Reuse Payment Card: Enables users to securely save their payment card details for future transactions, streamlining the checkout process." },
  { name: "1GX API Integration for Journal Posting", category: "eServices", subCategory: "Payment Enhancements" },

  // Slide 23, row "Integrations"
  { name: "Privacy Portal Integration", category: "eServices", subCategory: "Integrations",
    objective: "Privacy Portal Integration: This integration provides a convenient way for Albertans to view their eServices transaction history, aligning with the Privacy Portal initiative's goals of enhancing transparency and user access to personal data." },
  { name: "Straight to Checkout", category: "eServices", subCategory: "Integrations",
    objective: "Direct to Checkout: Enables integrated applications to bypass the product and cart pages on eServices, streamlining the payment process by going directly to checkout. Improves user experience by providing a quicker and more convenient checkout process." },
  { name: "Child Care Administrative Penalties Integration", category: "eServices", subCategory: "Integrations" },
  { name: "Address Validation Service Integration", category: "eServices", subCategory: "Integrations" },
  { name: "Court of Appeal Management System Integration", category: "eServices", subCategory: "Integrations",
    objective: "Court of Appeal Management System: The Courts Judicial and Administration area would like to integrate the Court of Appeal of Alberta's Case Management System (CAMS) with eServices for the collection of court filing fees." },

  // Slide 25, row "Security Improvements". The deck writes one F5 Shape
  // description covering both F5 Shape bars, and one PCI DSS description
  // covering both compliance bars, so each pair carries the same words.
  { name: "F5 Shape - Exploration", category: "eServices", subCategory: "Security Improvements",
    objective: "F5 Shape: Enhance security for eServices and reduce fraudulent payments." },
  { name: "F5 Shape Implementation", category: "eServices", subCategory: "Security Improvements",
    objective: "F5 Shape: Enhance security for eServices and reduce fraudulent payments." },
  { name: "F5 Distributed Cloud Client-Side Defense \u2013 PCI DSS 4.0 Compliance", category: "eServices", subCategory: "Security Improvements",
    objective: "PCI DCC Compliance 4.0: Update to security standards designed to protect cardholder data and enhance payment security including F5 Distributed Cloud Services." },
  { name: "Approved Scanning Vendor (ASV) External Passing Scan \u2013 PCI DSS 4.0 Compliance", category: "eServices", subCategory: "Security Improvements",
    objective: "PCI DCC Compliance 4.0: Update to security standards designed to protect cardholder data and enhance payment security including F5 Distributed Cloud Services." },
  { name: "Adobe Commerce Upgrade 2.4.6-p11", category: "eServices", subCategory: "Security Improvements" },

  // Slide 25, row "Administration and Reporting"
  { name: "Product Import/Export Functionality", category: "eServices", subCategory: "Administration and Reporting",
    objective: "Product Import/Export Functionality: Allows administrators to export products from one environment and import into another environment. Reduces the time required to ensure that all products are configured a similar way across environments." },
  { name: "Quantum Metric Pilot", category: "eServices", subCategory: "Administration and Reporting" },
  { name: "Financial Reporting from Data Services", category: "eServices", subCategory: "Administration and Reporting",
    objective: "Financial Reporting from Data Services: Move eServices financial reporting from Adobe Commerce to the data warehouse / Metabase thereby improving performance of eServices." }
];

// Same contract as the other two importers.
function applyEservicesDeckStructure(list) {
  const byName = new Map(ESERVICES_DECK_PROJECTS.map(entry => [entry.name, entry]));
  list.forEach(project => {
    const entry = byName.get(project.name);
    if (!entry || project.unit !== "Alberta Payments") return;
    project.subUnit = entry.category;
    project.subCategory = entry.subCategory;
    if (entry.objective) project.objective = entry.objective;
  });
  return list;
}

// ---------------------------------------------------------------------------
// Alberta Wallet structure taken from the same September 2025 Platforms
// Roadmap deck, slides 19 to 21. Slide 19 names the section, slide 20 carries
// the timeline with three labelled rows, and slide 21 gives the initiative and
// the per-deliverable descriptions.
//
// As with UIAM, a project appears here only because the deck puts a bar on that
// row, and a description is set only where the deck writes one for that
// deliverable. The rest keep the objective they already carry.
//
// Two things the deck does that are worth recording rather than guessing at:
// the "Wallet" row carries no bars at all, and the row shows a Go-live marker
// in Aug-Sep 2025 whose label sits outside its bar and which slide 21 lists no
// deliverable for, so it is not turned into a project here.
// ---------------------------------------------------------------------------
const WALLET_DECK_PAGES = {
  "Alberta Wallet": {
    slides: [19, 20, 21],
    initiative: "Mobile Wallet",
    description: "The Moblie Wallet will allow users to store digital credentials in a cloud wallet and access from a mobile application or on their Alberta.ca Account.",
    rowDescriptions: {
      "Account App": "Expansion of account features: Creation of new features such as notifications, and simple services"
    }
  }
};

const WALLET_DECK_PROJECTS = [
  // Slide 20, row "Wallet & Credentials"
  { name: "Release Candidate 1", category: "Alberta Wallet", subCategory: "Wallet & Credentials",
    objective: "Release Candidate 1: Release of functioning mobile application integrated with MyHealth Records to issue the mobile health card." },
  { name: "Mobile Health Card", category: "Alberta Wallet", subCategory: "Wallet & Credentials" },
  { name: "Target Launch August 7", category: "Alberta Wallet", subCategory: "Wallet & Credentials" },
  { name: "RC 2", category: "Alberta Wallet", subCategory: "Wallet & Credentials",
    objective: "Release Candidate 2: Second release to update design, and add support for Apple and Google Wallet, and enhanced login support." },
  { name: "mDL Planning and Governance", category: "Alberta Wallet", subCategory: "Wallet & Credentials",
    objective: "mDL Planning and Governance: Establishment of new project for mDL implementation with SARTR, TI, and Health." },
  { name: "mDL Implementation", category: "Alberta Wallet", subCategory: "Wallet & Credentials",
    objective: "mDL Implementation: Implementation of mDL into Mobile Wallet." },
  { name: "Credential Intake & Expansion", category: "Alberta Wallet", subCategory: "Wallet & Credentials",
    objective: "Credential Expansion: Implementation of other credentials into the Mobile Wallet with ministry partners - potentially divers registration, teaching certificates." },

  // Slide 20, row "Account App"
  { name: "Application Discovery", category: "Alberta Wallet", subCategory: "Account App" },
  { name: "Application Features expansion", category: "Alberta Wallet", subCategory: "Account App",
    objective: "Expansion of account features: Creation of new features such as notifications, and simple services." }
];

// Same contract as the UIAM importer: matches on the project name inside its
// own branch unit, only ever fills the unit, category and description, and
// never touches dates, status, progress or anything else already recorded.
function applyWalletDeckStructure(list) {
  const byName = new Map(WALLET_DECK_PROJECTS.map(entry => [entry.name, entry]));
  list.forEach(project => {
    const entry = byName.get(project.name);
    if (!entry || project.unit !== "Alberta Wallet and Credentials") return;
    project.subUnit = entry.category;
    project.subCategory = entry.subCategory;
    if (entry.objective) project.objective = entry.objective;
  });
  return list;
}

const LEGACY_PRIVACY_PORTAL = [
  "Phase 1.0 PIB - Personal Information Bank",
  "Phase 2.1 Unified Messaging Service",
  "Phase 3.0 Discovery",
  "Phase 3.0 Development"
];

const PRIVACY_PORTAL_PROJECT = {
  id: 1200,
  name: "Privacy Portal",
  code: "PP",
  team: "Team 3",
  unit: "Platforms Operations",
  subUnit: "Privacy Portal",
  owner: "Chad Bostock",
  objective: "The privacy portal will give Albertans access to details on how their personal information is being used.",
  status: "In-flight",
  progress: 39,
  start: "2025-01-01",
  end: "2026-09-30",
  risk: "Medium",
  priority: "Medium",
  approxCost: 0,
  scheduleVariance: 0,
  milestone: "Target completion",
  milestoneDate: "2026-09-30",
  memberNames: ["Chad Bostock", "Edson Roopnarine"],
  members: ["CB", "ER"],
  phases: [
    { name: "Phase 1.0 PIB - Personal Information Bank", start: "2025-01-01", end: "2025-04-30", status: "Completed" },
    { name: "Phase 2.0 Design and Enhancements", start: "", end: "", status: "Planned" },
    { name: "Phase 2.1 UMS", start: "2025-10-01", end: "2026-09-30", status: "In-flight" },
    { name: "Phase 3.0 Discovery and development", start: "2025-04-01", end: "2026-03-31", status: "Pause" }
  ]
};

// The five records under Unified Messaging Service - Discovery, Alpha, Build
// and Configure, Implementation and Testing, Launch - are the stages of one
// project, the way Privacy Portal's phases are. They collapse into a single
// project holding them as phases.
//
// Nothing here is typed in: every value is read off the five records being
// replaced. The dates are their earliest start and latest end, the phases keep
// each record's own name, dates and status, a phase keeps its own description
// where it differs from the project's, and the two figures that cannot be read
// directly are derived and said so below. Idempotent, and it only matches
// records sitting in that unit.
const LEGACY_UMS = ["Discovery", "Alpha", "Build and Configure", "Implementation and Testing", "Launch"];
const UMS_UNIT = "Unified Identity and Access Management";
const UMS_SUB_UNIT = "Unified Messaging Service";

function isLegacyUmsStage(project) {
  return LEGACY_UMS.includes(project.name) && project.unit === UMS_UNIT && project.subUnit === UMS_SUB_UNIT;
}

function consolidateUnifiedMessaging(list) {
  const stages = list.filter(isLegacyUmsStage);
  if (!stages.length) return list;
  const kept = list.filter(project => !isLegacyUmsStage(project));
  if (kept.some(project => project.name === UMS_SUB_UNIT && project.subUnit === UMS_SUB_UNIT)) return kept;
  const ordered = [...stages].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  // The objective the stages agree on is the project's; a stage that carries a
  // different one keeps it as its own description rather than losing it.
  const shared = ordered.map(stage => stage.objective).sort((a, b) =>
    ordered.filter(s => s.objective === b).length - ordered.filter(s => s.objective === a).length)[0] || "";
  // Derived, because no record states it for the project as a whole: the
  // project is in the state the stage under way is in.
  const live = ordered.filter(stage => stage.status === "In-flight");
  const status = live.length ? "In-flight"
    : ordered.every(stage => stage.status === "Completed") ? "Completed"
    : first.status;
  const phases = ordered.map(stage => ({
    name: stage.name,
    start: stage.start || "",
    end: stage.end || "",
    status: stage.status,
    progress: phaseProgressValue(stage.progress),
    objective: stage.objective === shared ? "" : stage.objective || ""
  }));
  // The phases carry their own progress, so the project's is their average.
  const progress = phaseProgressRollup(phases);
  const project = {
    ...first,
    name: UMS_SUB_UNIT,
    objective: shared,
    status,
    progress,
    start: ordered.reduce((earliest, stage) => stage.start && stage.start < earliest ? stage.start : earliest, first.start),
    end: ordered.reduce((latest, stage) => stage.end && stage.end > latest ? stage.end : latest, first.end),
    milestoneDate: last.end || first.milestoneDate,
    approxCost: ordered.reduce((sum, stage) => sum + (Number(stage.approxCost) || 0), 0),
    phases
  };
  const at = list.findIndex(isLegacyUmsStage);
  const index = kept.length && at >= 0 ? Math.min(at, kept.length) : kept.length;
  kept.splice(index, 0, normalizeProjectUnit(project));
  return kept;
}

let teamDirectory = loadTeams();
let projects = loadProjects();
let activeView = "projects";
let activeLayout = "table";
let query = "";
let statusFilter = "all";
let teamFilter = "all";
let unitFilter = "all";
let ownerFilter = "all";
let riskFilter = "all";
let goalFilter = "all";
let focusSet = null;
let roadmapSort = "schedule";
let roadmapQuarter = fiscalQuarterOf(AS_OF_DATE);
let roadmapFullYear = false;
let roadmapDeckWindow = false;
let selectedFiscalYear = getFiscalYear(AS_OF_DATE);
let reportTeam = "all";
let reportStatus = "all";
let reportPeriod = "quarter";
let teamQuery = "";
let teamHealthFilter = "all";
let teamPendingDeletion = null;
let projectTeamTouched = false;
let collapsedUnits = loadCollapsedUnits();
let teamBeingEdited = null;
let resourceQuery = "";
let resourceRoleFilter = "all";
let resourceTeamFilter = "all";
let resourceBeingEdited = null;
let resourcePendingDeletion = null;
let projectBeingEdited = null;
let projectPendingDeletion = null;
let pendingProjectImports = [];
let drawerState = null;

const drilldownDefinitions = {
  active: { title: "Active projects", description: "All initiatives currently represented in the portfolio.", icon: "folder-kanban", filter: () => true },
  healthy: { title: "On-track delivery", description: "Initiatives progressing within their agreed delivery tolerance.", icon: "circle-check", filter: project => statusGroups.healthy.includes(project.status) },
  attention: { title: "Projects needing attention", description: "Initiatives with material schedule or delivery risk.", icon: "triangle-alert", filter: project => statusGroups.attention.includes(project.status) },
  progress: { title: "Portfolio progress", description: "Progress distribution across all active initiatives.", icon: "gauge", filter: () => true },
  nearing: { title: "Nearing completion", description: "Initiatives at or above 75% overall completion.", icon: "badge-check", filter: project => project.progress >= 75 },
  planned: { title: "Planned initiatives", description: "Approved work not yet in delivery - planned, next, or later.", icon: "calendar-clock", filter: project => statusGroups.upcoming.includes(project.status) },
  milestones: { title: "Upcoming milestones", description: "Portfolio milestones scheduled after the current reporting date.", icon: "flag", filter: project => new Date(project.milestoneDate) >= new Date(AS_OF_ISO) }
};

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  loginForm: document.querySelector("#loginForm"),
  appShell: document.querySelector("#appShell"),
  metrics: document.querySelector("#metricsGrid"),
  healthRing: document.querySelector("#healthRing"),
  healthScore: document.querySelector("#healthScore"),
  healthLegend: document.querySelector("#healthLegend"),
  attentionList: document.querySelector("#attentionList"),
  attentionCount: document.querySelector("#attentionCount"),
  capacityChart: document.querySelector("#capacityChart"),
  capacityValue: document.querySelector("#capacityValue"),
  capacityLegend: document.querySelector("#capacityLegend"),
  capacityNote: document.querySelector("#capacityNote"),
  projectCount: document.querySelector("#projectCount"),
  tableBody: document.querySelector("#projectTableBody"),
  cardLayout: document.querySelector("#cardLayout"),
  tableLayout: document.querySelector("#tableLayout"),
  emptyState: document.querySelector("#emptyState"),
  projectDetail: document.querySelector("#projectDetailContent"),
  timeline: document.querySelector("#timeline"),
  projectTimeline: document.querySelector("#projectTimeline"),
  timelineLayout: document.querySelector("#timelineLayout"),
  boardLayout: document.querySelector("#boardLayout"),
  roadmapSummary: document.querySelector("#roadmapSummary"),
  milestoneList: document.querySelector("#milestoneList"),
  reportKpis: document.querySelector("#reportKpis"),
  reportHighLevel: document.querySelector("#reportHighLevelDetails"),
  reportStatusChart: document.querySelector("#reportStatusChart"),
  reportRiskMatrix: document.querySelector("#reportRiskMatrix"),
  teamReport: document.querySelector("#teamReport"),
  reportMilestones: document.querySelector("#reportMilestones"),
  reportTableBody: document.querySelector("#reportTableBody"),
  reportProjectCount: document.querySelector("#reportProjectCount"),
  teamMetrics: document.querySelector("#teamMetrics"),
  teamGrid: document.querySelector("#teamGrid"),
  teamDirectoryCount: document.querySelector("#teamDirectoryCount"),
  teamEmptyState: document.querySelector("#teamEmptyState"),
  resourceMetrics: document.querySelector("#resourceMetrics"),
  resourceGrid: document.querySelector("#resourceGrid"),
  resourceDirectoryCount: document.querySelector("#resourceDirectoryCount"),
  resourceEmptyState: document.querySelector("#resourceEmptyState"),
  modal: document.querySelector("#projectModal"),
  form: document.querySelector("#projectForm"),
  teamModal: document.querySelector("#teamModal"),
  teamForm: document.querySelector("#teamForm"),
  deleteTeamModal: document.querySelector("#deleteTeamModal"),
  resourceModal: document.querySelector("#resourceModal"),
  resourceForm: document.querySelector("#resourceForm"),
  deleteResourceModal: document.querySelector("#deleteResourceModal"),
  deleteProjectModal: document.querySelector("#deleteProjectModal"),
  templateLibraryModal: document.querySelector("#templateLibraryModal"),
  templateUploadModal: document.querySelector("#templateUploadModal"),
  drawer: document.querySelector("#detailDrawer"),
  drawerBackdrop: document.querySelector("#drawerBackdrop"),
  toast: document.querySelector("#toast")
};

function loadAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function displayNameFromEmail(email) {
  const localName = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return localName.split(/\s+/).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join(" ") || "Workspace User";
}

function applyAuthState(session) {
  const authenticated = Boolean(session?.email);
  document.body.classList.toggle("authenticated", authenticated);
  document.body.classList.toggle("auth-pending", !authenticated);
  elements.loginScreen.setAttribute("aria-hidden", String(authenticated));
  elements.appShell.setAttribute("aria-hidden", String(!authenticated));
  if (!authenticated) return;
  const displayName = session.name || displayNameFromEmail(session.email);
  document.querySelector("#userDisplayName").textContent = displayName;
  document.querySelector("#menuUserName").textContent = displayName;
  document.querySelector("#menuUserEmail").textContent = session.email;
  document.querySelector("#userInitials").textContent = initials(displayName);
}

let loginMode = "signin";

async function signInWithServer(email, password, name) {
  const error = document.querySelector("#loginError");
  error.textContent = "";
  if (!email || !password) {
    error.textContent = "Enter your email address and password.";
    return;
  }
  const submit = document.querySelector(".login-submit");
  submit.disabled = true;
  try {
    if (loginMode === "register") {
      const created = await api("POST", "/api/auth/register", { email, password, name: (name || "").trim() });
      workspace.user = created.user;
      workspace.list = [{ ...created.workspace, member_count: 1 }];
      applyAuthState({ email: created.user.email, name: created.user.name });
      elements.loginForm.reset();
      // A new account's workspace starts empty, so this browser's portfolio
      // becomes its starting point rather than being lost.
      await openWorkspace(created.workspace.id, { adoptLocal: true });
      showToast(`Account created. "${created.workspace.name}" is now shared from the server.`);
    } else {
      const session = await api("POST", "/api/auth/login", { email, password });
      workspace.user = session.user;
      applyAuthState({ email: session.user.email, name: session.user.name });
      elements.loginForm.reset();
      const me = await api("GET", "/api/me");
      workspace.list = me.workspaces || [];
      workspace.unread = me.unread || 0;
      const chosen = workspace.list[0];
      if (chosen) await openWorkspace(chosen.id, { adoptLocal: true });
      else renderWorkspaceBar();
      await refreshNotifications();
      showToast(`Signed in as ${session.user.name}`);
    }
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
}

function setLoginMode(mode) {
  loginMode = mode;
  const registering = mode === "register";
  document.querySelector("#loginTitle").textContent = registering ? "Create your account" : "Welcome back";
  document.querySelector("#loginIntro").textContent = registering
    ? "Your account is what lets colleagues share this portfolio with you."
    : "Sign in to access portfolio operations.";
  document.querySelector("#loginNameField").classList.toggle("hidden", !registering);
  document.querySelector("#loginModeSwitch").textContent = registering ? "I already have an account" : "Create an account instead";
  document.querySelector(".login-submit span").textContent = registering ? "Create account" : "Sign in";
  document.querySelector("#loginError").textContent = "";
  const password = elements.loginForm.elements.password;
  password.placeholder = registering ? "At least 8 characters" : "Enter your password";
  password.setAttribute("autocomplete", registering ? "new-password" : "current-password");
}

// The login screen says which kind of sign-in it is offering, so nobody types a
// real password into a browser-only copy or a four-digit one into a server.
// An account still on the password it was created with is called out, with the
// means to change it, rather than the app staying quiet about it.
function renderDefaultPasswordNotice() {
  const host = document.querySelector("#defaultPasswordNotice");
  if (!host) return;
  const show = Boolean(workspace.user?.password_is_default);
  host.classList.toggle("hidden", !show);
  if (!show) return;
  host.innerHTML = `${iconMarkup("shield-alert")}<span><strong>This account still uses the default workspace password.</strong> Anyone who knows it can sign in as you. Change it under Settings - Workspace.</span><button class="secondary-button" id="openPasswordSettings" type="button">Change it</button>`;
  refreshIcons();
}

async function changeWorkspacePassword() {
  const current = document.querySelector("#currentPasswordInput").value;
  const next = document.querySelector("#newPasswordInput").value;
  const status = document.querySelector("#passwordStatus");
  if (next.length < 8) {
    status.textContent = "Use a password of at least 8 characters.";
    return;
  }
  try {
    const result = await api("POST", "/api/auth/password", { current, password: next });
    workspace.user = { ...workspace.user, password_is_default: result.stillDefault };
    document.querySelector("#currentPasswordInput").value = "";
    document.querySelector("#newPasswordInput").value = "";
    status.textContent = result.stillDefault
      ? "Saved, but that is still the default password."
      : "Password changed. Other sessions signed out.";
    renderDefaultPasswordNotice();
    renderWorkspacePanel();
    showToast("Password changed");
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderLoginMode() {
  const line = document.querySelector("#loginModeLine");
  const switcher = document.querySelector("#loginModeSwitch");
  const password = elements.loginForm.elements.password;
  if (!line) return;
  if (workspace.available) {
    line.innerHTML = `${iconMarkup("cloud")}<span>Accounts are held on the server, so a workspace can be shared with colleagues. The default workspace password is <code>12345678</code> - change it once you are in.</span>`;
    switcher.classList.remove("hidden");
    password.minLength = 8;
    password.removeAttribute("inputmode");
    password.placeholder = loginMode === "register" ? "At least 8 characters" : "Enter your password";
  } else {
    line.innerHTML = `${iconMarkup("hard-drive")}<span>This copy has no server, so everything stays in this browser. Any email address works with the default workspace password <code>12345678</code>.</span>`;
    switcher.classList.add("hidden");
    password.minLength = 8;
    password.removeAttribute("inputmode");
  }
  refreshIcons();
}

async function signOutEverywhere() {
  if (workspace.available && workspace.user) {
    try { await api("POST", "/api/auth/logout"); } catch { /* the local sign-out still happens */ }
  }
  leaveWorkspace();
  workspace.user = null;
  workspace.list = [];
  workspace.notifications = [];
  workspace.unread = 0;
  logOff();
  renderLoginMode();
  renderWorkspaceBar();
}

function signIn(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.loginForm));
  const email = data.email.trim().toLowerCase();
  const error = document.querySelector("#loginError");
  // With a server present, the account is real and the server decides. The
  // local four-digit password only ever applies to a browser-only copy.
  if (workspace.available) {
    signInWithServer(email, data.password, data.name);
    return;
  }
  if (!email || data.password !== DEFAULT_PASSWORD) {
    error.textContent = "The email address or password is incorrect.";
    return;
  }
  const session = { email, name: displayNameFromEmail(email), signedInAt: new Date().toISOString() };
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  (data.remember ? localStorage : sessionStorage).setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  error.textContent = "";
  applyAuthState(session);
  elements.loginForm.reset();
  showToast(`Signed in as ${session.name}`);
}

function logOff() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  document.querySelector("#userMenu").hidden = true;
  document.querySelector("#userMenuButton").setAttribute("aria-expanded", "false");
  closeDrawer();
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  applyAuthState(null);
  elements.loginForm.elements.email.focus();
}

function consolidatePrivacyPortal(list) {
  const hasLegacy = list.some(project => LEGACY_PRIVACY_PORTAL.includes(project.name));
  if (!hasLegacy) return list;
  const kept = list.filter(project => !LEGACY_PRIVACY_PORTAL.includes(project.name));
  if (kept.some(project => project.name === PRIVACY_PORTAL_PROJECT.name)) return kept;
  const at = list.findIndex(project => LEGACY_PRIVACY_PORTAL.includes(project.name));
  const index = kept.length && at >= 0 ? Math.min(at, kept.length) : kept.length;
  kept.splice(index, 0, normalizeProjectUnit({ ...PRIVACY_PORTAL_PROJECT, phases: PRIVACY_PORTAL_PROJECT.phases.map(phase => ({ ...phase })) }));
  return kept;
}

function loadProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.projects));
    return applyLmsDeckStructure(applyCraDeckStructure(applyPaymentsDeckStructure(applyEservicesDeckStructure(applyWalletDeckStructure(applyUiamDeckStructure(consolidateUnifiedMessaging(consolidatePrivacyPortal((Array.isArray(saved) ? saved : seedProjects).map(normalizeProjectUnit))))))))).map(normalizeProjectAlignment);
  } catch {
    return applyLmsDeckStructure(applyCraDeckStructure(applyPaymentsDeckStructure(applyEservicesDeckStructure(applyWalletDeckStructure(applyUiamDeckStructure(consolidateUnifiedMessaging(consolidatePrivacyPortal(seedProjects.map(normalizeProjectUnit))))))))).map(normalizeProjectAlignment);
  }
}

function normalizeProjectUnit(project) {
  const { code: _legacyCode, ...projectWithoutCode } = project;
  const aliased = legacyUnitAliases[project.unit] || project.unit;
  const [aliasUnit, aliasSub] = aliased.split("::");
  const unit = projectUnits.includes(aliasUnit) ? aliasUnit : projectUnits[0];
  // A renamed category is mapped before it is validated below, otherwise a
  // record stored under the old name would be cleared instead of renamed.
  if (legacyCategoryAliases[unit]?.[project.subUnit]) project.subUnit = legacyCategoryAliases[unit][project.subUnit];
  const team = directoryTeamNames().includes(project.team) ? project.team : defaultTeamForUnit(unit);
  const phases = Array.isArray(project.phases)
    ? project.phases
        .filter(phase => phase && typeof phase.name === "string" && phase.name.trim())
        .map(phase => ({
          name: phase.name.trim(),
          start: phase.start || "",
          end: phase.end || "",
          objective: typeof phase.objective === "string" ? phase.objective.trim() : "",
          progress: phaseProgressValue(phase.progress),
          status: projectStatuses.includes(phase.status) ? phase.status : projectStatuses[0]
        }))
    : [];
  const candidateSub = project.subUnit || aliasSub || "";
  const subUnit = subCategoriesFor(unit).includes(candidateSub) ? candidateSub : "";
  const rolled = phaseProgressRollup(phases);
  const progress = rolled === null ? project.progress : rolled;
  return { ...projectWithoutCode, code: initials(project.name), unit, team, subUnit, phases, progress };
}

function directoryTeamNames() {
  return teamDirectory.map(team => team.name);
}

function defaultTeamForUnit(unit) {
  const names = directoryTeamNames();
  const preferred = unitTeamAssignments[unit];
  return names.includes(preferred) ? preferred : names[0] || preferred;
}

function phaseRowMarkup(phase = {}) {
  const options = projectStatuses.map(status => `<option${status === phase.status ? " selected" : ""}>${status}</option>`).join("");
  return `<fieldset class="phase-row">
    <legend>Phase</legend>
    <label class="phase-field phase-name-field">Name<input class="phase-name" maxlength="60" value="${(phase.name || "").replace(/"/g, "&quot;")}" placeholder="e.g. Discovery"></label>
    <label class="phase-field phase-start-field">Start<input class="phase-start" type="date" value="${phase.start || ""}"></label>
    <label class="phase-field phase-end-field">End<input class="phase-end" type="date" value="${phase.end || ""}"></label>
    <label class="phase-field phase-status-field">Status<select class="phase-status">${options}</select></label>
    <label class="phase-field phase-progress-field">This phase's progress <small>%</small><input class="phase-progress" type="number" min="0" max="100" value="${hasPhaseProgress(phase) ? phase.progress : ""}" placeholder="-"></label>
    <button class="phase-remove" data-remove-phase type="button" aria-label="Remove this phase" title="Remove this phase">${iconMarkup("trash-2")}</button>
    <label class="phase-field phase-objective-field">Description <small>optional</small><input class="phase-objective" maxlength="400" value="${(phase.objective || "").replace(/"/g, "&quot;")}" placeholder="What this phase covers"></label>
  </fieldset>`;
}

function renderPhaseRows(phases) {
  document.querySelector("#phaseRows").innerHTML = (phases || []).map(phase => phaseRowMarkup(phase)).join("");
  updatePhaseEmptyState();
  refreshIcons();
}

// This field is the project's overall progress, never a phase's, and a project
// with phases now says so: once the phases record progress it states their
// combined average and stops taking a typed value, and before that it says
// where a phase's own figure belongs. A project without phases is unchanged.
function updateProgressRollupNote() {
  const note = document.querySelector("#progressRollupNote");
  const field = elements.form.elements.progress;
  const phases = readPhaseRows();
  const rolled = phaseProgressRollup(phases);
  if (!phases.length) {
    field.readOnly = false;
    note.hidden = true;
    note.textContent = "";
    return;
  }
  note.hidden = false;
  if (rolled === null) {
    // No phase has a figure, so there is nothing to average and this stays the
    // project's own number, typed here as it always was.
    field.readOnly = false;
    note.className = "phase-rollup-note phase-rollup-hint";
    note.textContent = `This is the whole project. Enter a figure in a phase's own "This phase's progress" box below and this becomes their combined average instead.`;
    return;
  }
  // Once the phases carry figures they own this number, so it is read from them
  // rather than typed - that is what "the combined average of all phases" means.
  field.value = rolled;
  field.readOnly = true;
  note.className = "phase-rollup-note";
  note.textContent = `Combined average of the ${phases.length} phases below: ${rolled}%. Clear the phase figures to set this by hand again.`;
}

function updatePhaseEmptyState() {
  const count = document.querySelectorAll("#phaseRows .phase-row").length;
  document.querySelector("#phaseEmpty").hidden = count > 0;
  updateProgressRollupNote();
}

function readPhaseRows() {
  return [...document.querySelectorAll("#phaseRows .phase-row")]
    .map(row => ({
      name: row.querySelector(".phase-name").value.trim(),
      start: row.querySelector(".phase-start").value,
      end: row.querySelector(".phase-end").value,
      objective: row.querySelector(".phase-objective").value.trim(),
      progress: phaseProgressValue(row.querySelector(".phase-progress").value),
      status: row.querySelector(".phase-status").value
    }))
    .filter(phase => phase.name)
    .map(phase => ({ ...phase, status: projectStatuses.includes(phase.status) ? phase.status : projectStatuses[0] }));
}

function populateProjectUnitOptions(selected) {
  const select = elements.form.elements.unit;
  select.innerHTML = projectUnits.map(unit => `<option>${unit}</option>`).join("");
  if (projectUnits.includes(selected)) select.value = selected;
}

// Both levels use the same control: the existing names, then a final entry
// that turns the dropdown into a place to name something new. The declared and
// the workspace's own names are shown in separate groups so it is clear which
// came from the roadmap deck and which this workspace added.
const ADD_NEW_VALUE = "__add_new__";

function taxonomySelectMarkup(declared, custom, selected) {
  const option = name => `<option${name === selected ? " selected" : ""}>${name}</option>`;
  return `<option value="">None</option>`
    + (declared.length ? `<optgroup label="From the roadmap deck">${declared.map(option).join("")}</optgroup>` : "")
    + (custom.length ? `<optgroup label="Added in this workspace">${custom.map(option).join("")}</optgroup>` : "")
    + `<option value="${ADD_NEW_VALUE}">+ Add a name that is not listed...</option>`;
}

function populateProjectSubUnitOptions(unit, selected) {
  const declared = unitSubCategories[unit] || [];
  const custom = customUnitsFor(unit);
  const options = [...declared, ...custom];
  const select = elements.form.elements.subUnit;
  select.innerHTML = taxonomySelectMarkup(declared, custom, options.includes(selected) ? selected : "");
  select.value = options.includes(selected) ? selected : "";
  // The control always shows now: even a branch unit with no units of its own
  // needs the way to add the first one.
  document.querySelector("#subUnitField").hidden = false;
  closeTaxonomyAdder("unit");
}

// The sub-category list depends on the category, so it is repopulated whenever
// the category changes and hidden when the chosen category has none.
function populateProjectSubCategoryOptions(unit, category, selected) {
  const declared = categorySubCategories[`${unit}::${category}`] || [];
  const custom = customCategoriesFor(unit, category);
  // A value the project already carries is offered even when the list has
  // forgotten it, so opening and saving the form cannot erase it.
  const orphan = selected && ![...declared, ...custom].includes(selected) ? [selected] : [];
  const options = [...declared, ...custom, ...orphan];
  const select = elements.form.elements.subCategory;
  select.innerHTML = taxonomySelectMarkup(declared, [...custom, ...orphan], options.includes(selected) ? selected : "");
  select.value = options.includes(selected) ? selected : "";
  // A category only makes sense under a unit, so the control appears once one
  // is chosen - and then it offers adding the first category too.
  document.querySelector("#subCategoryField").hidden = !category;
  closeTaxonomyAdder("category");
}

// --- naming something the dropdown does not have -------------------------

function taxonomyAdderFor(level) {
  return document.querySelector(level === "unit" ? "#newUnitRow" : "#newCategoryRow");
}

function closeTaxonomyAdder(level) {
  const row = taxonomyAdderFor(level);
  if (!row) return;
  row.classList.add("hidden");
  row.querySelector("input").value = "";
  row.querySelector(".taxonomy-add-error").textContent = "";
}

function openTaxonomyAdder(level) {
  const row = taxonomyAdderFor(level);
  if (!row) return;
  row.classList.remove("hidden");
  const input = row.querySelector("input");
  input.focus();
  input.select();
}

// Adding commits the name to this workspace's list and selects it, so the
// project being filled in lands under it immediately.
function commitTaxonomyName(level) {
  const row = taxonomyAdderFor(level);
  const input = row.querySelector("input");
  const error = row.querySelector(".taxonomy-add-error");
  const branchUnit = elements.form.elements.unit.value;
  const name = input.value.trim();
  const reason = level === "unit"
    ? addCustomUnit(branchUnit, name)
    : addCustomCategory(branchUnit, elements.form.elements.subUnit.value, name);
  if (reason) {
    error.textContent = reason;
    input.focus();
    return;
  }
  if (level === "unit") {
    populateProjectSubUnitOptions(branchUnit, name);
    populateProjectSubCategoryOptions(branchUnit, name, "");
  } else {
    populateProjectSubCategoryOptions(branchUnit, elements.form.elements.subUnit.value, name);
  }
  populateTeamFilters();
  showToast(`"${name}" added to this workspace's ${level === "unit" ? "units" : "categories"}`);
}

// Choosing the "add a name" entry opens the field; choosing anything else
// closes it, so the form never holds the placeholder value.
function handleTaxonomySelect(level, select) {
  if (select.value === ADD_NEW_VALUE) {
    select.value = "";
    openTaxonomyAdder(level);
    return true;
  }
  closeTaxonomyAdder(level);
  return false;
}

function populateProjectTeamOptions(selected) {
  const names = directoryTeamNames();
  elements.form.elements.team.innerHTML = names.map(name => `<option>${name}</option>`).join("");
  if (names.includes(selected)) elements.form.elements.team.value = selected;
}

function saveProjects() {
  localStorage.setItem(STORAGE.projects, JSON.stringify(projects));
  pushRecords("projects", (() => projects)(), "the portfolio");
}

function loadTeams() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.teams));
    return (Array.isArray(saved) ? saved : seedTeams).map(normalizeTeamRoles);
  } catch {
    return seedTeams.map(normalizeTeamRoles);
  }
}

function normalizeTeamRoles(team) {
  if (team.roles) {
    const roles = Object.fromEntries(teamRoleFields.map(([, label]) => [label, team.roles[label] || ""]));
    return { ...team, roles };
  }
  const members = team.members?.length ? team.members : [team.lead];
  const roles = Object.fromEntries(teamRoleFields.map(([, label], index) => [label, index === 0 ? team.lead : members[index % members.length]]));
  return { ...team, roles };
}

function saveTeams() {
  localStorage.setItem(STORAGE.teams, JSON.stringify(teamDirectory));
  pushRecords("teams", (() => teamDirectory)(), "the team directory");
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "--";
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function slug(value) {
  return value.toLowerCase().replaceAll(" ", "-");
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en-US", options).format(new Date(`${value}T12:00:00`));
}

function formatCurrency(value) {
  if (!Number.isFinite(Number(value))) return "Not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
}

function normalizeTemplateDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && window.XLSX?.SSF) {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

async function buildProjectIntakeTemplate() {
  if (!window.ExcelJS) throw new Error("Excel template library is unavailable.");
  const workbook = new window.ExcelJS.Workbook();
  workbook.creator = "Platforms Branch";
  workbook.title = "Platforms Branch Project Intake Template";
  workbook.subject = "Project and roadmap bulk intake";
  workbook.created = AS_OF_DATE;

  const instructions = workbook.addWorksheet("Instructions", { properties: { tabColor: { argb: "FFE0B96B" } } });
  const instructionRows = [
    ["Platforms Branch Project Intake Template", ""],
    ["Instructions", "Complete one project per row on the Project Intake sheet. Keep the column names unchanged."],
    ["Required fields", "All fields except Contributors."],
    ["Pick lists", "Team, Unit, Status, Progress, Priority, and Risk Level provide approved dropdown options."],
    ["Team", "Select Team 1 through Team 10 from the dropdown."],
    ["Progress", "Select progress from 0% through 100% in 5% increments."],
    ["Dates", "Enter Start Date and Target Date in MM/DD/YYYY format, for example 09/10/2026. Milestone Date must fall within the project timeline."],
    ["Approx. Cost", "Enter a dollar amount greater than or equal to zero."],
    ["Schedule Variance", "Required whole number from -365 through 365 days. Use 0 when the project is on baseline."],
    ["Project matching", "An existing Project Name updates that record; a new name creates a project."],
    ["Contributors", "Optional. Separate full names with commas."],
    ["Fiscal Year", "Fiscal years run April 1 through March 31."]
  ];
  instructions.addRows(instructionRows);
  instructions.columns = [{ width: 24 }, { width: 110 }];
  instructions.mergeCells("A1:B1");
  instructions.getCell("A1").font = { bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  instructions.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF263A32" } };
  instructions.getCell("A1").alignment = { vertical: "middle" };
  instructions.getRow(1).height = 32;
  instructions.eachRow((row, number) => {
    if (number > 1) { row.getCell(1).font = { bold: true, color: { argb: "FF176B53" } }; row.getCell(2).alignment = { wrapText: true, vertical: "top" }; }
  });
  const intake = workbook.addWorksheet("Project Intake", { views: [{ state: "frozen", ySplit: 1 }], properties: { tabColor: { argb: "FF176B53" } } });
  intake.addRow(projectTemplateColumns);
  intake.columns = projectTemplateColumns.map((header, index) => ({ header, key: `field${index}`, width: [30, 18, 24, 22, 55, 15, 15, 15, 15, 13, 14, 24, 25, 38, 25, 16][index] }));
  intake.autoFilter = "A1:P1000";
  intake.getRow(1).height = 30;
  intake.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176B53" } }; cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; });
  intake.getCell("E1").note = "Start Date: enter a valid date in MM/DD/YYYY format, for example 09/10/2026.";
  intake.getCell("F1").note = "Target Date: enter a valid date in MM/DD/YYYY format. It must be after Start Date.";

  const listValidation = (values, title) => ({ type: "list", allowBlank: false, formulae: [`"${values.join(",")}"`], showErrorMessage: true, errorTitle: `Invalid ${title}`, error: `Select a ${title.toLowerCase()} from the dropdown list.`, showInputMessage: true, promptTitle: title, prompt: `Choose an approved ${title.toLowerCase()}.` });
  const dateValidation = title => ({ type: "date", operator: "between", allowBlank: false, formulae: [new Date(2000, 0, 1), new Date(2100, 11, 31)], showErrorMessage: true, errorTitle: `Invalid ${title}`, error: "Enter a valid Excel date between 2000 and 2100.", showInputMessage: true, promptTitle: title, prompt: "Select or enter a valid date." });
  const textValidation = (title, maximum, allowBlank = false) => ({ type: "textLength", operator: "between", allowBlank, formulae: [allowBlank ? 0 : 1, maximum], showErrorMessage: true, errorTitle: `Invalid ${title}`, error: `${title} must contain no more than ${maximum} characters.`, showInputMessage: true, promptTitle: title, prompt: allowBlank ? `Optional; enter up to ${maximum} characters.` : `Enter up to ${maximum} characters.` });
  for (let row = 2; row <= 1000; row += 1) {
    intake.getCell(`A${row}`).dataValidation = textValidation("Project Name", 60);
    intake.getCell(`B${row}`).dataValidation = listValidation(directoryTeamNames(), "Team");
    intake.getCell(`C${row}`).dataValidation = listValidation(projectUnits, "Branch Unit");
    intake.getCell(`D${row}`).dataValidation = textValidation("Owner", 40);
    intake.getCell(`E${row}`).dataValidation = textValidation("Objective", 180);
    ["F", "G"].forEach(column => { intake.getCell(`${column}${row}`).numFmt = "mm/dd/yyyy"; intake.getCell(`${column}${row}`).dataValidation = dateValidation(column === "F" ? "Start Date" : "Target Date"); });
    intake.getCell(`P${row}`).numFmt = "yyyy-mm-dd";
    intake.getCell(`P${row}`).dataValidation = dateValidation("Milestone Date");
    intake.getCell(`H${row}`).dataValidation = listValidation(projectStatuses, "Status");
    intake.getCell(`I${row}`).dataValidation = listValidation(Array.from({ length: 21 }, (_, index) => index * 5), "Progress (%)");
    intake.getCell(`J${row}`).dataValidation = listValidation(["High", "Medium", "Low"], "Priority");
    intake.getCell(`K${row}`).dataValidation = listValidation(["Low", "Medium", "High"], "Risk Level");
    intake.getCell(`L${row}`).numFmt = "$#,##0";
    intake.getCell(`L${row}`).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: false, formulae: [0], showErrorMessage: true, errorTitle: "Invalid Cost", error: "Approx. Cost must be zero or greater.", showInputMessage: true, promptTitle: "Approx. Cost in dollars", prompt: "Enter a dollar value of zero or greater." };
    intake.getCell(`M${row}`).dataValidation = { type: "whole", operator: "between", allowBlank: false, formulae: [-365, 365], showErrorMessage: true, errorTitle: "Invalid Variance", error: "Schedule Variance is required and must be between -365 and 365 days.", showInputMessage: true, promptTitle: "Schedule Variance", prompt: "Enter -365 to 365; use 0 when on baseline." };
    intake.getCell(`N${row}`).dataValidation = textValidation("Contributors", 160, true);
    intake.getCell(`O${row}`).dataValidation = textValidation("Milestone Name", 50);
  }

  const example = workbook.addWorksheet("Example", { properties: { tabColor: { argb: "FF36709B" } } });
  example.addRow(projectTemplateColumns);
  example.addRow(["Customer journey optimization", "Team 1", "Web Services", "Alex Morgan", "Reduce customer effort across priority journeys.", new Date(2026, 9, 1), new Date(2027, 1, 28), "Planned", 5, "High", "Medium", 350000, 0, "Jamie Lee, Taylor Singh", "Pilot launch", new Date(2026, 11, 15)]);
  example.columns = intake.columns.map(column => ({ width: column.width }));
  example.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF36709B" } }; });
  ["F2", "G2"].forEach(address => { example.getCell(address).numFmt = "mm/dd/yyyy"; });
  example.getCell("P2").numFmt = "yyyy-mm-dd";
  example.getCell("L2").numFmt = "$#,##0";
  return workbook;
}

async function downloadProjectTemplate() {
  const buttons = [document.querySelector("#downloadProjectTemplate"), document.querySelector("#downloadProjectTemplateFooter")];
  buttons.forEach(button => { button.disabled = true; });
  try {
    const workbook = await buildProjectIntakeTemplate();
    const buffer = await workbook.xlsx.writeBuffer();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    link.download = "platforms-branch-project-intake-template.xlsx";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("Project intake template downloaded");
  } catch (error) {
    showToast(error.message);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function openTemplateLibrary() {
  document.querySelector("#templateFieldList").innerHTML = projectTemplateColumns.map((field, index) => `<span><b>${String(index + 1).padStart(2, "0")}</b>${field}</span>`).join("");
  elements.templateLibraryModal.showModal();
  refreshIcons();
}

function templateRowToProject(row, rowNumber) {
  const errors = [];
  const required = projectTemplateColumns.filter(column => column !== "Contributors");
  required.forEach(column => { if (row[column] === undefined || String(row[column]).trim() === "") errors.push(`${column} is required`); });
  const name = String(row["Project Name"] || "").trim();
  const status = String(row.Status || "").trim();
  const priority = String(row.Priority || "").trim();
  const risk = String(row["Risk Level"] || "").trim();
  const progress = Number(row["Progress (%)"]);
  const approxCost = Number(row["Approx. Cost in dollars"]);
  const scheduleVarianceValue = row["Schedule Variance (days)"];
  const scheduleVariance = scheduleVarianceValue === undefined || scheduleVarianceValue === "" ? 0 : Number(scheduleVarianceValue);
  const start = normalizeTemplateDate(row["Start Date"]);
  const end = normalizeTemplateDate(row["Target Date"]);
  const milestoneDate = normalizeTemplateDate(row["Milestone Date"]);
  if (!directoryTeamNames().includes(String(row.Team || "").trim())) errors.push("Team must match a team in the team directory");
  if (!projectUnits.includes(String(row.Unit || "").trim())) errors.push("Unit must be selected from the approved list");
  if (!projectStatuses.includes(status)) errors.push("Status is invalid");
  if (!["High", "Medium", "Low"].includes(priority)) errors.push("Priority is invalid");
  if (!["High", "Medium", "Low"].includes(risk)) errors.push("Risk Level is invalid");
  if (!Number.isFinite(progress) || progress < 0 || progress > 100 || progress % 5 !== 0) errors.push("Progress must be between 0 and 100 in 5% increments");
  if (!Number.isFinite(approxCost) || approxCost < 0) errors.push("Approx. Cost must be zero or greater");
  if (!Number.isFinite(scheduleVariance)) errors.push("Schedule Variance must be a number");
  if (!start || !end || !milestoneDate) errors.push("Dates must use a valid date format");
  if (start && end && new Date(end) <= new Date(start)) errors.push("Target Date must be after Start Date");
  if (start && end && milestoneDate && (new Date(milestoneDate) < new Date(start) || new Date(milestoneDate) > new Date(end))) errors.push("Milestone Date must fall within the project timeline");
  if (errors.length) return { rowNumber, errors };
  const contributorNames = String(row.Contributors || "").split(",").map(name => name.trim()).filter(Boolean);
  const owner = String(row.Owner).trim();
  const memberNames = [owner, ...contributorNames.filter(name => name.toLowerCase() !== owner.toLowerCase())];
  return { rowNumber, project: { name, code: initials(name), team: String(row.Team).trim(), unit: String(row.Unit).trim(), owner, objective: String(row.Objective).trim(), start, end, status, progress, priority, risk, approxCost, scheduleVariance, milestone: String(row["Milestone Name"]).trim(), milestoneDate, members: memberNames.map(initials), memberNames } };
}

async function readProjectTemplate(file) {
  pendingProjectImports = [];
  const validation = document.querySelector("#templateValidation");
  const preview = document.querySelector("#templatePreview");
  const importButton = document.querySelector("#importProjectTemplate");
  try {
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = workbook.Sheets["Project Intake"];
    if (!sheet) throw new Error('The workbook must contain a sheet named "Project Intake".');
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" }).filter(row => Object.values(row).some(value => String(value).trim()));
    if (!rows.length) throw new Error("The Project Intake sheet does not contain any project rows.");
    const parsed = rows.map((row, index) => templateRowToProject(row, index + 2));
    const invalid = parsed.filter(item => item.errors);
    if (invalid.length) throw new Error(invalid.slice(0, 3).map(item => `Row ${item.rowNumber}: ${item.errors.join("; ")}`).join(" | "));
    pendingProjectImports = parsed.map(item => item.project);
    document.querySelector("#templateFileName").textContent = file.name;
    document.querySelector("#templateImportSummary").textContent = `${pendingProjectImports.length} valid ${pendingProjectImports.length === 1 ? "project" : "projects"} ready to import`;
    document.querySelector("#templatePreviewBody").innerHTML = pendingProjectImports.slice(0, 5).map(project => `<tr><td>${project.name}</td><td>${project.unit}</td><td>${project.team}</td><td>${project.status}</td></tr>`).join("");
    preview.classList.remove("hidden");
    validation.className = "template-validation valid";
    validation.innerHTML = `${iconMarkup("circle-check")}<span>Template validated successfully.</span>`;
    importButton.disabled = false;
  } catch (error) {
    preview.classList.add("hidden");
    validation.className = "template-validation invalid";
    validation.innerHTML = `${iconMarkup("circle-alert")}<span>${error.message}</span>`;
    importButton.disabled = true;
  }
  refreshIcons();
}

function openTemplateUpload() {
  pendingProjectImports = [];
  document.querySelector("#projectTemplateFile").value = "";
  document.querySelector("#templatePreview").classList.add("hidden");
  document.querySelector("#templateValidation").className = "template-validation";
  document.querySelector("#templateValidation").innerHTML = `${iconMarkup("info")}<span>No file selected.</span>`;
  document.querySelector("#importProjectTemplate").disabled = true;
  elements.templateUploadModal.showModal();
  refreshIcons();
}

function importProjectTemplate() {
  let created = 0;
  let updated = 0;
  pendingProjectImports.forEach(projectData => {
    const existing = projects.find(project => project.name.toLowerCase() === projectData.name.toLowerCase());
    if (existing) { Object.assign(existing, projectData); updated += 1; }
    else { projects.push({ id: Date.now() + created, ...projectData }); created += 1; }
  });
  saveProjects();
  elements.templateUploadModal.close();
  pendingProjectImports = [];
  populateTeamFilters();
  populateFiscalYearFilters();
  renderAll();
  switchView("projects");
  showToast(`${created} created, ${updated} updated from template`);
}

function getFiscalYear(date) {
  return date.getMonth() >= 3 ? date.getFullYear() + 1 : date.getFullYear();
}

const FISCAL_QUARTERS = [
  { quarter: 1, months: "Apr-Jun" },
  { quarter: 2, months: "Jul-Sep" },
  { quarter: 3, months: "Oct-Dec" },
  { quarter: 4, months: "Jan-Mar" }
];

function fiscalQuarterOf(date) {
  return Math.floor(((date.getMonth() - 3 + 12) % 12) / 3);
}

function fiscalQuarterBounds(index, year = selectedFiscalYear) {
  const start = new Date(year - 1, 3 + index * 3, 1, 12);
  const end = new Date(start.getFullYear(), start.getMonth() + 3, 0, 12);
  return { start, end };
}

function quarterBands(range, currentIndex = roadmapQuarter) {
  return FISCAL_QUARTERS.map((entry, index) => {
    const bounds = fiscalQuarterBounds(index);
    const from = bounds.start > range.start ? bounds.start : range.start;
    const to = bounds.end < range.end ? bounds.end : range.end;
    const days = Math.round((to - from) / DAY) + 1;
    return { ...entry, days, current: index === currentIndex };
  }).filter(band => band.days > 0);
}

// The deck labels its axis in fiscal quarters - Q4 FY24/25 for Jan to Mar 2025
// and so on - so the app reports the same notation. Both are derived from the
// project's own dates, so they can never drift from the timeline.
function fiscalQuarterLabel(date) {
  const year = getFiscalYear(date);
  return `Q${fiscalQuarterOf(date) + 1} FY${String(year - 1).slice(-2)}/${String(year).slice(-2)}`;
}

function fiscalSpanLabel(project) {
  if (!project.start || !project.end) return "Not dated";
  const from = fiscalQuarterLabel(new Date(`${project.start}T12:00:00`));
  const to = fiscalQuarterLabel(new Date(`${project.end}T12:00:00`));
  return from === to ? from : `${from} - ${to}`;
}

function fiscalYearLabel(year) {
  return `FY${String(year).slice(-2)}`;
}

function fiscalYearBounds(year = selectedFiscalYear) {
  const start = new Date(year - 1, 3, 1, 12);
  const end = new Date(year, 2, 31, 12);
  return { start, end, duration: end - start };
}

function projectOverlapsFiscalYear(project, year = selectedFiscalYear) {
  const { start, end } = fiscalYearBounds(year);
  return new Date(`${project.end}T12:00:00`) >= start && new Date(`${project.start}T12:00:00`) <= end;
}

// Completed work stays in the portfolio whatever year it finished in. A
// project that ended in a previous fiscal year is still part of the record of
// what the branch delivered, so the year filter never removes it - it only
// decides what the timeline's axis covers.
function getFiscalProjects() {
  return projects.filter(project => project.status === "Completed" || projectOverlapsFiscalYear(project));
}

function iconMarkup(name) {
  return `<i data-lucide="${name}"></i>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

// The Projects section owns portfolio scope. Every other view derives from this
// predicate so a filter set on Projects is reflected wherever the data appears.
// "none" is a real answer here: it finds the initiatives no goal claims yet.
function matchesGoalFilter(project) {
  if (goalFilter === "none") return !project.goalIds.length;
  return project.goalIds.includes(Number(goalFilter));
}

function goalFilterLabel() {
  if (goalFilter === "none") return "Not linked to a goal";
  const goal = (roadmapStrategy.goals || []).find(item => item.id === Number(goalFilter));
  return goal ? goal.title : "All goals";
}

function matchesProjectScope(project) {
  const normalized = query.trim().toLowerCase();
  const matchesQuery = !normalized
    || [project.name, project.owner, project.team, project.unit, project.subUnit].some(value => (value || "").toLowerCase().includes(normalized));
  return matchesQuery
    && (statusFilter === "all" || matchesStatusFilter(project))
    && (teamFilter === "all" || project.team === teamFilter)
    && (unitFilter === "all" || matchesUnitFilter(project))
    && (ownerFilter === "all" || project.owner === ownerFilter)
    && (riskFilter === "all" || project.risk === riskFilter)
    && (goalFilter === "all" || matchesGoalFilter(project))
    && (!focusSet || focusSet.ids.has(project.id));
}

function activeProjectScope() {
  const parts = [];
  if (statusFilter !== "all") parts.push({ label: "Status", value: statusFilterLabel() });
  if (teamFilter !== "all") parts.push({ label: "Team", value: teamFilter });
  if (unitFilter !== "all") {
    // The one control filters three levels, so the strip says which one.
    parts.push(unitFilter.startsWith("sub2:")
      ? { label: "Category", value: unitFilter.slice(5).split("::").slice(1).join(" / ") }
      : unitFilter.startsWith("sub:")
        ? { label: "Unit", value: unitFilter.slice(4).split("::")[1] }
        : { label: "Branch Unit", value: unitFilter });
  }
  if (ownerFilter !== "all") parts.push({ label: "Owner", value: ownerFilter });
  if (riskFilter !== "all") parts.push({ label: "Risk", value: riskFilter });
  if (goalFilter !== "all") parts.push({ label: "Goal", value: goalFilterLabel() });
  if (focusSet) parts.push({ label: "Behind", value: `${focusSet.label}${focusSet.note ? ` - ${focusSet.note}` : ""}` });
  if (query.trim()) parts.push({ label: "Search", value: query.trim() });
  return parts;
}

function clearProjectScope() {
  statusFilter = "all";
  teamFilter = "all";
  unitFilter = "all";
  ownerFilter = "all";
  riskFilter = "all";
  goalFilter = "all";
  focusSet = null;
  query = "";
  document.querySelector("#globalSearch").value = "";
  populateTeamFilters();
  document.querySelector("#statusFilter").value = "all";
  document.querySelector("#riskFilter").value = "all";
  document.querySelector("#goalFilter").value = "all";
  renderProjects();
  if (activeView === "roadmap") renderRoadmap();
}

// The Projects section is the register: it lists every project the filters
// allow, whatever fiscal year it runs in. The year governs the timeline's axis
// and the year-scoped figures, not whether a project exists. Twice now a
// project has been reported missing when it was only in another year - a
// completed one behind, and a planned one ahead - so the year no longer hides
// anything from the list. Each row states its own FY and quarter.
function getFilteredProjects() {
  return projects.filter(matchesProjectScope);
}

function renderMetrics() {
  const fiscalProjects = getFiscalProjects();
  const total = fiscalProjects.length;
  const teamCount = new Set(fiscalProjects.map(project => project.team)).size;
  const onTrack = fiscalProjects.filter(project => statusGroups.healthy.includes(project.status)).length;
  const atRisk = fiscalProjects.filter(project => statusGroups.attention.includes(project.status)).length;
  const average = total ? Math.round(fiscalProjects.reduce((sum, project) => sum + project.progress, 0) / total) : 0;
  const metrics = [
    { key: "active", label: "Active projects", value: total, change: "+2 this cycle", caption: `Across ${teamCount} delivery ${teamCount === 1 ? "team" : "teams"}`, icon: "folder-kanban", color: "#176b53", tint: "#dceee7" },
    { key: "healthy", label: "On track", value: onTrack, change: `${Math.round(onTrack / total * 100)}% healthy`, caption: "Stable delivery confidence", icon: "circle-check", color: "#36709b", tint: "#e2edf5" },
    { key: "attention", label: "Needs attention", value: atRisk, change: "1 escalated", caption: "Risk or schedule variance", icon: "triangle-alert", color: "#c44e4e", tint: "#f8e2e2", down: true },
    { key: "progress", label: "Average progress", value: `${average}%`, change: "+6%", caption: "Since last portfolio review", icon: "gauge", color: "#c78218", tint: "#fbefd8" }
  ];
  elements.metrics.innerHTML = metrics.map(metric => `
    <button class="metric-card drilldown-card" data-drilldown="${metric.key}" type="button" style="--metric-color:${metric.color};--metric-tint:${metric.tint}" aria-label="Drill down into ${metric.label}">
      <div class="metric-top"><span>${metric.label}</span><span class="metric-icon">${iconMarkup(metric.icon)}</span></div>
      <div class="metric-value"><strong>${metric.value}</strong><span class="metric-change ${metric.down ? "down" : ""}">${metric.change}</span></div>
      <div class="metric-caption">${metric.caption}<span class="drilldown-hint">View details ${iconMarkup("chevron-right")}</span></div>
    </button>`).join("");
}

function renderHealth() {
  const fiscalProjects = getFiscalProjects();
  const counts = {};
  projectStatuses.forEach(status => { counts[status] = fiscalProjects.filter(project => project.status === status).length; });
  const share = statuses => fiscalProjects.length ? Math.round(statuses.reduce((sum, status) => sum + counts[status], 0) / fiscalProjects.length * 100) : 0;
  const healthyPercent = share(statusGroups.healthy);
  const riskPercent = share(["At risk", "Pause"]);
  elements.healthScore.textContent = `${healthyPercent}%`;
  elements.healthRing.style.setProperty("--health", `${healthyPercent}%`);
  elements.healthRing.style.setProperty("--risk", `${riskPercent}%`);
  const legendStatuses = projectStatuses.filter(status => counts[status] > 0);
  elements.healthLegend.innerHTML = (legendStatuses.length ? legendStatuses : ["On track", "At risk", "Off track", "Planned"])
    .map(status => [status, counts[status], statusLegendColors[status]])
    .map(item => `<div class="legend-row"><i style="background:${item[2]}"></i><span>${item[0]}</span><strong>${item[1]}</strong></div>`).join("");
}

function attentionTone(status) {
  return status === "Off track" ? "" : "amber";
}

function attentionIcon(status) {
  if (status === "Off track") return "triangle-alert";
  return status === "Pause" ? "circle-pause" : "clock-3";
}

function attentionCopy(status) {
  if (status === "Off track") return "Critical launch blocker";
  return status === "Pause" ? "Paused - awaiting a restart decision" : "Timeline needs review";
}

function renderAttention() {
  const attention = getFiscalProjects().filter(project => statusGroups.attention.includes(project.status));
  elements.attentionCount.textContent = attention.length;
  elements.attentionList.innerHTML = attention.map(project => `
    <div class="attention-item">
      <span class="attention-icon ${attentionTone(project.status)}">${iconMarkup(attentionIcon(project.status))}</span>
      <div><strong>${project.name}</strong><small>${attentionCopy(project.status)} - ${project.owner}</small></div>
      <button class="icon-button subtle open-project" data-id="${project.id}" type="button" aria-label="Open ${project.name}">${iconMarkup("arrow-up-right")}</button>
    </div>`).join("");
}

function focusProjectsOnBand(bandKey, unit) {
  const band = bandByKey(bandKey);
  if (!band) return;
  statusFilter = `band:${band.key}`;
  if (unit) unitFilter = unit;
  populateTeamFilters();
  if (activeView !== "projects") switchView("projects");
  renderProjects();
  document.querySelector("#allProjectsSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(unit ? `${band.label} in ${unit}` : `Filtered to ${band.label}`);
}

function renderCapacity() {
  const fiscalProjects = getFiscalProjects();
  const units = projectUnits
    .map(unit => {
      const unitProjects = fiscalProjects.filter(project => project.unit === unit);
      return {
        unit,
        total: unitProjects.length,
        counts: unitMixBands.map(band => unitProjects.filter(project => band.statuses.includes(project.status)).length)
      };
    })
    .filter(row => row.total)
    .sort((a, b) => b.total - a.total);

  elements.capacityValue.textContent = `${fiscalProjects.length}`;
  elements.capacityChart.innerHTML = units.length
    ? units.map(row => {
        const segments = unitMixBands.map((band, index) => row.counts[index]
          ? `<button class="unit-mix-seg" data-mix-band="${band.key}" data-mix-unit="${row.unit}" data-tip-count="${row.counts[index]}" data-tip-label="${band.label}" type="button" style="width:${row.counts[index] / row.total * 100}%;--bar-color:${band.color}" aria-label="${band.label}, ${row.counts[index]} ${row.counts[index] === 1 ? "project" : "projects"} in ${row.unit}. Filter the project list."><span class="unit-mix-tip" aria-hidden="true"><i class="unit-mix-tip-pointer"></i><strong>${row.counts[index]}</strong>${band.label}</span></button>`
          : "").join("");
        return `<div class="capacity-row"><span class="unit-mix-label" title="${row.unit}">${row.unit}</span><div class="unit-mix-track">${segments}</div><strong>${row.total}</strong></div>`;
      }).join("")
    : `<p class="unit-mix-empty">No projects in this fiscal year yet.</p>`;

  elements.capacityLegend.innerHTML = unitMixBands
    .map((band, index) => ({ band, total: units.reduce((sum, row) => sum + row.counts[index], 0) }))
    .filter(entry => entry.total)
    .map(entry => `<button class="unit-mix-legend-item" data-mix-band="${entry.band.key}" type="button" title="Filter the project list to ${entry.band.label}" aria-label="Filter the project list to ${entry.band.label}, ${entry.total} ${entry.total === 1 ? "project" : "projects"}"><i style="background:${entry.band.color}"></i>${entry.band.label} ${entry.total}</button>`)
    .join("");

  const attentionLeader = units
    .map(row => ({ unit: row.unit, count: row.counts[1] }))
    .filter(row => row.count)
    .sort((a, b) => b.count - a.count)[0];
  elements.capacityNote.textContent = attentionLeader
    ? `${attentionLeader.unit} carries the most exposure - ${attentionLeader.count} ${attentionLeader.count === 1 ? "project needs" : "projects need"} attention.`
    : units.length
      ? "No unit currently has a project needing attention."
      : "Add a project to see the unit mix.";
}

function teamCapacityLevel(capacity) {
  if (capacity >= 90) return { key: "near-capacity", label: "Near capacity", color: "#c44e4e" };
  if (capacity >= 70) return { key: "balanced", label: "Balanced", color: "#176b53" };
  return { key: "available", label: "Available", color: "#36709b" };
}

function assignedTeamProjects(team) {
  return projects.filter(project => project.team === team.name);
}

function reconcileTeamProjectIds() {
  teamDirectory.forEach(team => { team.projectIds = assignedTeamProjects(team).map(project => project.id); });
}

function getResources() {
  return teamDirectory.flatMap(team => resourceRoles.map(role => ({ id: `${team.id}-${slug(role)}`, name: team.roles?.[role] || "", role, teamId: team.id, teamName: team.name, allocation: team.resourceMeta?.[role]?.allocation ?? (team.roles?.[role] ? team.capacity : 0), availability: team.resourceMeta?.[role]?.availability ?? (team.roles?.[role] ? "Allocated" : "Available") })).filter(resource => resource.name));
}

function getFilteredResources() {
  const normalized = resourceQuery.trim().toLowerCase();
  return getResources().filter(resource => (!normalized || [resource.name, resource.role, resource.teamName].some(value => value.toLowerCase().includes(normalized))) && (resourceRoleFilter === "all" || resource.role === resourceRoleFilter) && (resourceTeamFilter === "all" || resource.teamId === Number(resourceTeamFilter)));
}

function getFilteredTeams() {
  const normalized = teamQuery.trim().toLowerCase();
  return teamDirectory.filter(team => {
    const level = teamCapacityLevel(team.capacity);
    const matchesQuery = !normalized || [team.name, team.specialty, team.lead, ...Object.values(team.roles || {})].some(value => value.toLowerCase().includes(normalized));
    return matchesQuery && (teamHealthFilter === "all" || level.key === teamHealthFilter);
  });
}

function populateResourceFilters() {
  const roleOptions = `<option value="all">All resource roles</option>${resourceRoles.map(role => `<option value="${role}">${role}</option>`).join("")}`;
  const teamOptions = `<option value="all">All teams</option>${teamDirectory.map(team => `<option value="${team.id}">${team.name}</option>`).join("")}`;
  document.querySelector("#resourceRoleFilter").innerHTML = roleOptions;
  document.querySelector("#resourceTeamFilter").innerHTML = teamOptions;
  elements.resourceForm.elements.resourceRole.innerHTML = resourceRoles.map(role => `<option value="${role}">${role}</option>`).join("");
  elements.resourceForm.elements.assignedTeam.innerHTML = teamDirectory.map(team => `<option value="${team.id}">${team.name}</option>`).join("");
  document.querySelector("#resourceRoleFilter").value = resourceRoleFilter;
  document.querySelector("#resourceTeamFilter").value = resourceTeamFilter;
}

function renderResources() {
  populateResourceFilters();
  const resources = getResources();
  const filtered = getFilteredResources();
  const assignedTeams = new Set(resources.map(resource => resource.teamId)).size;
  const allocated = resources.filter(resource => resource.availability === "Allocated").length;
  const available = resources.filter(resource => resource.availability === "Available").length;
  const averageAllocation = resources.length ? Math.round(resources.reduce((sum, resource) => sum + resource.allocation, 0) / resources.length) : 0;
  const metrics = [["Assigned resources", resources.length, "contact-round", "#176b53", "#dceee7", `Across ${assignedTeams} teams`], ["Standard roles", resourceRoles.length, "briefcase-business", "#36709b", "#e2edf5", "Enterprise delivery taxonomy"], ["Average allocation", `${averageAllocation}%`, "gauge", "#c78218", "#fbefd8", "Across assigned resources"], ["Available", available, "user-round-check", "#176b53", "#dceee7", `${allocated} currently allocated`]];
  elements.resourceMetrics.innerHTML = metrics.map(metric => `<article class="team-metric"><span class="team-metric-icon" style="--team-color:${metric[3]};--team-tint:${metric[4]}">${iconMarkup(metric[2])}</span><div><span>${metric[0]}</span><strong>${metric[1]}</strong><small>${metric[5]}</small></div></article>`).join("");
  document.querySelector("#resourceTotalBadge").textContent = resources.length;
  elements.resourceDirectoryCount.textContent = `(${filtered.length})`;
  const grouped = teamDirectory
    .map(team => ({ team, items: filtered.filter(resource => resource.teamId === team.id) }))
    .filter(group => group.items.length);
  elements.resourceGrid.innerHTML = grouped.map(group => `<section class="resource-team-group"><div class="resource-group-heading"><h3>${group.team.name}</h3><span>${group.items.length} ${group.items.length === 1 ? "resource" : "resources"}</span></div><div class="resource-group-grid">${group.items.map(resource => `<article class="resource-card"><button class="resource-card-main" data-open-resource="${resource.id}" type="button" aria-label="Open ${resource.name} details"><div class="resource-card-head"><span class="avatar">${initials(resource.name)}</span><span class="resource-availability availability-${slug(resource.availability)}">${resource.availability}</span></div><h3>${resource.name}</h3><div class="resource-card-details"><div class="resource-detail-row resource-role-line"><span class="resource-detail-icon">${iconMarkup("briefcase-business")}</span><span><small>Role</small><strong>${resource.role}</strong></span></div><div class="resource-detail-row resource-team-line"><span class="resource-detail-icon">${iconMarkup("users")}</span><span><small>Resource team</small><strong>${resource.teamName}</strong></span></div></div><div class="resource-view-link"><span>View details</span>${iconMarkup("arrow-right")}</div><div class="team-capacity-label"><span>Allocation</span><strong>${resource.allocation}%</strong></div><div class="capacity-track"><span style="width:${resource.allocation}%;--bar-color:${resource.allocation >= 90 ? "#c44e4e" : "#176b53"}"></span></div></button><div class="resource-card-actions"><button class="resource-modify-button" data-modify-resource="${resource.id}" type="button">${iconMarkup("pencil")} Modify</button><button class="resource-delete-button" data-delete-resource="${resource.id}" type="button">${iconMarkup("trash-2")} Delete</button></div></article>`).join("")}</div></section>`).join("");
  const empty = filtered.length === 0;
  elements.resourceGrid.classList.toggle("hidden", empty);
  elements.resourceEmptyState.classList.toggle("hidden", !empty);
  refreshIcons();
}

function findResource(resourceId) {
  return getResources().find(resource => resource.id === resourceId);
}

function renderResourceDrawer(resourceId) {
  const resource = findResource(resourceId);
  if (!resource) return;
  const team = teamDirectory.find(item => item.id === resource.teamId);
  drawerState = { level: "resource", resourceId, parent: { level: "view", view: "resources" } };
  elements.drawer.innerHTML = `<div class="drawer-header resource-drawer-header"><div class="drawer-header-top"><button class="drawer-back" data-drawer-back type="button">${iconMarkup("arrow-left")} Resource directory</button><button class="icon-button close-drawer" type="button" aria-label="Close resource details">${iconMarkup("x")}</button></div><span class="team-drawer-number">${resource.role}</span><h2 id="drawerTitle">${resource.name}</h2><p>${resource.teamName} resource assignment</p></div><div class="drawer-body"><div class="drawer-stat-grid"><div class="drawer-stat"><span>Role</span><strong>${resource.role}</strong></div><div class="drawer-stat"><span>Allocation</span><strong>${resource.allocation}%</strong></div><div class="drawer-stat"><span>Status</span><strong>${resource.availability}</strong></div></div><section class="drawer-section"><h3>Team alignment</h3><button class="resource-team-link" data-resource-team="${resource.teamId}" type="button"><span class="team-number">${String(resource.teamId).padStart(2, "0")}</span><span><strong>${resource.teamName}</strong><small>View team role accountability</small></span>${iconMarkup("arrow-right")}</button></section><section class="drawer-section"><h3>Allocation</h3><div class="capacity-track team-drawer-capacity"><span style="width:${resource.allocation}%;--bar-color:${resource.allocation >= 90 ? "#c44e4e" : "#176b53"}"></span></div></section></div>${drawerReturnFooter("resource directory")}`;
  elements.drawer.querySelector(".drawer-return-footer").insertAdjacentHTML("afterbegin", `<button class="drawer-delete-button" data-delete-resource="${resource.id}" type="button">${iconMarkup("trash-2")} Delete</button>`);
  openDrawer();
}

function recomputeTeamMembers(team) {
  team.lead = team.roles["Product Owner"] || "";
  team.members = [...new Set(Object.values(team.roles).filter(Boolean))];
  if (team.specialty === "Cross-functional Delivery") team.headcount = team.members.length;
}

function renderTeams() {
  const filtered = getFilteredTeams();
  const members = teamDirectory.reduce((sum, team) => sum + team.headcount, 0);
  const averageCapacity = Math.round(teamDirectory.reduce((sum, team) => sum + team.capacity, 0) / teamDirectory.length);
  const allocatedProjects = new Set(teamDirectory.flatMap(team => team.projectIds)).size;
  const nearCapacity = teamDirectory.filter(team => team.capacity >= 90).length;
  const metrics = [
    ["Operating teams", teamDirectory.length, "users", "#176b53", "#dceee7", "Across the delivery organization"],
    ["Team members", members, "user-round-check", "#36709b", "#e2edf5", "Planned delivery headcount"],
    ["Average capacity", `${averageCapacity}%`, "gauge", "#c78218", "#fbefd8", "Current allocation this cycle"],
    ["Near capacity", nearCapacity, "triangle-alert", "#c44e4e", "#f8e2e2", `${allocatedProjects} portfolio projects allocated`]
  ];
  elements.teamMetrics.innerHTML = metrics.map(metric => `<article class="team-metric"><span class="team-metric-icon" style="--team-color:${metric[3]};--team-tint:${metric[4]}">${iconMarkup(metric[2])}</span><div><span>${metric[0]}</span><strong>${metric[1]}</strong><small>${metric[5]}</small></div></article>`).join("");
  document.querySelector("#teamTotalBadge").textContent = teamDirectory.length;
  elements.teamDirectoryCount.textContent = `(${filtered.length})`;
  elements.teamGrid.innerHTML = filtered.map(team => {
    const level = teamCapacityLevel(team.capacity);
    const assigned = assignedTeamProjects(team);
    const cardRoles = [["Product Owner", team.roles["Product Owner"]], ["Lead", team.roles["Dev Lead"]]];
    const leadership = cardRoles.map(([role, member]) => `<div class="team-card-role ${member ? "" : "unassigned"}"><span class="avatar">${initials(member || "")}</span><span><small>${role}</small><strong>${member || "Unassigned"}</strong></span></div>`).join("");
    return `<article class="team-card"><button class="team-card-main" data-team-id="${team.id}" type="button" aria-label="Open ${team.name} details"><div class="team-card-top"><span class="team-number">${String(team.id).padStart(2, "0")}</span><span class="capacity-state capacity-${level.key}">${level.label}</span></div><h3>${team.name}</h3><p>${team.specialty}</p><div class="team-card-roles">${leadership}</div><div class="team-capacity-label"><span>Capacity allocation</span><strong>${team.capacity}%</strong></div><div class="capacity-track"><span style="width:${team.capacity}%;--bar-color:${level.color}"></span></div></button><div class="team-card-footer"><span>${iconMarkup("users")} ${team.headcount} ${team.headcount === 1 ? "member" : "members"}</span><span>${iconMarkup("folder-kanban")} ${assigned.length} ${assigned.length === 1 ? "project" : "projects"}</span><button class="team-modify-button" data-modify-team="${team.id}" type="button">${iconMarkup("pencil")} Modify</button><button class="team-open-button" data-team-id="${team.id}" type="button" aria-label="Open ${team.name}">${iconMarkup("arrow-up-right")}</button></div></article>`;
  }).join("");
  const empty = filtered.length === 0;
  elements.teamGrid.classList.toggle("hidden", empty);
  elements.teamEmptyState.classList.toggle("hidden", !empty);
  refreshIcons();
}

function renderTeamDrawer(teamId) {
  const team = teamDirectory.find(item => item.id === Number(teamId));
  if (!team) return;
  const level = teamCapacityLevel(team.capacity);
  const assigned = assignedTeamProjects(team);
  drawerState = { level: "team", teamId: team.id, parent: { level: "view", view: "team" } };
  const roster = team.roles ? Object.entries(team.roles).map(([role, member]) => `<div class="${member ? "" : "unassigned"}"><span class="avatar">${initials(member || "")}</span><span><strong>${member || "Unassigned"}</strong><small>${role}</small></span></div>`).join("") : team.members.map((member, index) => `<div><span class="avatar">${initials(member)}</span><span><strong>${member}</strong><small>${index === 0 ? "Team lead" : team.specialty}</small></span></div>`).join("");
  elements.drawer.innerHTML = `<div class="drawer-header team-drawer-header"><div class="drawer-header-top"><button class="drawer-back" data-drawer-back type="button">${iconMarkup("arrow-left")} Team directory</button><button class="icon-button close-drawer" type="button" aria-label="Close team details">${iconMarkup("x")}</button></div><span class="team-drawer-number">Team ${String(team.id).padStart(2, "0")}</span><h2 id="drawerTitle">${team.name}</h2><p>${team.specialty}</p></div><div class="drawer-body"><div class="drawer-stat-grid"><div class="drawer-stat"><span>Product owner</span><strong>${team.lead || "Unassigned"}</strong></div><div class="drawer-stat"><span>Members</span><strong>${team.headcount}</strong></div><div class="drawer-stat"><span>Capacity</span><strong>${team.capacity}%</strong></div></div><section class="drawer-section"><div class="drawer-progress-label"><strong>Allocation status</strong><span class="capacity-state capacity-${level.key}">${level.label}</span></div><div class="capacity-track team-drawer-capacity"><span style="width:${team.capacity}%;--bar-color:${level.color}"></span></div></section><section class="drawer-section"><h3>${team.roles ? "Role accountability" : "Core roster"}</h3><div class="team-roster">${roster}</div></section><section class="drawer-section"><div class="drawer-list-heading"><h3>Assigned projects</h3><span>${assigned.length} active allocation${assigned.length === 1 ? "" : "s"}</span></div><div class="drawer-project-list">${assigned.map((project, index) => `<button class="drawer-project-card open-project" data-id="${project.id}" type="button"><span class="project-icon ${colors[index % colors.length]}">${project.code}</span><span><strong>${project.name}</strong><small>${project.status} · ${project.progress}% complete</small><span class="mini-progress"><i style="width:${project.progress}%"></i></span></span><span class="drawer-project-meta">${iconMarkup("chevron-right")}</span></button>`).join("") || `<div class="drawer-empty">No projects currently allocated.</div>`}</div></section></div>${drawerReturnFooter("team directory")}`;
  elements.drawer.querySelector(".drawer-return-footer").insertAdjacentHTML("afterbegin", `<button class="drawer-delete-button" data-delete-team="${team.id}" type="button">${iconMarkup("trash-2")} Delete team</button>`);
  openDrawer();
}

function openDeleteTeamModal(teamId) {
  const team = teamDirectory.find(item => item.id === Number(teamId));
  if (!team) return;
  teamPendingDeletion = team.id;
  const assignedCount = assignedTeamProjects(team).length;
  document.querySelector("#deleteTeamName").textContent = team.name;
  document.querySelector("#deleteTeamImpact").textContent = `This will permanently remove ${team.name}, its ${team.headcount} member roster, and team role assignments. ${assignedCount} assigned ${assignedCount === 1 ? "project remains" : "projects remain"} unchanged.`;
  elements.deleteTeamModal.showModal();
  refreshIcons();
}

function deleteSelectedTeam() {
  const team = teamDirectory.find(item => item.id === teamPendingDeletion);
  if (!team) return;
  teamDirectory = teamDirectory.filter(item => item.id !== team.id);
  const orphaned = projects.filter(project => project.team === team.name);
  orphaned.forEach(project => {
    project.team = defaultTeamForUnit(project.unit);
    const receiving = teamDirectory.find(item => item.name === project.team);
    if (receiving && !receiving.projectIds.includes(project.id)) receiving.projectIds.push(project.id);
  });
  saveTeams();
  if (orphaned.length) saveProjects();
  elements.deleteTeamModal.close();
  closeDrawer();
  populateTeamFilters();
  renderAll();
  renderTeams();
  showToast(orphaned.length
    ? `${team.name} removed - ${orphaned.length} ${orphaned.length === 1 ? "project" : "projects"} reassigned`
    : `${team.name} removed from the team directory`);
  teamPendingDeletion = null;
}

function projectRow(project, index) {
  return `<tr class="project-select-row" data-project-page="${project.id}" tabindex="0" aria-label="Open ${project.name} details">
    <td><div class="project-name"><span class="project-icon ${colors[index % colors.length]}">${initials(project.name)}</span><div><button class="open-project-page" data-id="${project.id}" type="button">${project.name}</button><small>${project.team}</small></div></div></td>
    <td><span class="status-pill status-${slug(project.status)}">${project.status}</span></td>
    <td><div class="table-progress"><div class="progress-track"><span style="width:${project.progress}%"></span></div><span>${project.progress}%</span></div></td>
    <td><div class="owner-cell"><span class="avatar">${initials(project.owner)}</span><span>${project.owner}</span></div></td>
    <td><time datetime="${project.end}">${formatDate(project.end, { month: "short", day: "numeric", year: "numeric" })}</time></td>
    <td><span class="fiscal-span">${fiscalSpanLabel(project)}</span></td>
    <td><span class="risk-pill risk-${project.risk.toLowerCase()}">${project.risk}</span></td>
    <td><button class="icon-button subtle row-action open-project-page" data-id="${project.id}" type="button" aria-label="Open ${project.name} details">${iconMarkup("arrow-right")}</button></td>
  </tr>`;
}

// A project that records phases gets its phases as their own subsection on the
// overview, directly under the project, so the standing of each phase is
// readable without opening anything. Every value shown is read back from the
// project's own phase records - name, dates and status - and nothing is
// derived or filled in. Each phase opens the project page scrolled to that
// phase, where it can be read and edited.
function phaseChipMarkup(project, phase, index) {
  const dates = phase.start && phase.end
    ? `${formatDate(phase.start, { month: "short", day: "numeric", year: "numeric" })} - ${formatDate(phase.end, { month: "short", day: "numeric", year: "numeric" })}`
    : "No dates set";
  const note = (phase.objective || "").replace(/"/g, "&quot;");
  return `<button class="phase-chip phase-chip-${slug(phase.status)}" data-phase-jump="${project.id}" data-phase-index="${index}" type="button"${note ? ` title="${note}"` : ""} aria-label="Open ${phase.name} on ${project.name}">
    <span class="phase-chip-index">${index + 1}</span>
    <span class="phase-chip-text"><strong>${phase.name}</strong><small>${dates}</small></span>
    ${!hasPhaseProgress(phase) ? `<span class="phase-chip-progress phase-chip-progress-unset">-</span>` : `<span class="phase-chip-progress"><span class="progress-track"><span style="width:${phase.progress}%"></span></span><small>${phase.progress}%</small></span>`}
    <span class="status-pill status-${slug(phase.status)}">${phase.status}</span>
    <span class="phase-chip-go" aria-hidden="true">${iconMarkup("arrow-right")}</span>
  </button>`;
}

function phaseStripMarkup(project) {
  const phases = Array.isArray(project.phases) ? project.phases : [];
  if (!phases.length) return "";
  return `<div class="phase-strip">
    <div class="phase-strip-head">${iconMarkup("layers")}<strong>Phases</strong><small>${phases.length} recorded</small></div>
    <div class="phase-strip-chips">${phases.map((phase, index) => phaseChipMarkup(project, phase, index)).join("")}</div>
  </div>`;
}

// The table needs the strip in a row of its own so it can span the columns.
function projectPhaseRow(project) {
  const strip = phaseStripMarkup(project);
  return strip ? `<tr class="project-phase-table-row"><td colspan="8">${strip}</td></tr>` : "";
}

// Opens the project page and settles on the phase that was clicked. The page
// scrolls itself to the top first, so this waits for that before moving to the
// phase card and highlighting it.
function openProjectPhase(projectId, index) {
  renderProjectPage(projectId);
  window.setTimeout(() => {
    const card = document.querySelectorAll("#projectDetailContent .detail-phase-card")[index];
    if (!card) return;
    document.querySelectorAll(".detail-phase-card-focused").forEach(item => item.classList.remove("detail-phase-card-focused"));
    card.classList.add("detail-phase-card-focused");
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.focus({ preventScroll: true });
  }, 240);
}

function projectCard(project, index) {
  return `<article class="project-card open-project-page" data-id="${project.id}" tabindex="0" role="button" aria-label="Open ${project.name} details page">
    <div class="project-card-top"><span class="project-icon ${colors[index % colors.length]}">${initials(project.name)}</span><span class="status-pill status-${slug(project.status)}">${project.status}</span></div>
    <h3>${project.name}</h3><p>${project.objective}</p>
    <div class="project-card-unit"><span>${iconMarkup("building-2")}</span><div><small>Branch Unit</small><strong>${project.unit}</strong></div></div>
    <div class="project-card-progress"><div class="progress-track"><span style="width:${project.progress}%"></span></div><strong>${project.progress}%</strong></div>
    ${phaseStripMarkup(project)}
    <div class="project-card-meta"><div class="owner-cell"><span class="avatar">${initials(project.owner)}</span><span>${project.owner}</span></div><span class="icon-button subtle" aria-hidden="true">${iconMarkup("arrow-up-right")}</span></div>
  </article>`;
}

// Everything in this section is read back from the project record: the goals it
// is linked to, the initiatives on either side of its dependencies, and the
// scoring numbers entered for it. An absent value says "not recorded".
function projectAlignmentSection(project) {
  const goals = goalsForProject(project);
  const waitingOn = predecessorsOf(project);
  const blocking = dependentsOf(project);
  const model = activeScoreModel();
  const score = projectScore(project, model);
  const quadrant = scoreQuadrant(project);
  const linkRow = (items, emptyText, conflictTest) => items.length
    ? `<div class="alignment-links">${items.map(item => {
        const conflict = conflictTest(item);
        return `<button class="alignment-link${conflict ? " alignment-link-conflict" : ""}" data-open-project="${item.id}" type="button"><span class="project-icon ${conflict ? "coral" : "teal"}">${initials(item.name)}</span><span><strong>${item.name}</strong><small>${formatDate(item.start)} - ${formatDate(item.end)}${conflict ? " - dates do not sequence" : ""}</small></span>${iconMarkup("chevron-right")}</button>`;
      }).join("")}</div>`
    : `<p class="alignment-empty">${emptyText}</p>`;
  return `<section class="project-page-section alignment-section">
    <div class="section-heading-row"><div><span class="section-kicker">Strategy alignment</span><h2>Goals, dependencies and priority</h2></div><button class="secondary-button" data-edit-project="${project.id}" type="button">${iconMarkup("pencil-line")}Edit alignment</button></div>
    <div class="alignment-grid">
      <article class="alignment-card">
        <h3>${iconMarkup("target")}Strategic goals served</h3>
        ${goals.length
          ? `<ul class="alignment-goal-list">${goals.map(goal => `<li><button class="text-button" data-goal-scope="${goal.id}" type="button">${goal.title}</button><small>${goal.outcome || "No outcome recorded"}</small></li>`).join("")}</ul>`
          : `<p class="alignment-empty">Not linked to a strategic goal yet.</p>`}
      </article>
      <article class="alignment-card">
        <h3>${iconMarkup("git-merge")}Waits on</h3>
        ${linkRow(waitingOn, "No predecessors declared.", item => new Date(`${item.end}T12:00:00`) > new Date(`${project.start}T12:00:00`))}
        <h3 class="alignment-subhead">${iconMarkup("git-branch")}Blocks</h3>
        ${linkRow(blocking, "Nothing depends on this initiative.", item => new Date(`${project.end}T12:00:00`) > new Date(`${item.start}T12:00:00`))}
      </article>
      <article class="alignment-card">
        <h3>${iconMarkup("package")}Release</h3>
        ${(() => {
          const release = project.releaseId ? releaseById(project.releaseId) : null;
          if (!release) return `<p class="alignment-empty">Not part of a release.</p>`;
          const late = release.date && project.end > release.date;
          return `<p class="alignment-release"><strong>${release.name}</strong><small>${release.date ? formatDate(release.date, { month: "short", day: "numeric", year: "numeric" }) : "No date set"} - ${release.status}</small></p>
            ${late ? `<p class="alignment-warning">${iconMarkup("triangle-alert")}This initiative ends ${formatDate(project.end)}, after the release date.</p>` : ""}`;
        })()}
      </article>
      <article class="alignment-card">
        <h3>${iconMarkup("gauge")}Priority score</h3>
        ${score === null
          ? `<p class="alignment-empty">Not scored on ${model.label}. ${model.fields.map(field => field.label).join(", ")} are needed.</p>`
          : `<p class="alignment-score"><strong>${score}</strong><small>${model.label}${quadrant ? ` - ${quadrant.label}` : ""}</small></p>
             <ul class="alignment-score-inputs">${model.fields.map(field => `<li><span>${field.label}</span><strong>${project.scoring[field.key] ?? "-"}</strong></li>`).join("")}</ul>`}
        <p class="alignment-note">${model.hint}</p>
      </article>
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// Idea intake and customer feedback.
// Both are captured by hand and stored per browser; nothing is seeded and
// nothing is inferred. An idea becomes an initiative only when someone
// promotes it, and the initiative it created is recorded on the idea.
// ---------------------------------------------------------------------------
const IDEA_STATUSES = ["New", "Reviewing", "Accepted", "Declined"];
const FEEDBACK_SOURCES = ["Albertan", "Ministry partner", "Service desk", "Staff", "Research session", "Other"];

function loadIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.ideas));
    return Array.isArray(saved) ? saved.map(normalizeIdea) : [];
  } catch {
    return [];
  }
}

function normalizeIdea(idea) {
  return {
    id: Number(idea.id) || Date.now(),
    title: String(idea.title || "").trim(),
    problem: String(idea.problem || "").trim(),
    requester: String(idea.requester || "").trim(),
    source: FEEDBACK_SOURCES.includes(idea.source) ? idea.source : "Other",
    status: IDEA_STATUSES.includes(idea.status) ? idea.status : "New",
    createdAt: idea.createdAt || AS_OF_ISO,
    promotedProjectId: Number(idea.promotedProjectId) || null
  };
}

function saveIdeas() {
  localStorage.setItem(STORAGE.ideas, JSON.stringify(ideas));
  pushRecords("ideas", (() => ideas)(), "the idea board");
}

function loadFeedback() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.feedback));
    return Array.isArray(saved) ? saved.map(normalizeFeedback) : [];
  } catch {
    return [];
  }
}

function normalizeFeedback(entry) {
  return {
    id: Number(entry.id) || Date.now(),
    ideaId: Number(entry.ideaId) || null,
    projectId: Number(entry.projectId) || null,
    source: FEEDBACK_SOURCES.includes(entry.source) ? entry.source : "Other",
    requester: String(entry.requester || "").trim(),
    verbatim: String(entry.verbatim || "").trim(),
    createdAt: entry.createdAt || AS_OF_ISO
  };
}

function saveFeedback() {
  localStorage.setItem(STORAGE.feedback, JSON.stringify(feedbackEntries));
  pushRecords("feedback", (() => feedbackEntries)(), "customer feedback");
}

function feedbackForIdea(ideaId) {
  return feedbackEntries.filter(entry => entry.ideaId === Number(ideaId));
}

function feedbackForProject(projectId) {
  const id = Number(projectId);
  const promoted = ideas.filter(idea => idea.promotedProjectId === id).map(idea => idea.id);
  return feedbackEntries.filter(entry => entry.projectId === id || promoted.includes(entry.ideaId));
}

function ideaById(ideaId) {
  return ideas.find(idea => idea.id === Number(ideaId)) || null;
}

function moveIdeaToStatus(ideaId, status) {
  const idea = ideaById(ideaId);
  if (!idea || !IDEA_STATUSES.includes(status) || idea.status === status) return false;
  idea.status = status;
  saveIdeas();
  renderIdeas();
  showToast(`"${idea.title}" moved to ${status}`);
  return true;
}

function renderIdeas() {
  const counts = IDEA_STATUSES.map(status => ideas.filter(idea => idea.status === status).length);
  const promoted = ideas.filter(idea => idea.promotedProjectId).length;
  document.querySelector("#ideaSummary").innerHTML = [
    ["Captured", ideas.length, "lightbulb"],
    ["Under review", counts[IDEA_STATUSES.indexOf("Reviewing")], "search"],
    ["Accepted", counts[IDEA_STATUSES.indexOf("Accepted")], "circle-check"],
    ["Promoted to initiatives", promoted, "route"],
    ["Feedback records", feedbackEntries.length, "message-square-quote"]
  ].map(item => `<div class="idea-summary-item"><i>${iconMarkup(item[2])}</i><div><strong>${item[1]}</strong><span>${item[0]}</span></div></div>`).join("");

  document.querySelector("#ideaBoard").innerHTML = IDEA_STATUSES.map((status, index) => {
    const column = ideas.filter(idea => idea.status === status);
    return `<div class="idea-column" data-idea-status="${status}">
      <div class="idea-column-head"><strong>${status}</strong><span>${counts[index]}</span></div>
      <div class="idea-column-body">${column.length
        ? column.map(idea => {
            const count = feedbackForIdea(idea.id).length;
            const project = idea.promotedProjectId ? projects.find(item => item.id === idea.promotedProjectId) : null;
            return `<article class="idea-card" draggable="true" data-idea-id="${idea.id}">
              <div class="idea-card-top"><strong>${idea.title}</strong><span class="idea-source">${idea.source}</span></div>
              <p>${idea.problem || "No problem statement recorded."}</p>
              <div class="idea-card-meta">
                <span>${iconMarkup("user-round")}${idea.requester || "No requester recorded"}</span>
                <button class="idea-feedback-count" data-open-idea="${idea.id}" type="button">${iconMarkup("message-square-quote")}${count} ${count === 1 ? "record" : "records"}</button>
              </div>
              ${project ? `<button class="idea-promoted" data-open-project="${project.id}" type="button">${iconMarkup("route")}Delivered as ${project.name}</button>` : ""}
              <div class="idea-card-actions">
                <button class="text-button" data-open-idea="${idea.id}" type="button">Open</button>
                ${project ? "" : `<button class="text-button" data-promote-idea="${idea.id}" type="button">Promote to initiative</button>`}
                <button class="text-button danger-text" data-delete-idea="${idea.id}" type="button">Delete</button>
              </div>
            </article>`;
          }).join("")
        : `<p class="idea-column-empty">Nothing here yet</p>`}</div>
    </div>`;
  }).join("");

  const note = document.querySelector("#ideaNote");
  note.innerHTML = `${iconMarkup(ideas.length ? "info" : "lightbulb")}<span>${ideas.length
    ? `Drag a card between columns to change its status. Promoting an accepted idea opens the project intake form filled in from the idea, and records the initiative it became.`
    : `No ideas captured yet. Use "Capture idea" to record the first one - this board only ever shows what has been entered here.`}</span>`;
  refreshIcons();
}

function openIdeaModal(ideaId = null) {
  const idea = ideaId ? ideaById(ideaId) : null;
  ideaBeingEdited = idea ? idea.id : null;
  const form = document.querySelector("#ideaForm");
  form.reset();
  form.elements.source.innerHTML = FEEDBACK_SOURCES.map(source => `<option>${source}</option>`).join("");
  form.elements.status.innerHTML = IDEA_STATUSES.map(status => `<option>${status}</option>`).join("");
  if (idea) {
    form.elements.title.value = idea.title;
    form.elements.problem.value = idea.problem;
    form.elements.requester.value = idea.requester;
    form.elements.source.value = idea.source;
    form.elements.status.value = idea.status;
  }
  document.querySelector("#ideaModalTitle").textContent = idea ? `Edit ${idea.title}` : "Capture an idea";
  document.querySelector("#ideaSaveButton span").textContent = idea ? "Save idea" : "Capture idea";
  renderIdeaFeedback(idea);
  document.querySelector("#ideaModal").showModal();
  refreshIcons();
}

function renderIdeaFeedback(idea) {
  const host = document.querySelector("#ideaFeedbackList");
  const section = document.querySelector("#ideaFeedbackSection");
  section.classList.toggle("hidden", !idea);
  if (!idea) return;
  const records = feedbackForIdea(idea.id);
  document.querySelector("#ideaFeedbackCount").textContent = records.length;
  host.innerHTML = records.length
    ? records.map(entry => `<article class="feedback-record">
        <div><strong>${entry.requester || "Anonymous"}</strong><span class="idea-source">${entry.source}</span></div>
        <p>${entry.verbatim}</p>
        <div class="feedback-record-foot"><small>${formatDate(entry.createdAt)}</small><button class="text-button danger-text" data-delete-feedback="${entry.id}" type="button">Remove</button></div>
      </article>`).join("")
    : `<p class="alignment-empty">No feedback recorded against this idea yet.</p>`;
  document.querySelector("#feedbackSource").innerHTML = FEEDBACK_SOURCES.map(source => `<option>${source}</option>`).join("");
  refreshIcons();
}

function submitIdea(event) {
  event.preventDefault();
  const form = document.querySelector("#ideaForm");
  const data = Object.fromEntries(new FormData(form));
  if (!data.title.trim()) return;
  const existing = ideaBeingEdited ? ideaById(ideaBeingEdited) : null;
  const record = normalizeIdea({
    id: existing ? existing.id : Date.now(),
    title: data.title,
    problem: data.problem,
    requester: data.requester,
    source: data.source,
    status: data.status,
    createdAt: existing ? existing.createdAt : AS_OF_ISO,
    promotedProjectId: existing ? existing.promotedProjectId : null
  });
  if (existing) Object.assign(existing, record);
  else ideas.push(record);
  saveIdeas();
  document.querySelector("#ideaModal").close();
  ideaBeingEdited = null;
  renderIdeas();
  showToast(existing ? `${record.title} updated` : `${record.title} captured`);
}

function addFeedbackRecord() {
  const idea = ideaBeingEdited ? ideaById(ideaBeingEdited) : null;
  if (!idea) return;
  const verbatim = document.querySelector("#feedbackVerbatim").value.trim();
  if (!verbatim) {
    document.querySelector("#feedbackVerbatim").setCustomValidity("Record what was actually said or asked for.");
    document.querySelector("#feedbackVerbatim").reportValidity();
    return;
  }
  document.querySelector("#feedbackVerbatim").setCustomValidity("");
  feedbackEntries.push(normalizeFeedback({
    id: Date.now(),
    ideaId: idea.id,
    source: document.querySelector("#feedbackSource").value,
    requester: document.querySelector("#feedbackRequester").value,
    verbatim,
    createdAt: AS_OF_ISO
  }));
  saveFeedback();
  document.querySelector("#feedbackVerbatim").value = "";
  document.querySelector("#feedbackRequester").value = "";
  renderIdeaFeedback(idea);
  renderIdeas();
  showToast("Feedback recorded");
}

function deleteFeedbackRecord(feedbackId) {
  feedbackEntries = feedbackEntries.filter(entry => entry.id !== Number(feedbackId));
  saveFeedback();
  renderIdeaFeedback(ideaBeingEdited ? ideaById(ideaBeingEdited) : null);
  renderIdeas();
}

function deleteIdea(ideaId) {
  const idea = ideaById(ideaId);
  if (!idea) return;
  ideas = ideas.filter(item => item.id !== idea.id);
  feedbackEntries = feedbackEntries.filter(entry => entry.ideaId !== idea.id);
  saveIdeas();
  saveFeedback();
  renderIdeas();
  showToast(`${idea.title} removed`);
}

// Promotion carries across only what the idea itself holds - its title and
// problem statement. Everything else is left for the intake form to collect.
function promoteIdea(ideaId) {
  const idea = ideaById(ideaId);
  if (!idea) return;
  ideaAwaitingPromotion = idea.id;
  switchView("projects");
  openModal();
  elements.form.elements.name.value = idea.title;
  elements.form.elements.objective.value = idea.problem || idea.title;
  document.querySelector("#projectModalKicker").textContent = "Promoted from an idea";
  document.querySelector("#projectModalTitle").textContent = `Promote "${idea.title}" to an initiative`;
  showToast("Fill in the delivery details to promote this idea");
}

// ---------------------------------------------------------------------------
// Board layout and direct manipulation of the timeline.
// Both are editing paths, not new data: a drop writes a status the user chose,
// and a drag writes dates computed from where the bar was released.
// ---------------------------------------------------------------------------

function renderProjectBoard(filtered) {
  const host = document.querySelector("#boardLayout");
  host.innerHTML = projectStatuses.map(status => {
    const column = filtered.filter(project => project.status === status);
    const band = unitMixBands.find(entry => entry.statuses.includes(status));
    return `<div class="board-column" data-board-status="${status}" style="--band-color:${band ? band.color : "var(--line)"}">
      <div class="board-column-head"><strong>${status}</strong><span>${column.length}</span></div>
      <div class="board-column-body">${column.length
        ? column.map(project => {
            const score = projectScore(project);
            return `<article class="board-card" draggable="true" data-board-project="${project.id}">
              <div class="board-card-top"><button class="board-card-name" data-project-page="${project.id}" type="button">${project.name}</button><span class="risk-dot risk-${project.risk.toLowerCase()}" title="${project.risk} risk"></span></div>
              <p>${project.unit}${project.subUnit ? ` / ${project.subUnit}` : ""}</p>
              <div class="board-card-progress"><span style="width:${project.progress}%"></span></div>
              <div class="board-card-foot">
                <span><i class="avatar">${initials(project.owner)}</i>${project.owner}</span>
                <span>${project.progress}%</span>
              </div>
              <div class="board-card-foot">
                <small>${formatDate(project.end)}</small>
                ${score === null ? `<small class="board-unscored">unscored</small>` : `<small class="board-score">score ${score}</small>`}
              </div>
            </article>`;
          }).join("")
        : `<p class="idea-column-empty">None</p>`}</div>
    </div>`;
  }).join("");
  const note = document.querySelector("#boardNote");
  if (note) note.innerHTML = `${iconMarkup("info")}<span>Drag a card into another column to change that project's status. Columns are the nine portfolio statuses, and a card appears in exactly the column its record says it is in.</span>`;
}

function moveProjectToStatus(projectId, status) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project || !projectStatuses.includes(status) || project.status === status) return false;
  const previous = project.status;
  const before = { ...project };
  project.status = status;
  recordProjectChange(before, project, "dragged on the board");
  saveProjects();
  renderAll();
  showToast(`${project.name}: ${previous} to ${status}`);
  return true;
}

// Moving a bar shifts the whole initiative - its dates, its milestone and any
// phases - by the same number of days, so nothing inside it drifts.
function applyProjectDateShift(projectId, dayDelta) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project || !dayDelta) return false;
  const before = { ...project };
  const shift = iso => shiftIso(iso, dayDelta);
  project.start = shift(project.start);
  project.end = shift(project.end);
  if (project.milestoneDate) project.milestoneDate = shift(project.milestoneDate);
  (project.phases || []).forEach(phase => {
    if (phase.start) phase.start = shift(phase.start);
    if (phase.end) phase.end = shift(phase.end);
  });
  recordProjectChange(before, project, "dragged on the timeline");
  saveProjects();
  return true;
}

// Dragging an edge moves one end only, never past the other, and keeps the
// milestone inside the window it is supposed to sit in.
function applyProjectEdgeResize(projectId, edge, dayDelta) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project || !dayDelta) return false;
  const before = { ...project };
  if (edge === "start") {
    const proposed = shiftIso(project.start, dayDelta);
    project.start = proposed >= project.end ? shiftIso(project.end, -1) : proposed;
  } else {
    const proposed = shiftIso(project.end, dayDelta);
    project.end = proposed <= project.start ? shiftIso(project.start, 1) : proposed;
  }
  if (project.milestoneDate < project.start) project.milestoneDate = project.start;
  if (project.milestoneDate > project.end) project.milestoneDate = project.end;
  recordProjectChange(before, project, `dragged the ${edge === "start" ? "start" : "target"} edge`);
  saveProjects();
  return true;
}

function shiftIso(iso, days) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Release planning.
// A release is a date with a name. What it contains is not stored on the
// release - it is read back from the initiatives that point at it, so a
// release can never disagree with the project records.
// ---------------------------------------------------------------------------
const RELEASE_STATUSES = ["Planned", "Committed", "Shipped", "Cancelled"];

function loadReleases() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.releases));
    return Array.isArray(saved) ? saved.map(normalizeRelease) : [];
  } catch {
    return [];
  }
}

function normalizeRelease(release) {
  return {
    id: Number(release.id) || Date.now(),
    name: String(release.name || "").trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(release.date) ? release.date : "",
    status: RELEASE_STATUSES.includes(release.status) ? release.status : "Planned",
    notes: String(release.notes || "").trim()
  };
}

function saveReleases() {
  localStorage.setItem(STORAGE.releases, JSON.stringify(releases));
  pushRecords("releases", (() => releases)(), "the release plan");
}

function releaseById(releaseId) {
  return releases.find(release => release.id === Number(releaseId)) || null;
}

function releaseContents(releaseId, list = projects) {
  return list.filter(project => project.releaseId === Number(releaseId));
}

// An initiative that finishes after the release it is in cannot ship in it.
function releaseRisks(release, list = projects) {
  if (!release.date) return [];
  return releaseContents(release.id, list).filter(project => project.end > release.date);
}

function sortedReleases() {
  return releases.slice().sort((first, second) => (first.date || "9999").localeCompare(second.date || "9999"));
}

function renderReleases() {
  const host = document.querySelector("#releaseList");
  const ordered = sortedReleases();
  document.querySelector("#releaseCount").textContent = ordered.length;
  host.innerHTML = ordered.length
    ? ordered.map(release => {
        const contents = releaseContents(release.id);
        const risks = releaseRisks(release);
        return `<article class="release-card${risks.length ? " release-at-risk" : ""}">
          <div class="release-card-top">
            <div><strong>${release.name}</strong><small>${release.date ? formatDate(release.date, { month: "short", day: "numeric", year: "numeric" }) : "No date set"}</small></div>
            <span class="release-status release-${slug(release.status)}">${release.status}</span>
          </div>
          ${release.notes ? `<p>${release.notes}</p>` : ""}
          <div class="release-contents">${contents.length
            ? contents.map(project => `<button class="release-item${release.date && project.end > release.date ? " release-item-late" : ""}" data-open-project="${project.id}" type="button"><span class="status-pill status-${slug(project.status)}">${project.status}</span><span><strong>${project.name}</strong><small>ends ${formatDate(project.end)}</small></span></button>`).join("")
            : `<p class="alignment-empty">No initiative is assigned to this release yet.</p>`}</div>
          <div class="release-card-foot">
            ${contents.length
              ? `<button class="release-count" data-release-focus="${release.id}" type="button" aria-label="Show the ${contents.length} ${contents.length === 1 ? "initiative" : "initiatives"} in ${release.name}">${iconMarkup(risks.length ? "triangle-alert" : "package")}${contents.length} ${contents.length === 1 ? "initiative" : "initiatives"}${risks.length ? ` - ${risks.length} ${risks.length === 1 ? "finishes" : "finish"} after this date` : ""}</button>`
              : `<span>${iconMarkup("package")}No initiatives yet</span>`}
            <span class="release-card-actions"><button class="text-button" data-edit-release="${release.id}" type="button">Edit</button><button class="text-button danger-text" data-delete-release="${release.id}" type="button">Delete</button></span>
          </div>
        </article>`;
      }).join("")
    : `<p class="alignment-empty">No releases defined yet. Add one to group initiatives into a shipping date, then pick it on an initiative under Strategy alignment.</p>`;
  refreshIcons();
}

function openReleaseModal(releaseId = null) {
  const release = releaseId ? releaseById(releaseId) : null;
  releaseBeingEdited = release ? release.id : null;
  const form = document.querySelector("#releaseForm");
  form.reset();
  form.elements.status.innerHTML = RELEASE_STATUSES.map(status => `<option>${status}</option>`).join("");
  if (release) {
    form.elements.name.value = release.name;
    form.elements.date.value = release.date;
    form.elements.status.value = release.status;
    form.elements.notes.value = release.notes;
  }
  document.querySelector("#releaseModalTitle").textContent = release ? `Edit ${release.name}` : "Add a release";
  document.querySelector("#releaseSaveButton span").textContent = release ? "Save release" : "Add release";
  document.querySelector("#releaseModal").showModal();
  refreshIcons();
}

function submitRelease(event) {
  event.preventDefault();
  const form = document.querySelector("#releaseForm");
  const data = Object.fromEntries(new FormData(form));
  if (!data.name.trim()) return;
  const existing = releaseBeingEdited ? releaseById(releaseBeingEdited) : null;
  const record = normalizeRelease({ id: existing ? existing.id : Date.now(), ...data });
  if (existing) Object.assign(existing, record);
  else releases.push(record);
  saveReleases();
  document.querySelector("#releaseModal").close();
  releaseBeingEdited = null;
  renderAll();
  showToast(existing ? `${record.name} updated` : `${record.name} added`);
}

// Deleting a release unassigns the initiatives in it rather than leaving them
// pointing at something that no longer exists.
function deleteRelease(releaseId) {
  const release = releaseById(releaseId);
  if (!release) return;
  const freed = releaseContents(release.id);
  freed.forEach(project => { project.releaseId = null; });
  releases = releases.filter(item => item.id !== release.id);
  saveReleases();
  if (freed.length) saveProjects();
  renderAll();
  showToast(freed.length
    ? `${release.name} deleted - ${freed.length} ${freed.length === 1 ? "initiative" : "initiatives"} unassigned`
    : `${release.name} deleted`);
}

// ---------------------------------------------------------------------------
// Initiative specs, discussion notes and change history.
// All three are per-initiative records kept in this browser - there is no
// server behind them, so the UI says so rather than implying collaboration.
// The history is written from actual before-and-after field values.
// ---------------------------------------------------------------------------
const SPEC_SECTIONS = [
  { key: "problem", label: "Problem", help: "Whose problem this is, and what it costs them today" },
  { key: "requirements", label: "Requirements", help: "What has to be true for this to be done" },
  { key: "outOfScope", label: "Out of scope", help: "What this initiative deliberately does not cover" },
  { key: "acceptance", label: "Acceptance criteria", help: "How delivery will be judged complete" }
];
const HISTORY_TRACKED_FIELDS = [
  ["name", "Name"], ["status", "Status"], ["progress", "Progress"], ["owner", "Owner"],
  ["team", "Team"], ["unit", "Branch Unit"], ["subUnit", "Unit"], ["subCategory", "Category"], ["start", "Start date"],
  ["end", "Target date"], ["milestone", "Milestone"], ["milestoneDate", "Milestone date"],
  ["risk", "Risk"], ["priority", "Priority"], ["approxCost", "Approx. cost"], ["releaseId", "Release"]
];
const HISTORY_LIMIT = 200;

function loadKeyedStore(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

function saveSpecs() {
  localStorage.setItem(STORAGE.specs, JSON.stringify(projectSpecs));
  pushRecords("specs", (() => projectSpecs)(), "a specification");
}

function saveNotes() {
  localStorage.setItem(STORAGE.notes, JSON.stringify(projectNotes));
  pushRecords("notes", (() => projectNotes)(), "the notes");
}

function saveHistory() {
  localStorage.setItem(STORAGE.history, JSON.stringify(projectHistory));
  pushRecords("history", (() => projectHistory)(), "the change history");
}

function specFor(projectId) {
  const stored = projectSpecs[String(projectId)] || {};
  return Object.fromEntries(SPEC_SECTIONS.map(section => [section.key, String(stored[section.key] || "").trim()]));
}

function specIsEmpty(spec) {
  return SPEC_SECTIONS.every(section => !spec[section.key]);
}

function notesFor(projectId) {
  const list = projectNotes[String(projectId)];
  return Array.isArray(list) ? list : [];
}

function historyFor(projectId) {
  const list = projectHistory[String(projectId)];
  return Array.isArray(list) ? list : [];
}

function currentUserName() {
  const session = loadAuthSession();
  return session?.name || "This browser";
}

function historyValueLabel(field, value) {
  if (field === "releaseId") {
    const release = value ? releaseById(value) : null;
    return release ? release.name : "none";
  }
  if (value === "" || value === null || value === undefined) return "none";
  if (field === "approxCost") return formatCurrency(Number(value));
  if (field === "progress") return `${value}%`;
  return String(value);
}

// Called with the record as it was and as it now is; writes an entry only for
// fields that actually changed.
function recordProjectChange(before, after, source) {
  if (!before) return;
  const changes = HISTORY_TRACKED_FIELDS
    .filter(([field]) => String(before[field] ?? "") !== String(after[field] ?? ""))
    .map(([field, label]) => ({ field, label, from: historyValueLabel(field, before[field]), to: historyValueLabel(field, after[field]) }));
  if (!changes.length) return;
  const key = String(after.id);
  const list = historyFor(after.id);
  list.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), by: currentUserName(), source, changes });
  projectHistory[key] = list.slice(0, HISTORY_LIMIT);
  saveHistory();
}

function addProjectNote(projectId, text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return false;
  const key = String(projectId);
  const list = notesFor(projectId);
  list.unshift({ id: Date.now(), by: currentUserName(), at: new Date().toISOString(), text: trimmed });
  projectNotes[key] = list;
  saveNotes();
  return true;
}

function deleteProjectNote(projectId, noteId) {
  const key = String(projectId);
  projectNotes[key] = notesFor(projectId).filter(note => note.id !== Number(noteId));
  saveNotes();
}

function projectSpecSection(project) {
  const spec = specFor(project.id);
  return `<section class="project-page-section spec-section">
    <div class="section-heading-row"><div><span class="section-kicker">Specification</span><h2>What this initiative commits to</h2></div><button class="secondary-button" data-edit-spec="${project.id}" type="button">${iconMarkup("pencil-line")}${specIsEmpty(spec) ? "Write the spec" : "Edit the spec"}</button></div>
    ${specIsEmpty(spec)
      ? `<p class="alignment-empty">No specification written yet. A spec records the problem, the requirements, what is out of scope and how delivery will be judged - nothing here is generated for you.</p>`
      : `<div class="spec-grid">${SPEC_SECTIONS.map(section => `<article class="spec-block${spec[section.key] ? "" : " spec-block-empty"}">
          <h3>${section.label}</h3>
          ${spec[section.key] ? `<p>${spec[section.key].replace(/\n/g, "<br>")}</p>` : `<p class="alignment-empty">Not recorded.</p>`}
        </article>`).join("")}</div>`}
  </section>`;
}

function projectNotesSection(project) {
  const notes = notesFor(project.id);
  const history = historyFor(project.id);
  return `<section class="project-page-section notes-section">
    <div class="section-heading-row"><div><span class="section-kicker">Discussion and history</span><h2>Notes and what changed</h2></div><span class="detail-count">${notes.length} ${notes.length === 1 ? "note" : "notes"}</span></div>
    <p class="local-only-note">${iconMarkup("hard-drive")}<span>Notes and history are stored in this browser only. Nothing is sent anywhere, and colleagues on other machines will not see them.</span></p>
    <div class="notes-grid">
      <div class="notes-column">
        <div class="note-add">
          <textarea id="projectNoteInput" rows="2" maxlength="400" placeholder="Add a note about this initiative"></textarea>
          <button class="secondary-button" data-add-note="${project.id}" type="button">${iconMarkup("plus")}Add note</button>
        </div>
        ${notes.length
          ? notes.map(note => `<article class="project-note"><div><strong>${note.by}</strong><small>${formatDateTime(note.at)}</small></div><p>${note.text.replace(/\n/g, "<br>")}</p><button class="text-button danger-text" data-delete-note="${note.id}" data-project-id="${project.id}" type="button">Remove</button></article>`).join("")
          : `<p class="alignment-empty">No notes yet.</p>`}
      </div>
      <div class="notes-column">
        <h3 class="notes-subhead">${iconMarkup("history")}Change history</h3>
        ${history.length
          ? `<ol class="history-list">${history.slice(0, 12).map(entry => `<li>
              <div class="history-head"><strong>${entry.by}</strong><small>${formatDateTime(entry.at)} - ${entry.source}</small></div>
              <ul>${entry.changes.map(change => `<li><span>${change.label}</span><b>${change.from}</b>${iconMarkup("arrow-right")}<b>${change.to}</b></li>`).join("")}</ul>
            </li>`).join("")}</ol>`
          : `<p class="alignment-empty">No changes recorded yet. Every edit from here on is logged with what it changed.</p>`}
      </div>
    </div>
  </section>`;
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}, ${date.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" })}`;
}

function openSpecModal(projectId) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project) return;
  specProjectId = project.id;
  const spec = specFor(project.id);
  document.querySelector("#specModalTitle").textContent = `Specification - ${project.name}`;
  document.querySelector("#specFields").innerHTML = SPEC_SECTIONS.map(section => `<label class="full-field">${section.label}<small class="field-hint">${section.help}</small><textarea data-spec-field="${section.key}" rows="3" maxlength="600">${spec[section.key]}</textarea></label>`).join("");
  document.querySelector("#specModal").showModal();
  refreshIcons();
}

function submitSpec(event) {
  event.preventDefault();
  const project = projects.find(item => item.id === specProjectId);
  if (!project) return;
  const next = {};
  SPEC_SECTIONS.forEach(section => {
    next[section.key] = document.querySelector(`[data-spec-field="${section.key}"]`).value.trim();
  });
  if (specIsEmpty(next)) delete projectSpecs[String(project.id)];
  else projectSpecs[String(project.id)] = next;
  saveSpecs();
  document.querySelector("#specModal").close();
  specProjectId = null;
  renderProjectPage(project.id);
  showToast(`Specification saved for ${project.name}`);
}

// ---------------------------------------------------------------------------
// Custom fields, saved views and shareable links.
// Custom fields add places to record information, not information itself: a
// field with nothing entered reads as not recorded. A saved view stores the
// filters, never a copy of the projects. A link encodes the same filters, so
// whoever opens it sees the live data through that lens.
// ---------------------------------------------------------------------------
const CUSTOM_FIELD_TYPES = [
  { key: "text", label: "Text" },
  { key: "number", label: "Number" },
  { key: "date", label: "Date" },
  { key: "select", label: "Choice list" }
];
const SCOPE_KEYS = ["query", "statusFilter", "teamFilter", "unitFilter", "ownerFilter", "riskFilter", "goalFilter", "layout"];

function loadCustomFields() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.fields));
    return Array.isArray(saved) ? saved.map(normalizeCustomField).filter(field => field.label) : [];
  } catch {
    return [];
  }
}

function normalizeCustomField(field) {
  const type = CUSTOM_FIELD_TYPES.some(entry => entry.key === field.type) ? field.type : "text";
  return {
    id: Number(field.id) || Date.now(),
    label: String(field.label || "").trim().slice(0, 40),
    type,
    options: type === "select"
      ? String(field.options || "").split(",").map(option => option.trim()).filter(Boolean)
      : []
  };
}

function saveCustomFields() {
  localStorage.setItem(STORAGE.fields, JSON.stringify(customFields));
  pushRecords("fields", (() => customFields)(), "the custom fields");
}

function customValue(project, fieldId) {
  const value = project.custom?.[String(fieldId)];
  return value === undefined || value === null ? "" : String(value);
}

function loadSavedViews() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.views));
    return Array.isArray(saved) ? saved.filter(view => view && view.name) : [];
  } catch {
    return [];
  }
}

function saveSavedViews() {
  localStorage.setItem(STORAGE.views, JSON.stringify(savedViews));
  pushRecords("views", (() => savedViews)(), "the saved views");
}

function currentScope() {
  return { query, statusFilter, teamFilter, unitFilter, ownerFilter, riskFilter, goalFilter, layout: activeLayout };
}

function applyScope(scope = {}) {
  query = typeof scope.query === "string" ? scope.query : "";
  statusFilter = scope.statusFilter || "all";
  teamFilter = scope.teamFilter || "all";
  unitFilter = scope.unitFilter || "all";
  ownerFilter = scope.ownerFilter || "all";
  riskFilter = scope.riskFilter || "all";
  goalFilter = scope.goalFilter || "all";
  if (["table", "cards", "timeline", "board"].includes(scope.layout)) {
    activeLayout = scope.layout;
    document.querySelectorAll("[data-layout]").forEach(item => item.classList.toggle("active", item.dataset.layout === activeLayout));
  }
  document.querySelector("#globalSearch").value = query;
  populateTeamFilters();
  renderProjects();
}

function renderSavedViews() {
  const select = document.querySelector("#savedViewSelect");
  select.innerHTML = `<option value="">${savedViews.length ? "Saved views" : "No saved views yet"}</option>`
    + savedViews.map(view => `<option value="${view.id}">${view.name}</option>`).join("");
  select.value = activeSavedViewId ? String(activeSavedViewId) : "";
  document.querySelector("#deleteViewButton").disabled = !activeSavedViewId;
}

function saveCurrentView() {
  const name = document.querySelector("#saveViewName").value.trim();
  if (!name) {
    document.querySelector("#saveViewName").setCustomValidity("Give the view a name so it can be found again.");
    document.querySelector("#saveViewName").reportValidity();
    return;
  }
  document.querySelector("#saveViewName").setCustomValidity("");
  const existing = savedViews.find(view => view.name.toLowerCase() === name.toLowerCase());
  const record = { id: existing ? existing.id : Date.now(), name, scope: currentScope() };
  if (existing) Object.assign(existing, record);
  else savedViews.push(record);
  activeSavedViewId = record.id;
  saveSavedViews();
  document.querySelector("#saveViewName").value = "";
  renderSavedViews();
  showToast(existing ? `View "${name}" updated` : `View "${name}" saved`);
}

function applySavedView(viewId) {
  const view = savedViews.find(item => item.id === Number(viewId));
  activeSavedViewId = view ? view.id : null;
  if (!view) { renderSavedViews(); return; }
  applyScope(view.scope);
  renderSavedViews();
  showToast(`Showing "${view.name}"`);
}

function deleteSavedView() {
  const view = savedViews.find(item => item.id === activeSavedViewId);
  if (!view) return;
  savedViews = savedViews.filter(item => item.id !== view.id);
  activeSavedViewId = null;
  saveSavedViews();
  renderSavedViews();
  showToast(`View "${view.name}" deleted`);
}

// A link carries the filters, not the data. Opening it shows whatever the
// projects say at that moment, through the same lens.
function shareUrlForScope(scope = currentScope()) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  const params = new URLSearchParams();
  SCOPE_KEYS.forEach(key => {
    const value = scope[key];
    if (value && value !== "all") params.set(key, value);
  });
  params.set("view", "projects");
  url.search = params.toString();
  return url.toString();
}

function shareUrlForProject(projectId) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ view: "project", project: String(projectId) }).toString();
  url.hash = "";
  return url.toString();
}

function openShareModal(link, description) {
  document.querySelector("#shareLinkInput").value = link;
  document.querySelector("#shareDescription").textContent = description;
  document.querySelector("#shareModal").showModal();
  const input = document.querySelector("#shareLinkInput");
  input.focus();
  input.select();
  refreshIcons();
}

function copyShareLink() {
  const input = document.querySelector("#shareLinkInput");
  input.select();
  const done = () => showToast("Link copied");
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(input.value).then(done, () => showToast("Select the link and copy it"));
  else showToast("Select the link and copy it");
}

// Reads a shared link on startup. Unknown values are ignored rather than
// guessed at, so a stale link still opens the app on something sensible.
function applyLinkedScope() {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].length) return false;
  if (params.get("view") === "project" && params.get("project")) {
    const project = projects.find(item => item.id === Number(params.get("project")));
    if (project) { renderProjectPage(project.id); return true; }
  }
  const scope = {};
  SCOPE_KEYS.forEach(key => { if (params.has(key)) scope[key] = params.get(key); });
  if (!Object.keys(scope).length) return false;
  applyScope(scope);
  switchView("projects");
  showToast("Opened a shared view");
  return true;
}

// Names added here can be removed again, so a typo is not permanent. Only the
// workspace's own additions are listed: the deck's taxonomy is not editable
// from the app, because it is a transcription of the deck.
function renderTaxonomySettings() {
  const host = document.querySelector("#taxonomyList");
  if (!host) return;
  const rows = [];
  Object.entries(customTaxonomy.units).forEach(([branchUnit, units]) => {
    units.forEach(unit => rows.push({ level: "unit", branchUnit, unit, label: unit, parent: branchUnit, used: unitInUse(branchUnit, unit) }));
  });
  Object.entries(customTaxonomy.categories).forEach(([key, categories]) => {
    const [branchUnit, unit] = key.split("::");
    categories.forEach(category => rows.push({ level: "category", branchUnit, unit, category, label: category, parent: `${branchUnit} / ${unit}`, used: categoryInUse(branchUnit, unit, category) }));
  });
  host.innerHTML = rows.length
    ? rows.map(row => `<div class="settings-row">
        <div><strong>${row.label}</strong><small>${row.level === "unit" ? "Unit" : "Category"} under ${row.parent}${row.used ? " - in use" : ""}</small></div>
        ${row.used
          ? `<span class="taxonomy-locked" title="Move or delete those projects first">In use</span>`
          : `<button class="text-button danger-text" data-remove-taxonomy="${row.level}" data-branch="${row.branchUnit}" data-unit="${row.unit}" data-name="${row.label}" type="button">Remove</button>`}
      </div>`).join("")
    : `<p class="alignment-empty">No units or categories have been added here. The ones from the roadmap deck are fixed, and anything you add on a project form appears here so it can be removed again.</p>`;
}

function removeTaxonomyRow(button) {
  const { removeTaxonomy: level, branch, unit, name } = button.dataset;
  const reason = level === "unit" ? removeCustomUnit(branch, name) : removeCustomCategory(branch, unit, name);
  if (reason) { showToast(reason); return; }
  renderTaxonomySettings();
  populateTeamFilters();
  renderAll();
  showToast(`"${name}" removed`);
}

function renderCustomFieldSettings() {
  const host = document.querySelector("#customFieldList");
  host.innerHTML = customFields.length
    ? customFields.map(field => `<div class="settings-row">
        <div><strong>${field.label}</strong><small>${CUSTOM_FIELD_TYPES.find(type => type.key === field.type).label}${field.options.length ? ` - ${field.options.join(", ")}` : ""}</small></div>
        <button class="text-button danger-text" data-delete-field="${field.id}" type="button">Remove</button>
      </div>`).join("")
    : `<p class="alignment-empty">No custom fields yet. Add one to record something this app does not already track.</p>`;
  document.querySelector("#customFieldType").innerHTML = CUSTOM_FIELD_TYPES.map(type => `<option value="${type.key}">${type.label}</option>`).join("");
  document.querySelector("#settingsScoreModel").innerHTML = Object.entries(SCORE_MODELS).map(([key, model]) => `<option value="${key}"${key === scoreModel ? " selected" : ""}>${model.label}</option>`).join("");
  document.querySelector("#customFieldOptions").classList.toggle("hidden", document.querySelector("#customFieldType").value !== "select");
}

function openSettingsModal() {
  renderCustomFieldSettings();
  renderTaxonomySettings();
  document.querySelector("#settingsModal").showModal();
  refreshIcons();
}

function addCustomField() {
  const label = document.querySelector("#customFieldLabel").value.trim();
  if (!label) {
    document.querySelector("#customFieldLabel").setCustomValidity("Name the field.");
    document.querySelector("#customFieldLabel").reportValidity();
    return;
  }
  document.querySelector("#customFieldLabel").setCustomValidity("");
  const field = normalizeCustomField({
    id: Date.now(),
    label,
    type: document.querySelector("#customFieldType").value,
    options: document.querySelector("#customFieldOptionsInput").value
  });
  if (field.type === "select" && !field.options.length) {
    document.querySelector("#customFieldOptionsInput").setCustomValidity("A choice list needs at least one option.");
    document.querySelector("#customFieldOptionsInput").reportValidity();
    return;
  }
  customFields.push(field);
  saveCustomFields();
  document.querySelector("#customFieldLabel").value = "";
  document.querySelector("#customFieldOptionsInput").value = "";
  renderCustomFieldSettings();
  showToast(`Field "${field.label}" added`);
}

// Removing a definition also drops the values recorded against it, so no
// orphaned data is left behind pretending to belong somewhere.
function deleteCustomField(fieldId) {
  const field = customFields.find(item => item.id === Number(fieldId));
  if (!field) return;
  let cleared = 0;
  projects.forEach(project => {
    if (project.custom && project.custom[String(field.id)] !== undefined) {
      delete project.custom[String(field.id)];
      cleared += 1;
    }
  });
  customFields = customFields.filter(item => item.id !== field.id);
  saveCustomFields();
  if (cleared) saveProjects();
  renderCustomFieldSettings();
  renderAll();
  showToast(cleared ? `Field "${field.label}" removed from ${cleared} ${cleared === 1 ? "project" : "projects"}` : `Field "${field.label}" removed`);
}

function renderCustomFieldInputs(project) {
  const host = document.querySelector("#projectCustomFields");
  const section = document.querySelector("#projectCustomSection");
  section.classList.toggle("hidden", customFields.length === 0);
  if (!customFields.length) { host.innerHTML = ""; return; }
  host.innerHTML = customFields.map(field => {
    const value = project ? customValue(project, field.id) : "";
    if (field.type === "select") {
      return `<label>${field.label}<select data-custom-field="${field.id}"><option value="">Not recorded</option>${field.options.map(option => `<option${option === value ? " selected" : ""}>${option}</option>`).join("")}</select></label>`;
    }
    const type = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
    return `<label>${field.label}<input type="${type}" data-custom-field="${field.id}" value="${value.replace(/"/g, "&quot;")}" placeholder="Not recorded"></label>`;
  }).join("");
}

function readCustomFieldInputs(existing) {
  const values = { ...(existing?.custom || {}) };
  customFields.forEach(field => {
    const input = document.querySelector(`[data-custom-field="${field.id}"]`);
    if (!input) return;
    const value = input.value.trim();
    if (value) values[String(field.id)] = value;
    else delete values[String(field.id)];
  });
  return values;
}

function projectCustomSection(project) {
  if (!customFields.length) return "";
  return `<section class="project-page-section">
    <div class="section-heading-row"><div><span class="section-kicker">Custom fields</span><h2>Recorded for this workspace</h2></div><button class="secondary-button" data-edit-project="${project.id}" type="button">${iconMarkup("pencil-line")}Edit</button></div>
    <div class="custom-value-grid">${customFields.map(field => {
      const value = customValue(project, field.id);
      return `<div class="custom-value"><span>${field.label}</span><strong${value ? "" : ' class="custom-value-empty"'}>${value || "Not recorded"}</strong></div>`;
    }).join("")}</div>
  </section>`;
}

// ---------------------------------------------------------------------------
// The alerts digest.
// This app has no server, so nothing can be pushed to anyone. What it can do
// honestly is compute, on demand, the things in the current data that need a
// decision - and say plainly that that is what it is.
// ---------------------------------------------------------------------------
const MILESTONE_HORIZON_DAYS = 30;

function portfolioAlerts() {
  const alerts = [];
  const conflicts = dependencyLinks().filter(link => link.conflict);
  conflicts.forEach(link => alerts.push({
    tone: "critical",
    icon: "git-merge",
    title: `${link.dependent.name} starts before ${link.predecessor.name} ends`,
    detail: `Declared dependency, ${link.days} ${link.days === 1 ? "day" : "days"} of overlap.`,
    projectId: link.dependent.id
  }));
  releases.filter(release => release.status !== "Cancelled").forEach(release => {
    releaseRisks(release).forEach(project => alerts.push({
      tone: "critical",
      icon: "package",
      title: `${project.name} cannot ship in ${release.name}`,
      detail: `It ends ${formatDate(project.end)}, after the ${formatDate(release.date)} release date.`,
      projectId: project.id
    }));
  });
  const horizon = new Date(AS_OF_DATE.getTime() + MILESTONE_HORIZON_DAYS * DAY);
  getFiscalProjects()
    .filter(project => {
      const date = new Date(`${project.milestoneDate}T12:00:00`);
      return date >= AS_OF_DATE && date <= horizon;
    })
    .forEach(project => alerts.push({
      tone: "warning",
      icon: "flag",
      title: `${project.milestone} due on ${project.name}`,
      detail: `${formatDate(project.milestoneDate)} - within ${MILESTONE_HORIZON_DAYS} days of ${AS_OF_LONG}.`,
      projectId: project.id
    }));
  getFiscalProjects()
    .filter(project => statusGroups.attention.includes(project.status))
    .forEach(project => alerts.push({
      tone: project.status === "Off track" ? "critical" : "warning",
      icon: "triangle-alert",
      title: `${project.name} is ${project.status.toLowerCase()}`,
      detail: `${project.progress}% complete, owned by ${project.owner}.`,
      projectId: project.id
    }));
  const reviewing = ideas.filter(idea => idea.status === "Reviewing");
  if (reviewing.length) alerts.push({
    tone: "info",
    icon: "lightbulb",
    title: `${reviewing.length} ${reviewing.length === 1 ? "idea is" : "ideas are"} waiting on a review decision`,
    detail: reviewing.map(idea => idea.title).join("; "),
    view: "ideas"
  });
  const unlinked = getFiscalProjects().filter(project => !project.goalIds.length).length;
  if (unlinked && (roadmapStrategy.goals || []).length) alerts.push({
    tone: "info",
    icon: "target",
    title: `${unlinked} ${unlinked === 1 ? "initiative is" : "initiatives are"} not linked to a strategic goal`,
    detail: "Link them on the initiative, or filter the list by goal to work through them.",
    goalScope: "none"
  });
  return alerts;
}

function renderAlerts() {
  const alerts = portfolioAlerts();
  const critical = alerts.filter(alert => alert.tone === "critical").length;
  const total = alerts.length + (workspaceActive() ? workspace.unread : 0);
  const dot = document.querySelector("#notificationButton .notification-dot");
  if (dot) {
    dot.textContent = total > 99 ? "99+" : String(total);
    dot.classList.toggle("hidden", total === 0);
    dot.classList.toggle("critical", critical > 0);
  }
  renderWorkspaceActivity();
  document.querySelector("#notificationButton").setAttribute("aria-label", alerts.length
    ? `Alerts, ${alerts.length} needing attention`
    : "Alerts, nothing needing attention");
  const host = document.querySelector("#alertList");
  if (!host) return;
  document.querySelector("#alertCount").textContent = alerts.length;
  host.innerHTML = alerts.length
    ? alerts.slice(0, 40).map(alert => `<button class="alert-item alert-${alert.tone}" type="button"${alert.projectId ? ` data-open-project="${alert.projectId}"` : ""}${alert.view ? ` data-view="${alert.view}"` : ""}${alert.goalScope ? ` data-goal-scope="${alert.goalScope}"` : ""}>
        <span class="alert-icon">${iconMarkup(alert.icon)}</span>
        <span><strong>${alert.title}</strong><small>${alert.detail}</small></span>
        ${iconMarkup("chevron-right")}
      </button>`).join("")
    : `<p class="alignment-empty">Nothing needs attention in the current data: no dependency conflicts, no initiative missing its release date, no milestone inside ${MILESTONE_HORIZON_DAYS} days, and nothing at risk.</p>`;
  refreshIcons();
}

function toggleAlertPanel(force) {
  const panel = document.querySelector("#alertPanel");
  const open = force === undefined ? panel.classList.contains("hidden") : force;
  if (open) {
    renderAlerts();
    if (workspaceActive() && workspace.unread) {
      workspace.unread = 0;
      api("POST", "/api/notifications/read").then(() => refreshNotifications()).catch(() => renderAlerts());
    }
  }
  panel.classList.toggle("hidden", !open);
  document.querySelector("#notificationButton").setAttribute("aria-expanded", String(open));
}

// ===========================================================================
// Shared workspaces.
//
// The app works on its own with nothing but this browser's storage - that is
// still the fallback, and nothing below changes it. When a server is reachable
// and someone is signed in, the same records are kept in a workspace instead,
// so colleagues see each other's work and are told when it changes.
//
// Two rules this code holds to:
// - The server decides what a person may do. A refusal is shown and the local
//   copy is put back, rather than the client pretending a save worked.
// - Nothing is merged silently. A collision hands back the newer record and
//   says who changed it.
// ===========================================================================
const WORKSPACE_KINDS = {
  projects: { label: "the portfolio", apply: data => { projects = applyLmsDeckStructure(applyCraDeckStructure(applyPaymentsDeckStructure(applyEservicesDeckStructure(applyWalletDeckStructure(applyUiamDeckStructure(consolidateUnifiedMessaging(consolidatePrivacyPortal(data.map(normalizeProjectUnit))))))))).map(normalizeProjectAlignment); } },
  teams: { label: "the team directory", apply: data => { teamDirectory = data.map(normalizeTeamRoles); } },
  strategy: { label: "the roadmap strategy", apply: data => { roadmapStrategy = data; } },
  ideas: { label: "the idea board", apply: data => { ideas = data.map(normalizeIdea); } },
  feedback: { label: "customer feedback", apply: data => { feedbackEntries = data.map(normalizeFeedback); } },
  releases: { label: "the release plan", apply: data => { releases = data.map(normalizeRelease); } },
  specs: { label: "specifications", apply: data => { projectSpecs = data; } },
  notes: { label: "notes", apply: data => { projectNotes = data; } },
  history: { label: "change history", apply: data => { projectHistory = data; } },
  fields: { label: "custom fields", apply: data => { customFields = data.map(normalizeCustomField); } },
  views: { label: "saved views", apply: data => { savedViews = data; } },
  settings: { label: "workspace settings", apply: data => {
    scoreModel = SCORE_MODELS[data?.scoreModel] ? data.scoreModel : DEFAULT_SCORE_MODEL;
    customTaxonomy = normalizeTaxonomy(data?.taxonomy);
    localStorage.setItem(STORAGE.taxonomy, JSON.stringify(customTaxonomy));
  } }
};
const WORKSPACE_LOCAL_KEY = "pb-active-workspace-v1";

const workspace = {
  available: false,   // a server answered
  user: null,
  id: null,
  name: "",
  role: null,
  shareToken: null,
  shareLabel: "",
  versions: {},
  members: [],
  shareLinks: [],
  activity: [],
  viewers: [],
  unread: 0,
  clientToken: `c${Math.random().toString(36).slice(2, 10)}`,
  stream: null,
  applying: false,
  pushing: new Set(),
  lastError: ""
};

function workspaceActive() {
  return Boolean(workspace.available && workspace.id);
}

function canEditWorkspace() {
  return !workspaceActive() || workspace.role === "owner" || workspace.role === "editor";
}

function isWorkspaceOwner() {
  return workspaceActive() && workspace.role === "owner" && !workspace.shareToken;
}

async function api(method, path, body) {
  if (typeof fetch !== "function") throw new Error("offline");
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(workspace.shareToken ? { "X-Share-Token": workspace.shareToken } : {}),
      "X-Client-Token": workspace.clientToken
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

// A record is sent only when a workspace is open and the person may write. A
// viewer's attempt is refused out loud and the server's copy is restored, so
// what is on screen is never a change that did not happen.
async function pushRecords(kind, data, label) {
  if (!workspaceActive() || workspace.applying || !WORKSPACE_KINDS[kind]) return;
  if (!canEditWorkspace()) {
    showToast("Your access to this workspace is view only, so that change was not saved");
    await refreshWorkspaceSnapshot({ quiet: true });
    renderAll();
    return;
  }
  const payload = JSON.parse(JSON.stringify(data));
  workspace.pushing.add(kind);
  renderWorkspaceBar();
  try {
    const result = await api("PUT", `/api/workspaces/${workspace.id}/records/${kind}`, {
      data: payload,
      baseVersion: workspace.versions[kind] ?? 0,
      summary: `${workspace.user?.name || workspace.shareLabel || "A shared link"} updated ${label}`
    });
    workspace.versions[kind] = result.version;
    workspace.lastError = "";
  } catch (error) {
    if (error.status === 409) {
      // Someone else was faster. Take their record rather than overwrite it.
      applyWorkspaceRecord(kind, error.payload?.current, error.payload?.version);
      renderAll();
      showToast(`Someone else changed ${WORKSPACE_KINDS[kind].label} first - their version is now shown`);
    } else if (error.status === 403) {
      await refreshWorkspaceSnapshot({ quiet: true });
      renderAll();
      showToast(error.message);
    } else {
      workspace.lastError = error.message;
      showToast(`Saved in this browser, but not to the workspace: ${error.message}`);
    }
  } finally {
    workspace.pushing.delete(kind);
    renderWorkspaceBar();
  }
}

function applyWorkspaceRecord(kind, data, version) {
  const entry = WORKSPACE_KINDS[kind];
  if (!entry || data === null || data === undefined) return false;
  workspace.applying = true;
  try {
    entry.apply(data);
    if (version !== undefined) workspace.versions[kind] = version;
    // Keep this browser's copy in step, so a later offline session starts from
    // what the workspace last said.
    const storageKey = {
      projects: STORAGE.projects, teams: STORAGE.teams, strategy: STORAGE.roadmap, ideas: STORAGE.ideas,
      feedback: STORAGE.feedback, releases: STORAGE.releases, specs: STORAGE.specs, notes: STORAGE.notes,
      history: STORAGE.history, fields: STORAGE.fields, views: STORAGE.views
    }[kind];
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(data));
    if (kind === "settings") localStorage.setItem(STORAGE.scoreModel, scoreModel);
    return true;
  } catch (error) {
    console.error(`Could not apply ${kind} from the workspace:`, error.message);
    return false;
  } finally {
    workspace.applying = false;
  }
}

async function refreshWorkspaceSnapshot({ quiet = false, adoptLocal = false } = {}) {
  if (!workspace.id) return null;
  const snapshot = await api("GET", `/api/workspaces/${workspace.id}/snapshot`);
  workspace.role = snapshot.role;
  workspace.name = snapshot.workspace?.name || workspace.name;
  workspace.members = snapshot.members || [];
  workspace.shareLinks = snapshot.shareLinks || [];
  workspace.activity = snapshot.events || [];
  workspace.viewers = snapshot.viewers || [];
  if (snapshot.user) workspace.user = snapshot.user;
  if (snapshot.viaShare) workspace.shareLabel = snapshot.viaShare.label || "Shared link";
  // Settings first, always. It carries the unit and category lists, and a
  // project's category is validated against them as it loads - so applying
  // projects first would silently clear a category this workspace added, and
  // the next save would persist the loss.
  const kinds = Object.keys(snapshot.records || {});
  const ordered = ["settings", ...kinds.filter(kind => kind !== "settings")];
  ordered.filter(kind => kinds.includes(kind))
    .forEach(kind => applyWorkspaceRecord(kind, snapshot.records[kind], snapshot.versions[kind]));
  // An empty workspace that its owner has just opened takes this browser's
  // portfolio as its starting point - the alternative would be to show them an
  // empty app and lose their work.
  if (!kinds.length && adoptLocal && canEditWorkspace()) {
    await publishLocalToWorkspace();
  }
  if (!quiet) renderWorkspaceBar();
  return snapshot;
}

async function publishLocalToWorkspace() {
  const payloads = {
    settings: { scoreModel, taxonomy: customTaxonomy },
    projects, teams: teamDirectory, strategy: roadmapStrategy, ideas, feedback: feedbackEntries,
    releases, specs: projectSpecs, notes: projectNotes, history: projectHistory,
    fields: customFields, views: savedViews
  };
  for (const [kind, data] of Object.entries(payloads)) {
    try {
      const result = await api("PUT", `/api/workspaces/${workspace.id}/records/${kind}`, {
        data: JSON.parse(JSON.stringify(data)),
        summary: `${workspace.user?.name || "Someone"} published this browser's ${WORKSPACE_KINDS[kind].label} to the workspace`
      });
      workspace.versions[kind] = result.version;
    } catch (error) {
      showToast(`Could not publish ${WORKSPACE_KINDS[kind].label}: ${error.message}`);
      return false;
    }
  }
  showToast("This browser's portfolio is now the workspace's starting point");
  return true;
}

function openWorkspaceStream() {
  if (workspace.stream) { workspace.stream.close(); workspace.stream = null; }
  if (!workspace.id || typeof EventSource !== "function") return;
  const url = `/api/workspaces/${workspace.id}/stream?client=${encodeURIComponent(workspace.clientToken)}`
    + (workspace.shareToken ? `&share=${encodeURIComponent(workspace.shareToken)}` : "");
  const stream = new EventSource(url);
  workspace.stream = stream;
  stream.onmessage = message => {
    let frame = null;
    try { frame = JSON.parse(message.data); } catch { return; }
    if (frame.type === "records") {
      if (applyWorkspaceRecord(frame.kind, frame.data, frame.version)) {
        renderAll();
        showToast(`${frame.actor} updated ${WORKSPACE_KINDS[frame.kind]?.label || frame.kind}`);
      }
    } else if (frame.type === "event") {
      workspace.activity = [{ id: frame.id, actor_name: frame.actor, kind: frame.kind, summary: frame.summary, created_at: frame.at }, ...workspace.activity].slice(0, 40);
      workspace.unread += 1;
      renderAlerts();
      renderWorkspaceBar();
    } else if (frame.type === "presence") {
      workspace.viewers = frame.viewers || [];
      renderWorkspaceBar();
    }
  };
  stream.onerror = () => { renderWorkspaceBar(); };
}

async function openWorkspace(id, { adoptLocal = false } = {}) {
  workspace.id = Number(id);
  try {
    await refreshWorkspaceSnapshot({ adoptLocal });
    localStorage.setItem(WORKSPACE_LOCAL_KEY, String(workspace.id));
    openWorkspaceStream();
    renderAll();
    return true;
  } catch (error) {
    workspace.id = null;
    workspace.role = null;
    showToast(`Could not open that workspace: ${error.message}`);
    renderWorkspaceBar();
    return false;
  }
}

function leaveWorkspace() {
  if (workspace.stream) { workspace.stream.close(); workspace.stream = null; }
  workspace.id = null;
  workspace.role = null;
  workspace.shareToken = null;
  workspace.shareLabel = "";
  workspace.versions = {};
  workspace.members = [];
  workspace.shareLinks = [];
  workspace.activity = [];
  workspace.viewers = [];
  localStorage.removeItem(WORKSPACE_LOCAL_KEY);
  renderWorkspaceBar();
}

// Startup. A share link in the address bar wins, then a signed-in session,
// then this browser on its own.
async function bootstrapWorkspace() {
  if (typeof fetch !== "function") { renderWorkspaceBar(); return; }
  const params = new URLSearchParams(window.location.search);
  const shareToken = params.get("share");
  try {
    const me = await api("GET", "/api/me");
    workspace.available = true;
    workspace.user = me.user;
    workspace.unread = me.unread || 0;
    workspace.list = me.workspaces || [];
  } catch {
    workspace.available = false;
    renderWorkspaceBar();
    return;
  }
  if (shareToken) {
    try {
      const resolved = await api("GET", `/api/share/${shareToken}`);
      workspace.shareToken = shareToken;
      workspace.shareLabel = resolved.link.label || "Shared link";
      workspace.name = resolved.link.workspace_name;
      applyAuthState({ email: workspace.user?.email || "shared-link", name: workspace.user?.name || workspace.shareLabel });
      await openWorkspace(resolved.link.workspace_id);
      if (resolved.link.scope && Object.keys(resolved.link.scope).length) applyScope(resolved.link.scope);
      showToast(`Opened "${workspace.name}" through a shared link (${workspace.role})`);
      return;
    } catch (error) {
      showToast(`That shared link could not be opened: ${error.message}`);
    }
  }
  if (workspace.user) {
    applyAuthState({ email: workspace.user.email, name: workspace.user.name });
    const remembered = Number(localStorage.getItem(WORKSPACE_LOCAL_KEY));
    const chosen = (workspace.list || []).find(entry => entry.id === remembered) || (workspace.list || [])[0];
    if (chosen) await openWorkspace(chosen.id, { adoptLocal: true });
    await refreshNotifications();
  }
  renderWorkspaceBar();
}

async function refreshNotifications() {
  if (!workspace.available || !workspace.user) return;
  try {
    const result = await api("GET", "/api/notifications");
    workspace.notifications = result.notifications || [];
    workspace.unread = workspace.notifications.filter(entry => !entry.read_at).length;
    renderAlerts();
    renderWorkspaceBar();
  } catch { /* the digest still works from local data */ }
}

// --- Workspace UI ---------------------------------------------------------

function renderWorkspaceBar() {
  const dot = document.querySelector("#workspaceDot");
  const mode = document.querySelector("#workspaceMode");
  const name = document.querySelector("#workspaceName");
  const viewers = document.querySelector("#workspaceViewers");
  if (!dot) return;
  const pushing = workspace.pushing.size > 0;
  renderDefaultPasswordNotice();
  if (!workspace.available) {
    dot.className = "workspace-dot local";
    mode.textContent = "This browser only";
    name.textContent = "Local portfolio";
    viewers.textContent = "";
  } else if (!workspaceActive()) {
    dot.className = "workspace-dot local";
    mode.textContent = workspace.user ? "No workspace open" : "Not signed in";
    name.textContent = workspace.user ? "This browser only" : "Local portfolio";
    viewers.textContent = "";
  } else {
    dot.className = `workspace-dot ${workspace.lastError ? "error" : pushing ? "saving" : "live"}`;
    mode.textContent = workspace.shareToken
      ? `Shared link - ${workspace.role}`
      : `${workspace.role}${pushing ? " - saving" : workspace.lastError ? " - not saved" : " - live"}`;
    name.textContent = workspace.name || "Workspace";
    const others = workspace.viewers.filter(viewer => viewer.id !== workspace.user?.id);
    viewers.textContent = others.length ? `+${others.length}` : "";
    viewers.title = others.length ? `Also viewing: ${others.map(viewer => viewer.name).join(", ")}` : "";
  }
  renderWorkspacePanel();
}

function renderWorkspacePanel() {
  const host = document.querySelector("#workspacePanel");
  if (!host) return;
  if (!workspace.available) {
    host.innerHTML = `<p class="alignment-empty">This copy is running without a server, so the portfolio is stored in this browser only. Deploy the app with a database to share it with colleagues.</p>`;
    return;
  }
  if (!workspace.user && !workspace.shareToken) {
    host.innerHTML = `<p class="alignment-empty">Sign in to open a shared workspace. Until then everything is stored in this browser only.</p>`;
    return;
  }
  if (workspace.shareToken) {
    host.innerHTML = `<div class="settings-row"><div><strong>${workspace.name}</strong><small>Opened through a shared link with ${workspace.role} access${workspace.shareLabel ? ` - ${workspace.shareLabel}` : ""}</small></div></div>
      <p class="alignment-empty">A shared link cannot see who else has access, and cannot change it.</p>`;
    return;
  }
  const list = (workspace.list || []).map(entry => `<option value="${entry.id}"${entry.id === workspace.id ? " selected" : ""}>${entry.name} (${entry.role})</option>`).join("");
  host.innerHTML = `
    <div class="settings-add password-form">
      <div class="full-field"><strong>${workspace.user.password_is_default ? "Change the default password" : "Change your password"}</strong>${workspace.user.password_is_default ? `<small class="field-hint">This account is still on the password it was created with.</small>` : ""}</div>
      <label>Current password<input id="currentPasswordInput" type="password" autocomplete="current-password"></label>
      <label>New password<input id="newPasswordInput" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label>
      <button class="secondary-button" id="changePasswordButton" type="button">${iconMarkup("key-round")}Change password</button>
      <p class="score-preview full-field" id="passwordStatus"></p>
    </div>
    <div class="workspace-switch">
      <label>Open workspace<select id="workspaceSelect">${list || `<option value="">None yet</option>`}</select></label>
      <div class="workspace-new">
        <label>New workspace<input id="newWorkspaceName" maxlength="60" placeholder="e.g. Platforms Branch"></label>
        <button class="secondary-button" id="createWorkspaceButton" type="button">${iconMarkup("plus")}Create</button>
      </div>
    </div>
    ${workspaceActive() ? `
      <div class="settings-row"><div><strong>${workspace.name}</strong><small>You are ${workspace.role}. ${workspace.viewers.length} ${workspace.viewers.length === 1 ? "person" : "people"} connected.</small></div><button class="text-button" id="leaveWorkspaceButton" type="button">Work locally instead</button></div>
      <h4 class="workspace-subhead">${iconMarkup("users")}Who has access</h4>
      <div>${workspace.members.length
        ? workspace.members.map(member => `<div class="settings-row">
            <div><strong>${member.name}</strong><small>${member.email} - ${member.role}</small></div>
            ${isWorkspaceOwner() && member.id !== workspace.user?.id ? `<button class="text-button danger-text" data-remove-member="${member.id}" type="button">Remove</button>` : ""}
          </div>`).join("")
        : `<p class="alignment-empty">Only you.</p>`}</div>
      ${isWorkspaceOwner() ? `
        <div class="settings-add">
          <label>Give access to<input id="memberEmail" type="email" maxlength="120" placeholder="name@gov.ab.ca"></label>
          <label>Role<select id="memberRole"><option value="viewer">Viewer - read only</option><option value="editor">Editor - can change records</option><option value="owner">Owner - can also manage access</option></select></label>
          <button class="secondary-button" id="addMemberButton" type="button">${iconMarkup("user-round-plus")}Add</button>
        </div>
        <h4 class="workspace-subhead">${iconMarkup("link")}Share links</h4>
        <div>${workspace.shareLinks.length
          ? workspace.shareLinks.map(link => `<div class="settings-row">
              <div><strong>${link.label || "Untitled link"}</strong><small>${link.role} - ${link.expires_at ? `expires ${formatDate(String(link.expires_at).slice(0, 10))}` : "no expiry"}${Object.keys(link.scope || {}).length ? " - filtered" : ""}</small></div>
              <span class="release-card-actions"><button class="text-button" data-copy-link="${link.token}" type="button">Copy</button><button class="text-button danger-text" data-revoke-link="${link.token}" type="button">Revoke</button></span>
            </div>`).join("")
          : `<p class="alignment-empty">No share links yet. A link gives access without an account, and can be revoked at any time.</p>`}</div>
        <div class="settings-add">
          <label>Link label<input id="shareLinkLabel" maxlength="60" placeholder="e.g. Executive review"></label>
          <label>Access<select id="shareLinkRole"><option value="viewer">Viewer - read only</option><option value="editor">Editor - can change records</option></select></label>
          <label>Expires in days<input id="shareLinkDays" type="number" min="0" max="365" placeholder="blank for no expiry"></label>
          <label><input id="shareLinkScoped" type="checkbox"> Limit it to the filters showing now</label>
          <button class="secondary-button" id="createShareLinkButton" type="button">${iconMarkup("link")}Create link</button>
        </div>` : `<p class="alignment-empty">Only an owner can change who has access or create share links.</p>`}
    ` : ""}`;
  refreshIcons();
}

function workspaceLinkUrl(shareToken) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ share: shareToken }).toString();
  url.hash = "";
  return url.toString();
}

async function addWorkspaceMember() {
  const email = document.querySelector("#memberEmail").value.trim();
  const role = document.querySelector("#memberRole").value;
  if (!email) return;
  try {
    const result = await api("POST", `/api/workspaces/${workspace.id}/members`, { email, role });
    document.querySelector("#memberEmail").value = "";
    await refreshWorkspaceSnapshot();
    showToast(`${result.member.name} now has ${role} access`);
  } catch (error) {
    showToast(error.message);
  }
}

async function removeWorkspaceMember(userId) {
  try {
    await api("DELETE", `/api/workspaces/${workspace.id}/members/${userId}`);
    await refreshWorkspaceSnapshot();
    showToast("Access removed");
  } catch (error) {
    showToast(error.message);
  }
}

async function createWorkspaceShareLink() {
  const scoped = document.querySelector("#shareLinkScoped").checked;
  const days = document.querySelector("#shareLinkDays").value;
  try {
    const result = await api("POST", `/api/workspaces/${workspace.id}/share`, {
      role: document.querySelector("#shareLinkRole").value,
      label: document.querySelector("#shareLinkLabel").value.trim(),
      expiresInDays: days === "" ? null : Number(days),
      scope: scoped ? currentScope() : {}
    });
    await refreshWorkspaceSnapshot();
    openShareModal(workspaceLinkUrl(result.link.token),
      `Anyone with this link gets ${result.link.role} access to ${workspace.name}${scoped ? ", limited to the filters showing now" : ""}. Revoke it under Settings when it is no longer needed.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function revokeWorkspaceShareLink(shareToken) {
  try {
    await api("DELETE", `/api/workspaces/${workspace.id}/share/${shareToken}`);
    await refreshWorkspaceSnapshot();
    showToast("Link revoked - it no longer opens this workspace");
  } catch (error) {
    showToast(error.message);
  }
}

async function createWorkspace() {
  const name = document.querySelector("#newWorkspaceName").value.trim();
  if (!name) return;
  try {
    const result = await api("POST", "/api/workspaces", { name });
    workspace.list = [...(workspace.list || []), { ...result.workspace, member_count: 1 }];
    document.querySelector("#newWorkspaceName").value = "";
    await openWorkspace(result.workspace.id, { adoptLocal: true });
    showToast(`Workspace "${name}" created`);
  } catch (error) {
    showToast(error.message);
  }
}

function renderWorkspaceActivity() {
  const host = document.querySelector("#alertActivity");
  const list = document.querySelector("#alertActivityList");
  if (!host || !list) return;
  const entries = workspace.notifications?.length
    ? workspace.notifications.map(entry => ({ who: entry.actor_name, what: entry.summary, when: entry.created_at, unread: !entry.read_at }))
    : workspace.activity.map(entry => ({ who: entry.actor_name, what: entry.summary, when: entry.created_at, unread: false }));
  host.classList.toggle("hidden", !workspaceActive() || !entries.length);
  list.innerHTML = entries.slice(0, 12).map(entry => `<div class="activity-item${entry.unread ? " activity-unread" : ""}">
      <span class="avatar">${initials(entry.who || "?")}</span>
      <span><strong>${entry.what}</strong><small>${formatDateTime(entry.when)}</small></span>
    </div>`).join("");
}

function renderProjectPage(projectId) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project) return;
  const halfway = new Date((new Date(project.start).getTime() + new Date(project.end).getTime()) / 2).toISOString().slice(0, 10);
  const dates = [
    ["Kickoff", project.start, true],
    ["Midpoint review", halfway, project.progress >= 50],
    [project.milestone, project.milestoneDate, false],
    ["Target completion", project.end, false]
  ];
  elements.projectDetail.innerHTML = `
    <button class="project-page-back" data-return-projects type="button">${iconMarkup("arrow-left")} All projects</button>
    <header class="project-page-header">
      <div class="project-page-identity"><span class="project-icon teal">${initials(project.name)}</span><div><p class="eyebrow">${project.team} portfolio</p><h1 id="projectDetailTitle">${project.name}</h1><p>${project.objective}</p></div></div>
      <div class="project-page-actions"><span class="status-pill status-${slug(project.status)}">${project.status}</span><button class="secondary-button" data-share-project="${project.id}" type="button">${iconMarkup("share-2")}Share</button><button class="danger-button" data-delete-project="${project.id}" type="button">${iconMarkup("trash-2")}Delete</button><button class="primary-button" data-edit-project="${project.id}" type="button">${iconMarkup("pencil")}Edit project</button></div>
    </header>
    <div class="project-page-stats">
      <div><span>Owner</span><strong><i class="avatar">${initials(project.owner)}</i>${project.owner}</strong></div>
      <div><span>Branch Unit</span><strong>${project.unit}</strong></div>
      ${project.subUnit ? `<div><span>Unit${project.subCategory ? " / Category" : ""}</span><strong>${project.subUnit}${project.subCategory ? ` / ${project.subCategory}` : ""}</strong></div>` : ""}
      <div><span>Timeline</span><strong>${formatDate(project.start)} - ${formatDate(project.end)}</strong></div>
      <div><span>FY / quarter</span><strong>${fiscalSpanLabel(project)}</strong></div>
      <div><span>Priority</span><strong>${project.priority}</strong></div>
      <div><span>Risk level</span><strong class="risk-text-${project.risk.toLowerCase()}">${project.risk}</strong></div>
      <div><span>Approx. cost</span><strong>${formatCurrency(project.approxCost)}</strong></div>
    </div>
    <div class="project-detail-grid">
      <div class="project-detail-main">
        <section class="panel project-progress-panel">
          <div class="panel-heading"><div><span class="section-kicker">Delivery status</span><h2>Overall progress</h2></div><strong class="detail-progress-value">${project.progress}%</strong></div>
          <div class="progress-track detail-progress"><span style="width:${project.progress}%"></span></div>
          <div class="progress-scale"><span>Started ${formatDate(project.start)}</span><span>Target ${formatDate(project.end)}</span></div>
        </section>
        <section class="project-page-section">
          <div class="section-heading-row"><div><span class="section-kicker">Execution</span><h2>Project Phases</h2></div><span class="detail-count">${project.phases.length} ${project.phases.length === 1 ? "phase" : "phases"}</span></div>
          ${project.phases.length
            ? `<div class="detail-phase-grid">${project.phases.map((phase, index) => `<button class="detail-phase-card" data-edit-phase="${index}" data-project-id="${project.id}" type="button" aria-label="Edit ${phase.name}"><div class="detail-phase-top"><span class="phase-index">${index + 1}</span><span class="status-pill status-${slug(phase.status)}">${phase.status}</span></div><h3>${phase.name}</h3><p>${phase.start && phase.end ? `${formatDate(phase.start)} - ${formatDate(phase.end)}` : "No dates set"}</p>${phase.objective ? `<p class="detail-phase-note">${phase.objective}</p>` : ""}${!hasPhaseProgress(phase) ? `<p class="detail-phase-note detail-phase-unset" data-phase-field="progress">No progress recorded - set it for this phase</p>` : `<div class="detail-phase-progress" data-phase-field="progress" title="Set this phase's own progress"><div class="progress-track"><span style="width:${phase.progress}%"></span></div><strong>${phase.progress}%</strong></div>`}<span class="card-link">Edit phase ${iconMarkup("pencil-line")}</span></button>`).join("")}</div>`
            : `<div class="detail-phase-empty"><p>No phases recorded for this project yet.</p><button class="secondary-button" data-edit-phase="new" data-project-id="${project.id}" type="button">${iconMarkup("plus")}Add a phase</button></div>`}
        </section>
        ${projectAlignmentSection(project)}
        ${projectCustomSection(project)}
        ${projectSpecSection(project)}
        ${projectNotesSection(project)}
      </div>
      <aside class="project-detail-side">
        <section class="panel detail-side-panel"><div class="panel-heading"><div><span class="section-kicker">Schedule</span><h2>Milestones</h2></div>${iconMarkup("flag")}</div><div class="page-milestones">${dates.map(item => `<div class="page-milestone ${item[2] ? "complete" : ""}"><i>${item[2] ? iconMarkup("check") : ""}</i><span><strong>${item[0]}</strong><small>${formatDate(item[1], { month: "short", day: "numeric", year: "numeric" })}</small></span></div>`).join("")}</div></section>
        <section class="panel detail-side-panel"><div class="panel-heading"><div><span class="section-kicker">People</span><h2>Project team</h2></div><span class="detail-count">${project.members.length}</span></div><div class="page-team-list">${project.members.map((member, index) => `<div><span class="avatar">${member}</span><span><strong>${project.memberNames?.[index] || (index === 0 ? project.owner : `Team member ${index + 1}`)}</strong><small>${index === 0 ? "Project owner" : project.team}</small></span></div>`).join("")}</div></section>
        <section class="risk-callout risk-${project.risk.toLowerCase()}">${iconMarkup(project.risk === "High" ? "triangle-alert" : "shield-check")}<span><strong>${project.risk} delivery risk</strong><small>${project.status === "Off track" ? "Executive intervention and recovery planning are recommended." : "Reviewed during the weekly portfolio cadence."}</small></span></section>
      </aside>
    </div>
    <div class="project-page-footer"><button class="project-page-back" data-return-projects type="button">${iconMarkup("arrow-left")} Return to all projects</button><span>Last portfolio update: Sep 10, 2026</span></div>`;
  closeDrawer();
  activeView = "project-detail";
  document.body.dataset.workspace = "project-detail";
  document.querySelectorAll(".view").forEach(item => item.classList.remove("active"));
  document.querySelector("#projectDetailView").classList.add("active");
  document.querySelector("#sidebar").classList.remove("open");
  document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === "projects"));
  updateWorkspaceContext("project-detail");
  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshIcons();
}

function returnToProjects() {
  switchView("projects");
  window.setTimeout(() => document.querySelector("#allProjectsTitle").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
}

function bandByKey(key) {
  return unitMixBands.find(band => band.key === key) || null;
}

function matchesStatusFilter(project) {
  if (!statusFilter.startsWith("band:")) return project.status === statusFilter;
  const band = bandByKey(statusFilter.slice(5));
  return Boolean(band) && band.statuses.includes(project.status);
}

function statusFilterLabel() {
  if (statusFilter === "all") return "All statuses";
  if (!statusFilter.startsWith("band:")) return statusFilter;
  const band = bandByKey(statusFilter.slice(5));
  return band ? band.label : "All statuses";
}

function matchesUnitFilter(project) {
  if (unitFilter.startsWith("sub2:")) {
    const [unit, category, sub] = unitFilter.slice(5).split("::");
    return project.unit === unit && project.subUnit === category && project.subCategory === sub;
  }
  if (!unitFilter.startsWith("sub:")) return project.unit === unitFilter;
  const [unit, sub] = unitFilter.slice(4).split("::");
  return project.unit === unit && project.subUnit === sub;
}

function loadCollapsedUnits() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.collapsed));
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

function saveCollapsedUnits() {
  localStorage.setItem(STORAGE.collapsed, JSON.stringify([...collapsedUnits]));
}

const TIMELINE_LABEL = { min: 150, max: 560, initial: 268 };  // keep in step with --timeline-label-width

function timelineLabelWidth() {
  const stored = Number(localStorage.getItem(STORAGE.labelWidth));
  if (!Number.isFinite(stored) || stored <= 0) return TIMELINE_LABEL.initial;
  return Math.min(TIMELINE_LABEL.max, Math.max(TIMELINE_LABEL.min, Math.round(stored)));
}

function applyTimelineLabelWidth(width, persist = true) {
  const clamped = Math.min(TIMELINE_LABEL.max, Math.max(TIMELINE_LABEL.min, Math.round(width)));
  document.documentElement.style.setProperty("--timeline-label-width", `${clamped}px`);
  document.querySelectorAll(".timeline-resizer").forEach(handle => {
    handle.setAttribute("aria-valuenow", String(clamped));
    handle.title = `Drag to resize the ${handle.dataset.resizeLabel || "label"} column (${clamped}px). Double-click to reset.`;
  });
  if (persist) localStorage.setItem(STORAGE.labelWidth, String(clamped));
  return clamped;
}

const TIMELINE_VIEWPORT = { min: 320, max: 1400 };
function storedTimelineViewport() {
  const stored = Number(localStorage.getItem(STORAGE.viewport));
  if (!Number.isFinite(stored) || stored <= 0) return null;
  return Math.min(TIMELINE_VIEWPORT.max, Math.max(TIMELINE_VIEWPORT.min, Math.round(stored)));
}

function initTimelineViewports() {
  const stored = storedTimelineViewport();
  document.querySelectorAll(".roadmap-scroll").forEach(view => {
    if (stored) view.style.height = `${stored}px`;
    if (typeof ResizeObserver !== "function") return;
    let timer = null;
    new ResizeObserver(entries => {
      const height = Math.round(entries[0].contentRect.height);
      if (!height || height === storedTimelineViewport()) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        localStorage.setItem(STORAGE.viewport, String(height));
        document.querySelectorAll(".roadmap-scroll").forEach(other => {
          if (other !== view) other.style.height = `${height}px`;
        });
      }, 250);
    }).observe(view);
  });
}

function timelineResizerMarkup(label) {
  const width = timelineLabelWidth();
  return `<button class="timeline-resizer" data-timeline-resizer data-resize-label="${label}" type="button" role="separator" aria-orientation="vertical" aria-label="Resize the ${label} column" aria-valuemin="${TIMELINE_LABEL.min}" aria-valuemax="${TIMELINE_LABEL.max}" aria-valuenow="${width}" title="Drag to resize the ${label} column (${width}px). Double-click to reset."></button>`;
}

// One collapse control, used at all three levels of the overview. The key a
// branch unit collapses under is its own name; a unit and a category are
// prefixed the way the unit filter names them, so a single stored set holds
// every level without the three ever colliding.
function groupToggleMarkup(key, label) {
  const collapsed = collapsedUnits.has(key);
  const action = collapsed ? "Expand" : "Collapse";
  return `<button class="section-collapse" data-toggle-unit="${key.replace(/"/g, "&quot;")}" type="button" aria-expanded="${!collapsed}" title="${action} ${label}" aria-label="${action} ${label}">${collapsed ? "+" : "\u2212"}</button>`;
}

function unitToggleMarkup(unit) {
  return groupToggleMarkup(unit, unit);
}

function unitGroupKey(unit, subUnit) {
  return `sub:${unit}::${subUnit}`;
}

function categoryGroupKey(unit, subUnit, subCategory) {
  return `sub2:${unit}::${subUnit}::${subCategory}`;
}

function projectCountLabel(count) {
  return `${count} ${count === 1 ? "project" : "projects"}`;
}

// The unit and category bands of the table, each able to roll its projects up.
// A collapsed band keeps its own heading and count, so what is hidden is still
// named and the control stays where it was.
function projectTableGroupsMarkup(unit, unitProjects) {
  return subGroupsFor(unit, unitProjects).map(group => {
    const unitKey = group.sub ? unitGroupKey(unit, group.sub) : "";
    const unitCollapsed = Boolean(unitKey) && collapsedUnits.has(unitKey);
    const unitHeading = group.sub
      ? `<tr class="project-subunit-table-heading${unitCollapsed ? " collapsed" : ""}"><td colspan="8"><div>${groupToggleMarkup(unitKey, group.sub)}<span>${iconMarkup("corner-down-right")}</span><strong>${group.sub}</strong><small>${projectCountLabel(group.items.length)}</small></div></td></tr>`
      : "";
    if (unitCollapsed) return unitHeading;
    return unitHeading + nestedGroupsFor(unit, group.sub, group.items).map(nested => {
      const catKey = nested.subCategory ? categoryGroupKey(unit, group.sub, nested.subCategory) : "";
      const catCollapsed = Boolean(catKey) && collapsedUnits.has(catKey);
      const catHeading = nested.subCategory
        ? `<tr class="project-subcategory-table-heading${catCollapsed ? " collapsed" : ""}"><td colspan="8"><div>${groupToggleMarkup(catKey, nested.subCategory)}<span>${iconMarkup("corner-down-right")}</span><strong>${nested.subCategory}</strong><small>${projectCountLabel(nested.items.length)}</small></div></td></tr>`
        : "";
      if (catCollapsed) return catHeading;
      return catHeading + nested.items.map(project => `${projectRow(project, projects.indexOf(project))}${projectPhaseRow(project)}`).join("");
    }).join("");
  }).join("");
}

// The same three levels in the card layout.
function projectCardGroupsMarkup(unit, unitProjects) {
  return subGroupsFor(unit, unitProjects).map(group => {
    const unitKey = group.sub ? unitGroupKey(unit, group.sub) : "";
    const unitCollapsed = Boolean(unitKey) && collapsedUnits.has(unitKey);
    const unitHeading = group.sub
      ? `<div class="project-subunit-heading${unitCollapsed ? " collapsed" : ""}">${groupToggleMarkup(unitKey, group.sub)}${iconMarkup("corner-down-right")}<strong>${group.sub}</strong><small>${projectCountLabel(group.items.length)}</small></div>`
      : "";
    if (unitCollapsed) return unitHeading;
    return unitHeading + nestedGroupsFor(unit, group.sub, group.items).map(nested => {
      const catKey = nested.subCategory ? categoryGroupKey(unit, group.sub, nested.subCategory) : "";
      const catCollapsed = Boolean(catKey) && collapsedUnits.has(catKey);
      const catHeading = nested.subCategory
        ? `<div class="project-subcategory-heading${catCollapsed ? " collapsed" : ""}">${groupToggleMarkup(catKey, nested.subCategory)}${iconMarkup("corner-down-right")}<strong>${nested.subCategory}</strong><small>${projectCountLabel(nested.items.length)}</small></div>`
        : "";
      if (catCollapsed) return catHeading;
      return catHeading + `<div class="project-unit-card-grid">${nested.items.map(project => projectCard(project, projects.indexOf(project))).join("")}</div>`;
    }).join("");
  }).join("");
}

function subGroupsFor(unit, unitProjects) {
  const groups = [];
  const loose = unitProjects.filter(project => !project.subUnit);
  if (loose.length) groups.push({ sub: "", items: loose });
  subCategoriesFor(unit).forEach(sub => {
    const items = unitProjects.filter(project => project.subUnit === sub);
    if (items.length) groups.push({ sub, items });
  });
  return groups;
}

// The level below a category. A category with no sub-categories returns one
// unnamed group, so every caller can treat the structure the same way.
function nestedGroupsFor(unit, category, items) {
  // Declared order first, then any category the projects themselves carry that
  // the list does not know about, so nothing is grouped out of sight.
  const declared = subCategoryOptionsFor(unit, category);
  const present = [...new Set(items.map(project => project.subCategory).filter(Boolean))];
  const order = [...declared.filter(sub => present.includes(sub)), ...present.filter(sub => !declared.includes(sub))];
  if (!order.length) return [{ subCategory: "", items }];
  const groups = [];
  const loose = items.filter(project => !project.subCategory);
  if (loose.length) groups.push({ subCategory: "", items: loose });
  order.forEach(sub => {
    const list = items.filter(project => project.subCategory === sub);
    if (list.length) groups.push({ subCategory: sub, items: list });
  });
  return groups;
}

function renderProjects() {
  const filtered = getFilteredProjects();
  // declared unit order, matching the roadmap and the unit mix card
  const byUnit = filtered.reduce((groups, project) => {
    const unit = project.unit || "Not assigned";
    if (!groups.has(unit)) groups.set(unit, []);
    groups.get(unit).push(project);
    return groups;
  }, new Map());
  const ordered = [...projectUnits, ...[...byUnit.keys()].filter(unit => !projectUnits.includes(unit))];
  const grouped = ordered.filter(unit => byUnit.has(unit)).map(unit => [unit, byUnit.get(unit)]);
  elements.projectCount.textContent = `(${filtered.length})`;
  elements.tableBody.innerHTML = grouped.map(([unit, unitProjects]) => `<tr class="project-unit-table-heading${collapsedUnits.has(unit) ? " collapsed" : ""}"><td colspan="8"><div>${unitToggleMarkup(unit)}<span>${iconMarkup("building-2")}</span><strong>${unit}</strong><small>${projectCountLabel(unitProjects.length)}</small></div></td></tr>${collapsedUnits.has(unit) ? "" : projectTableGroupsMarkup(unit, unitProjects)}`).join("");
  elements.cardLayout.innerHTML = grouped.map(([unit, unitProjects]) => `<section class="project-unit-group"><div class="project-unit-heading">${unitToggleMarkup(unit)}<span class="project-unit-heading-icon">${iconMarkup("building-2")}</span><div><span>Branch Unit</span><h3>${unit}</h3></div><strong>${projectCountLabel(unitProjects.length)}</strong></div>${collapsedUnits.has(unit) ? "" : projectCardGroupsMarkup(unit, unitProjects)}</section>`).join("");
  const empty = filtered.length === 0;
  elements.emptyState.classList.toggle("hidden", !empty);
  elements.tableLayout.classList.toggle("hidden", empty || activeLayout !== "table");
  elements.cardLayout.classList.toggle("hidden", empty || activeLayout !== "cards");
  elements.timelineLayout.classList.toggle("hidden", empty || activeLayout !== "timeline");
  elements.boardLayout.classList.toggle("hidden", empty || activeLayout !== "board");
  document.querySelector("#boardNote").classList.toggle("hidden", empty || activeLayout !== "board");
  if (activeLayout === "timeline" && !empty) { renderProjectTimeline(grouped); renderStatusLegend("#projectStatusLegend", filtered); }
  if (activeLayout === "board" && !empty) renderProjectBoard(filtered);
  refreshIcons();
}

function populateTeamFilters() {
  const teams = [...new Set(projects.map(project => project.team))].sort();
  const units = [...new Set(projects.map(project => project.unit || "Not assigned"))].sort();
  const options = `<option value="all">All teams</option>${teams.map(team => `<option value="${team}">${team}</option>`).join("")}`;
  document.querySelector("#teamFilter").innerHTML = options;
  document.querySelector("#roadmapTeamFilter").innerHTML = options;
  document.querySelector("#reportTeam").innerHTML = options;
  document.querySelector("#teamFilter").value = teamFilter;
  document.querySelector("#roadmapTeamFilter").value = teamFilter;
  document.querySelector("#reportTeam").value = reportTeam;
  const unitOptions = units.map(unit => {
    const subs = subCategoriesFor(unit).filter(sub => projects.some(project => project.unit === unit && project.subUnit === sub));
    return `<option value="${unit}">${unit}</option>` + subs.map(sub => {
      const nested = subCategoryOptionsFor(unit, sub).filter(inner => projects.some(project => project.unit === unit && project.subUnit === sub && project.subCategory === inner));
      return `<option value="sub:${unit}::${sub}">&nbsp;&nbsp;&#8627; ${sub}</option>`
        + nested.map(inner => `<option value="sub2:${unit}::${sub}::${inner}">&nbsp;&nbsp;&nbsp;&nbsp;&#8627; ${inner}</option>`).join("");
    }).join("");
  }).join("");
  const statusOptions = `<option value="all">All statuses</option>`
    + unitMixBands.map(band => `<option value="band:${band.key}">&nbsp;&nbsp;&#8627; ${band.label}</option>`).join("")
    + projectStatuses.map(status => `<option value="${status}">${status}</option>`).join("");
  document.querySelector("#statusFilter").innerHTML = statusOptions;
  const statusValues = ["all", ...unitMixBands.map(band => `band:${band.key}`), ...projectStatuses];
  document.querySelector("#statusFilter").value = statusValues.includes(statusFilter) ? statusFilter : "all";
  const owners = [...new Set(projects.map(project => project.owner).filter(Boolean))].sort();
  document.querySelector("#ownerFilter").innerHTML = `<option value="all">All owners</option>${owners.map(owner => `<option value="${owner}">${owner}</option>`).join("")}`;
  document.querySelector("#ownerFilter").value = owners.includes(ownerFilter) ? ownerFilter : "all";
  const risks = ["High", "Medium", "Low"].filter(risk => projects.some(project => project.risk === risk));
  document.querySelector("#riskFilter").innerHTML = `<option value="all">All risk levels</option>${risks.map(risk => `<option value="${risk}">${risk}</option>`).join("")}`;
  document.querySelector("#riskFilter").value = risks.includes(riskFilter) ? riskFilter : "all";
  document.querySelector("#unitFilter").innerHTML = `<option value="all">All branch units</option>${unitOptions}`;
  const unitValues = ["all", ...units,
    ...units.flatMap(unit => subCategoriesFor(unit).map(sub => `sub:${unit}::${sub}`)),
    ...units.flatMap(unit => subCategoriesFor(unit).flatMap(sub => subCategoryOptionsFor(unit, sub).map(inner => `sub2:${unit}::${sub}::${inner}`)))];
  document.querySelector("#unitFilter").value = unitValues.includes(unitFilter) ? unitFilter : "all";
  const goals = roadmapStrategy.goals || [];
  const unlinked = projects.filter(project => !project.goalIds.length).length;
  document.querySelector("#goalFilter").innerHTML = `<option value="all">All goals</option>`
    + goals.map(goal => `<option value="${goal.id}">${goal.title} (${goalInitiatives(goal.id).length})</option>`).join("")
    + (unlinked ? `<option value="none">Not linked to a goal (${unlinked})</option>` : "");
  const goalValues = ["all", ...goals.map(goal => String(goal.id)), ...(unlinked ? ["none"] : [])];
  if (!goalValues.includes(goalFilter)) goalFilter = "all";
  document.querySelector("#goalFilter").value = goalFilter;
}

function populateFiscalYearFilters() {
  const projectYears = projects.flatMap(project => [getFiscalYear(new Date(`${project.start}T12:00:00`)), getFiscalYear(new Date(`${project.end}T12:00:00`))]);
  const years = [...new Set([selectedFiscalYear - 1, selectedFiscalYear, selectedFiscalYear + 1, ...projectYears])].sort((a, b) => a - b);
  const options = years.map(year => `<option value="${year}">${fiscalYearLabel(year)} · Apr ${year - 1} - Mar ${year}</option>`).join("");
  document.querySelector("#projectFiscalYear").innerHTML = options;
  document.querySelector("#roadmapFiscalYear").innerHTML = options;
  document.querySelector("#reportFiscalYear").innerHTML = options;
  document.querySelector("#projectFiscalYear").value = selectedFiscalYear;
  document.querySelector("#roadmapFiscalYear").value = selectedFiscalYear;
  document.querySelector("#reportFiscalYear").value = selectedFiscalYear;
  updateFiscalYearLabels();
}

function updateFiscalYearLabels() {
  const { start, end } = fiscalYearBounds();
  document.querySelector("#roadmapFiscalLabel").textContent = fiscalYearLabel(selectedFiscalYear);
  document.querySelector("#currentDate").textContent = `${fiscalYearLabel(selectedFiscalYear)} · ${formatDate(start.toISOString().slice(0, 10), { month: "short", day: "numeric", year: "numeric" })} - ${formatDate(end.toISOString().slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}`;
  document.querySelector("#reportAsOf").textContent = `As of ${AS_OF_LONG}`;
}

function setFiscalYear(year) {
  selectedFiscalYear = Number(year);
  document.querySelector("#projectFiscalYear").value = selectedFiscalYear;
  document.querySelector("#roadmapFiscalYear").value = selectedFiscalYear;
  document.querySelector("#reportFiscalYear").value = selectedFiscalYear;
  updateFiscalYearLabels();
  renderMetrics();
  renderHealth();
  renderAttention();
  renderProjects();
  renderRoadmap();
  renderReports();
}

function getReportProjects() {
  return getFiscalProjects().filter(project => (reportTeam === "all" || project.team === reportTeam) && (reportStatus === "all" || project.status === reportStatus));
}

function scheduleVariance(project) {
  if (Number.isFinite(Number(project.scheduleVariance))) return Number(project.scheduleVariance);
  if (project.status === "Off track") return 28;
  if (project.status === "Pause") return 21;
  if (project.status === "At risk") return 14;
  if (statusGroups.upcoming.includes(project.status) || statusGroups.done.includes(project.status)) return 0;
  return project.progress >= 75 ? -3 : 0;
}

function forecastLabel(project) {
  if (project.status === "Off track") return "Delayed";
  if (project.status === "At risk") return "Watch";
  if (project.status === "Pause") return "Paused";
  if (project.status === "Completed") return "Delivered";
  if (statusGroups.upcoming.includes(project.status)) return project.status;
  return "On time";
}

function reportPeriodCutoff() {
  const horizon = reportPeriod === "month" ? 30 : reportPeriod === "year" ? 365 : 120;
  const fiscalEnd = fiscalYearBounds().end;
  const periodEnd = new Date(AS_OF_DATE.getTime() + horizon * DAY);
  return periodEnd < fiscalEnd ? periodEnd : fiscalEnd;
}

function renderReports() {
  const visible = getReportProjects();
  const total = visible.length;
  const delivery = visible.filter(project => deliveryStatuses.includes(project.status));
  const onTrack = visible.filter(project => statusGroups.healthy.includes(project.status)).length;
  const average = total ? Math.round(visible.reduce((sum, project) => sum + project.progress, 0) / total) : 0;
  const scheduleConfidence = delivery.length ? Math.round(delivery.filter(project => !["Off track", "Pause"].includes(project.status)).length / delivery.length * 100) : 0;
  const highRisk = visible.filter(project => project.risk === "High").length;
  const health = delivery.length ? Math.round(onTrack / delivery.length * 100) : 0;
  const kpis = [
    ["Portfolio health", `${health}%`, `${onTrack} of ${delivery.length} active projects on track`, "activity", health >= 70 ? "positive" : "warning"],
    ["Average completion", `${average}%`, "Across the selected portfolio", "chart-no-axes-column-increasing", "neutral"],
    ["Schedule confidence", `${scheduleConfidence}%`, `${visible.filter(project => project.status === "Off track").length} forecast exception`, "calendar-check", scheduleConfidence >= 80 ? "positive" : "warning"],
    ["High-risk exposure", highRisk, `${total ? Math.round(highRisk / total * 100) : 0}% of selected initiatives`, "shield-alert", highRisk ? "negative" : "positive"]
  ];
  elements.reportKpis.innerHTML = kpis.map(kpi => `<article class="report-kpi"><div class="report-kpi-top"><span>${kpi[0]}</span><i class="report-kpi-icon ${kpi[4]}">${iconMarkup(kpi[3])}</i></div><strong>${kpi[1]}</strong><small>${kpi[2]}</small></article>`).join("");
  const highLevel = highLevelReportDetails(reportExportData());
  elements.reportHighLevel.innerHTML = highLevel.map(detail => `<article class="high-level-item"><span>${iconMarkup(detail.icon)}</span><div><strong>${detail.label}</strong><p>${detail.text}</p></div></article>`).join("");

  const statuses = [["On track", "#176b53"], ["At risk", "#c78218"], ["Off track", "#c44e4e"], ["Planned", "#36709b"]];
  elements.reportStatusChart.innerHTML = total ? `<div class="status-stacked-bar">${statuses.map(([status, color]) => { const count = visible.filter(project => project.status === status).length; return `<span style="width:${count / total * 100}%;background:${color}" title="${status}: ${count}"></span>`; }).join("")}</div><div class="report-status-rows">${statuses.map(([status, color]) => { const count = visible.filter(project => project.status === status).length; return `<button class="report-status-row" data-report-status="${status}" type="button"><i style="background:${color}"></i><span>${status}</span><strong>${count}</strong><small>${total ? Math.round(count / total * 100) : 0}%</small></button>`; }).join("")}</div>` : `<div class="report-empty">No projects match these report filters.</div>`;

  const riskLevels = ["High", "Medium", "Low"];
  const priorities = ["High", "Medium", "Low"];
  elements.reportRiskMatrix.innerHTML = `<div class="risk-matrix"><span></span>${priorities.map(priority => `<b>${priority} priority</b>`).join("")}${riskLevels.map(risk => `<span class="risk-axis">${risk} risk</span>${priorities.map(priority => { const count = visible.filter(project => project.risk === risk && project.priority === priority).length; return `<button class="risk-cell risk-cell-${risk.toLowerCase()}" data-report-risk="${risk}" type="button"><strong>${count}</strong><small>${count === 1 ? "project" : "projects"}</small></button>`; }).join("")}`).join("")}</div>`;

  const teams = [...new Set(visible.map(project => project.team))].sort();
  elements.teamReport.innerHTML = teams.length ? teams.map(team => { const teamProjects = visible.filter(project => project.team === team); const progress = Math.round(teamProjects.reduce((sum, project) => sum + project.progress, 0) / teamProjects.length); const healthy = teamProjects.filter(project => statusGroups.healthy.includes(project.status)).length; return `<div class="team-report-row"><div><strong>${team}</strong><small>${teamProjects.length} ${teamProjects.length === 1 ? "initiative" : "initiatives"}</small></div><div class="team-health-bar"><span style="width:${progress}%"></span></div><strong>${progress}%</strong><span class="team-confidence ${healthy === teamProjects.length ? "good" : "watch"}">${healthy}/${teamProjects.length} healthy</span></div>`; }).join("") : `<div class="report-empty">No team data available.</div>`;

  const cutoff = reportPeriodCutoff();
  const milestones = visible.filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= AS_OF_DATE && date <= cutoff; }).sort((a, b) => new Date(a.milestoneDate) - new Date(b.milestoneDate));
  elements.reportMilestones.innerHTML = milestones.length ? milestones.map(project => `<button class="forecast-row open-project" data-id="${project.id}" type="button"><time><strong>${formatDate(project.milestoneDate, { day: "2-digit" })}</strong><span>${formatDate(project.milestoneDate, { month: "short" })}</span></time><span><strong>${project.milestone}</strong><small>${project.name}</small></span><span class="forecast-badge forecast-${slug(forecastLabel(project))}">${forecastLabel(project)}</span>${iconMarkup("chevron-right")}</button>`).join("") : `<div class="report-empty">No milestones in the selected reporting horizon.</div>`;

  elements.reportProjectCount.textContent = `(${total})`;
  elements.reportTableBody.innerHTML = visible.map((project, index) => { const variance = scheduleVariance(project); return `<tr><td><div class="project-name"><span class="project-icon ${colors[index % colors.length]}">${project.code}</span><div><button class="open-project" data-id="${project.id}" type="button">${project.name}</button><small>${project.team} - ${project.owner}</small></div></div></td><td><span class="status-pill status-${slug(project.status)}">${project.status}</span></td><td><div class="table-progress"><div class="progress-track"><span style="width:${project.progress}%"></span></div><span>${project.progress}%</span></div></td><td><strong class="report-cost">${formatCurrency(project.approxCost)}</strong></td><td><span class="variance ${variance > 0 ? "late" : variance < 0 ? "ahead" : "stable"}">${variance > 0 ? `+${variance} days` : variance < 0 ? `${variance} days` : "On baseline"}</span></td><td><span class="risk-pill risk-${project.risk.toLowerCase()}">${project.risk}</span></td><td><strong class="report-milestone-name">${project.milestone}</strong><small class="report-date">${formatDate(project.milestoneDate, { month: "short", day: "numeric", year: "numeric" })}</small></td><td><span class="forecast-badge forecast-${slug(forecastLabel(project))}">${forecastLabel(project)}</span></td></tr>`; }).join("");
  refreshIcons();
}

function reportExportData() {
  const visible = getReportProjects();
  const active = visible.filter(project => deliveryStatuses.includes(project.status));
  const onTrack = visible.filter(project => statusGroups.healthy.includes(project.status)).length;
  const average = visible.length ? Math.round(visible.reduce((sum, project) => sum + project.progress, 0) / visible.length) : 0;
  const scheduleConfidence = active.length ? Math.round(active.filter(project => !["Off track", "Pause"].includes(project.status)).length / active.length * 100) : 0;
  const highRisk = visible.filter(project => project.risk === "High").length;
  const totalCost = visible.reduce((sum, project) => sum + (Number(project.approxCost) || 0), 0);
  const period = document.querySelector("#reportPeriod option:checked").textContent;
  const team = document.querySelector("#reportTeam option:checked").textContent;
  const status = document.querySelector("#reportStatus option:checked").textContent;
  const fiscal = fiscalYearBounds();
  const cutoff = reportPeriodCutoff();
  const riskCost = visible.filter(project => project.risk === "High").reduce((sum, project) => sum + (Number(project.approxCost) || 0), 0);
  const upcomingMilestones = [...visible].filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= AS_OF_DATE && date <= cutoff; }).sort((a, b) => new Date(a.milestoneDate) - new Date(b.milestoneDate));
  const exceptions = visible.filter(project => statusGroups.attention.includes(project.status));
  return { visible, activeCount: active.length, onTrack, average, scheduleConfidence, highRisk, totalCost, riskCost, period, team, status, fiscal, fiscalLabel: fiscalYearLabel(selectedFiscalYear), upcomingMilestones, exceptions };
}

function highLevelReportDetails(data) {
  const teams = new Set(data.visible.map(project => project.team)).size;
  const nextMilestone = data.upcomingMilestones[0];
  return [
    { label: "Portfolio scope", icon: "folder-kanban", text: `${data.visible.length} initiatives across ${teams} ${teams === 1 ? "team" : "teams"} in ${data.fiscalLabel}, covering Apr ${selectedFiscalYear - 1} through Mar ${selectedFiscalYear}.` },
    { label: "Delivery posture", icon: "activity", text: `${data.onTrack} of ${data.activeCount} active projects are on track, with ${data.average}% average completion and ${data.scheduleConfidence}% schedule confidence.` },
    { label: "Financial profile", icon: "circle-dollar-sign", text: `${formatCurrency(data.totalCost)} approximate portfolio cost; ${formatCurrency(data.riskCost)} is associated with high-risk initiatives.` },
    { label: "Roadmap outlook", icon: "route", text: nextMilestone ? `${data.upcomingMilestones.length} milestones remain in ${data.fiscalLabel}; next is ${nextMilestone.milestone} on ${formatDate(nextMilestone.milestoneDate, { month: "short", day: "numeric", year: "numeric" })}.` : `No remaining milestones are forecast in ${data.fiscalLabel}.` },
    { label: "Management attention", icon: "triangle-alert", text: data.exceptions.length ? `${data.exceptions.length} initiatives require attention: ${data.exceptions.map(project => project.name).join(", ")}.` : "No active delivery exceptions require management intervention." }
  ];
}

function buildExcelReport() {
  if (!window.XLSX) throw new Error("Excel export library is unavailable.");
  const data = reportExportData();
  const workbook = window.XLSX.utils.book_new();
  workbook.Props = { Title: "Aster Portfolio Status Report", Subject: `${data.period} project and roadmap report`, Author: "Aster Project Operations", CreatedDate: AS_OF_DATE };

  const summaryRows = [
    ["Aster Portfolio Status Report"],
    ["As of", AS_OF_LONG],
    ["Reporting period", data.period],
    ["Fiscal year", data.fiscalLabel],
    ["Fiscal timeline", `April 1, ${selectedFiscalYear - 1} to March 31, ${selectedFiscalYear}`],
    ["Team filter", data.team],
    ["Status filter", data.status],
    [],
    ["Executive measure", "Current value"],
    ["Projects", data.visible.length],
    ["Active projects", data.activeCount],
    ["On track", data.onTrack],
    ["Average completion", data.average / 100],
    ["Schedule confidence", data.scheduleConfidence / 100],
    ["High-risk exposure", data.highRisk],
    ["Approximate portfolio cost USD", data.totalCost],
    ["High-risk cost exposure USD", data.riskCost],
    ["Remaining roadmap milestones", data.upcomingMilestones.length],
    ["Delivery exceptions", data.exceptions.length]
  ];
  const summarySheet = window.XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 34 }, { wch: 24 }];
  summarySheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  if (summarySheet.B13) summarySheet.B13.z = "0%";
  if (summarySheet.B14) summarySheet.B14.z = "0%";
  if (summarySheet.B16) summarySheet.B16.z = "$#,##0";
  if (summarySheet.B17) summarySheet.B17.z = "$#,##0";
  window.XLSX.utils.book_append_sheet(workbook, summarySheet, "Executive Summary");

  const highLevelRows = [["High-Level Detail", "Executive Narrative"], ...highLevelReportDetails(data).map(detail => [detail.label, detail.text])];
  const highLevelSheet = window.XLSX.utils.aoa_to_sheet(highLevelRows);
  highLevelSheet["!cols"] = [{ wch: 24 }, { wch: 115 }];
  highLevelSheet["!autofilter"] = { ref: `A1:B${highLevelRows.length}` };
  window.XLSX.utils.book_append_sheet(workbook, highLevelSheet, "High-Level Details");

  const registerRows = [["Project", "Unit", "Objective", "Team", "Owner", "Status", "Progress", "Approximate Cost USD", "Schedule Variance Days", "Risk", "Priority", "Start Date", "Target Date", "Next Milestone", "Milestone Date", "Forecast", "Fiscal Year"]];
  data.visible.forEach(project => registerRows.push([project.name, project.unit, project.objective, project.team, project.owner, project.status, project.progress / 100, Number(project.approxCost) || 0, scheduleVariance(project), project.risk, project.priority, project.start, project.end, project.milestone, project.milestoneDate, forecastLabel(project), data.fiscalLabel]));
  const registerSheet = window.XLSX.utils.aoa_to_sheet(registerRows);
  registerSheet["!cols"] = [{ wch: 8 }, { wch: 28 }, { wch: 55 }, { wch: 16 }, { wch: 20 }, { wch: 13 }, { wch: 11 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 13 }, { wch: 24 }, { wch: 15 }, { wch: 12 }, { wch: 12 }];
  registerSheet["!autofilter"] = { ref: `A1:Q${registerRows.length}` };
  for (let row = 2; row <= registerRows.length; row += 1) {
    if (registerSheet[`G${row}`]) registerSheet[`G${row}`].z = "0%";
    if (registerSheet[`H${row}`]) registerSheet[`H${row}`].z = "$#,##0";
  }
  window.XLSX.utils.book_append_sheet(workbook, registerSheet, "Project Register");

  const milestoneRows = [["Milestone Date", "Milestone", "Project", "Team", "Owner", "Forecast", "Fiscal Year"]];
  data.upcomingMilestones.forEach(project => milestoneRows.push([project.milestoneDate, project.milestone, project.name, project.team, project.owner, forecastLabel(project), fiscalYearLabel(getFiscalYear(new Date(`${project.milestoneDate}T12:00:00`)))]));
  const milestoneSheet = window.XLSX.utils.aoa_to_sheet(milestoneRows);
  milestoneSheet["!cols"] = [{ wch: 16 }, { wch: 25 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 12 }];
  milestoneSheet["!autofilter"] = { ref: `A1:G${milestoneRows.length}` };
  window.XLSX.utils.book_append_sheet(workbook, milestoneSheet, "Roadmap Milestones");
  return workbook;
}

function exportReportExcel() {
  try {
    window.XLSX.writeFile(buildExcelReport(), `aster-portfolio-report-${AS_OF_ISO}.xlsx`, { compression: true });
    showToast("Excel workbook exported");
  } catch (error) {
    showToast(error.message);
  }
}

function buildPdfReport() {
  if (!window.jspdf?.jsPDF) throw new Error("PDF export library is unavailable.");
  const data = reportExportData();
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title: "Aster Portfolio Status Report", subject: `${data.period} project and roadmap report`, author: "Aster Project Operations" });
  doc.setFillColor(38, 58, 50);
  doc.rect(0, 0, 842, 82, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Aster Portfolio Status Report", 36, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`As of ${AS_OF_LONG}  |  ${data.fiscalLabel}  |  ${data.period}  |  ${data.team}  |  ${data.status}`, 36, 59);

  const summary = [
    ["Projects", String(data.visible.length)],
    ["On track", String(data.onTrack)],
    ["Average completion", `${data.average}%`],
    ["Schedule confidence", `${data.scheduleConfidence}%`],
    ["High-risk exposure", String(data.highRisk)],
    ["Approx. portfolio cost", formatCurrency(data.totalCost)],
    ["High-risk cost", formatCurrency(data.riskCost)],
    ["Roadmap milestones", String(data.upcomingMilestones.length)]
  ];
  doc.autoTable({ startY: 98, head: [["Executive measure", "Current value"]], body: summary, theme: "grid", tableWidth: 260, styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [23, 107, 83] } });
  doc.autoTable({ startY: 98, margin: { left: 320, right: 28 }, head: [["High-Level Details", "Executive narrative"]], body: highLevelReportDetails(data).map(detail => [detail.label, detail.text]), theme: "grid", styles: { fontSize: 7.5, cellPadding: 4, overflow: "linebreak" }, headStyles: { fillColor: [38, 58, 50] }, columnStyles: { 0: { cellWidth: 100, fontStyle: "bold" } } });
  doc.addPage("a4", "landscape");
  doc.setTextColor(24, 32, 29);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Project performance details", 36, 38);
  doc.autoTable({
    startY: 55,
    margin: { left: 36, right: 36 },
    head: [["Project", "Objective", "Team / Owner", "Status", "Progress", "Approx. cost", "Variance", "Risk"]],
    body: data.visible.map(project => [project.name, project.objective, `${project.team}\n${project.owner}`, project.status, `${project.progress}%`, formatCurrency(project.approxCost), `${scheduleVariance(project)} days`, project.risk]),
    theme: "striped",
    styles: { fontSize: 7, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [38, 58, 50] },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 190 }, 2: { cellWidth: 90 } }
  });
  const projectTableEnd = doc.lastAutoTable.finalY;
  doc.setFontSize(14);
  doc.text(`${data.fiscalLabel} roadmap milestone forecast`, 36, projectTableEnd + 28);
  doc.autoTable({ startY: projectTableEnd + 38, margin: { left: 36, right: 36 }, head: [["Date", "Milestone", "Project", "Team", "Forecast"]], body: data.upcomingMilestones.map(project => [formatDate(project.milestoneDate, { month: "short", day: "numeric", year: "numeric" }), project.milestone, project.name, project.team, forecastLabel(project)]), theme: "grid", styles: { fontSize: 7, cellPadding: 4 }, headStyles: { fillColor: [23, 107, 83] } });
  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setTextColor(110, 120, 115);
    doc.setFontSize(7);
    doc.text(`Aster confidential  |  Page ${pageNumber} of ${pageCount}`, 36, 575);
  }
  return doc;
}

function exportReportPdf() {
  try {
    buildPdfReport().save(`aster-portfolio-report-${AS_OF_ISO}.pdf`);
    showToast("PDF report exported");
  } catch (error) {
    showToast(error.message);
  }
}

function addPptxFooter(slide, pageNumber) {
  slide.addText(`Aster confidential  |  ${AS_OF_LONG}  |  ${pageNumber}`, { x: 0.45, y: 7.12, w: 12.4, h: 0.18, fontFace: "Arial", fontSize: 7, color: "7C8781", margin: 0 });
}

function buildPowerPointReport() {
  if (!window.PptxGenJS) throw new Error("PowerPoint export library is unavailable.");
  const data = reportExportData();
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Aster Project Operations";
  pptx.subject = `${data.period} project and roadmap report`;
  pptx.title = "Aster Portfolio Status Report";
  pptx.company = "Aster";
  pptx.lang = "en-US";

  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "263A32" };
  titleSlide.addText("ASTER / PORTFOLIO INTELLIGENCE", { x: 0.7, y: 0.65, w: 5.5, h: 0.25, fontFace: "Arial", fontSize: 10, bold: true, color: "F4A57D", charSpacing: 1.2, margin: 0 });
  titleSlide.addText("Portfolio status report", { x: 0.7, y: 1.45, w: 8.8, h: 0.7, fontFace: "Arial", fontSize: 30, bold: true, color: "FFFFFF", margin: 0 });
  titleSlide.addText("Project execution, roadmap forecast, delivery risk, and governance controls", { x: 0.7, y: 2.3, w: 8.7, h: 0.4, fontFace: "Arial", fontSize: 14, color: "C4D0CA", margin: 0 });
  titleSlide.addText(`${data.fiscalLabel} · ${data.period}\n${data.team} · ${data.status}\nAs of ${AS_OF_LONG}`, { x: 9.9, y: 1.45, w: 2.7, h: 1.15, fontFace: "Arial", fontSize: 12, bold: true, color: "FFFFFF", breakLine: false, margin: 0.08, valign: "mid", fill: { color: "314A40" }, line: { color: "537064" } });
  titleSlide.addText("Prepared from live Aster portfolio data", { x: 0.7, y: 6.7, w: 5.2, h: 0.25, fontFace: "Arial", fontSize: 9, color: "AEBDB6", margin: 0 });

  const highLevelSlide = pptx.addSlide();
  highLevelSlide.background = { color: "F4F6F4" };
  highLevelSlide.addText("High-Level Details", { x: 0.55, y: 0.35, w: 7, h: 0.4, fontFace: "Arial", fontSize: 21, bold: true, color: "18201D", margin: 0 });
  highLevelSlide.addText(`${data.fiscalLabel} executive narrative · Projects and Roadmap`, { x: 8.1, y: 0.42, w: 4.6, h: 0.22, fontFace: "Arial", fontSize: 8, color: "58615D", align: "right", margin: 0 });
  highLevelReportDetails(data).forEach((detail, index) => {
    const y = 1.05 + index * 1.08;
    highLevelSlide.addText(detail.label.toUpperCase(), { x: 0.7, y, w: 2.15, h: 0.22, fontFace: "Arial", fontSize: 9, bold: true, color: "176B53", margin: 0 });
    highLevelSlide.addText(detail.text, { x: 3.05, y: y - 0.05, w: 9.45, h: 0.62, fontFace: "Arial", fontSize: 12, color: "263A32", margin: 0.08, fill: { color: "FFFFFF" }, line: { color: "DDE2DF" }, valign: "mid" });
  });
  addPptxFooter(highLevelSlide, 2);

  const summarySlide = pptx.addSlide();
  summarySlide.background = { color: "F4F6F4" };
  summarySlide.addText("Executive portfolio summary", { x: 0.55, y: 0.35, w: 8, h: 0.4, fontFace: "Arial", fontSize: 21, bold: true, color: "18201D", margin: 0 });
  const metrics = [["Projects", data.visible.length], ["On track", data.onTrack], ["Average completion", `${data.average}%`], ["Schedule confidence", `${data.scheduleConfidence}%`], ["High-risk exposure", data.highRisk], ["Approx. cost", formatCurrency(data.totalCost)]];
  metrics.forEach((metric, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    summarySlide.addText([{ text: `${metric[1]}\n`, options: { bold: true, fontSize: 22, color: index === 4 ? "C44E4E" : "176B53" } }, { text: metric[0], options: { fontSize: 9, color: "58615D" } }], { x: 0.6 + column * 4.2, y: 1.1 + row * 1.45, w: 3.75, h: 1.05, fontFace: "Arial", margin: 0.15, fill: { color: "FFFFFF" }, line: { color: "DDE2DF" }, breakLine: false });
  });
  const statusRows = projectStatuses.filter(status => data.visible.some(project => project.status === status)).map(status => [status, data.visible.filter(project => project.status === status).length, data.visible.length ? `${Math.round(data.visible.filter(project => project.status === status).length / data.visible.length * 100)}%` : "0%"]);
  summarySlide.addText("Status distribution", { x: 0.6, y: 4.2, w: 3.2, h: 0.3, fontFace: "Arial", fontSize: 13, bold: true, color: "18201D", margin: 0 });
  summarySlide.addTable([["Status", "Projects", "Share"], ...statusRows], { x: 0.6, y: 4.65, w: 5.1, h: 1.6, fontFace: "Arial", fontSize: 9, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF", color: "18201D", rowH: 0.31, margin: 0.06, bold: false, autoFit: false });
  const upcoming = data.upcomingMilestones.slice(0, 5);
  summarySlide.addText("Roadmap milestone forecast", { x: 6.2, y: 4.2, w: 3.4, h: 0.3, fontFace: "Arial", fontSize: 13, bold: true, color: "18201D", margin: 0 });
  summarySlide.addTable([["Date", "Milestone", "Forecast"], ...upcoming.map(project => [formatDate(project.milestoneDate), project.milestone, forecastLabel(project)])], { x: 6.2, y: 4.65, w: 6.5, h: 1.6, fontFace: "Arial", fontSize: 8, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF", color: "18201D", rowH: 0.31, margin: 0.06, autoFit: false });
  addPptxFooter(summarySlide, 3);

  const roadmapSlide = pptx.addSlide();
  roadmapSlide.background = { color: "F4F6F4" };
  roadmapSlide.addText(`${data.fiscalLabel} roadmap milestone forecast`, { x: 0.55, y: 0.35, w: 8.5, h: 0.4, fontFace: "Arial", fontSize: 21, bold: true, color: "18201D", margin: 0 });
  roadmapSlide.addText(`April ${selectedFiscalYear - 1} - March ${selectedFiscalYear}`, { x: 9.2, y: 0.42, w: 3.5, h: 0.22, fontFace: "Arial", fontSize: 8, color: "58615D", align: "right", margin: 0 });
  roadmapSlide.addTable([["Date", "Milestone", "Project", "Team", "Owner", "Forecast"], ...data.upcomingMilestones.map(project => [formatDate(project.milestoneDate, { month: "short", day: "numeric", year: "numeric" }), project.milestone, project.name, project.team, project.owner, forecastLabel(project)])], { x: 0.55, y: 1.05, w: 12.2, h: 5.7, fontFace: "Arial", fontSize: 9, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF", color: "18201D", rowH: 0.55, margin: 0.07, autoFit: false });
  addPptxFooter(roadmapSlide, 4);

  const chunks = [];
  for (let index = 0; index < data.visible.length; index += 6) chunks.push(data.visible.slice(index, index + 6));
  chunks.forEach((chunk, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: "F4F6F4" };
    slide.addText(`Project performance register${chunks.length > 1 ? ` · ${index + 1} of ${chunks.length}` : ""}`, { x: 0.55, y: 0.35, w: 8.5, h: 0.4, fontFace: "Arial", fontSize: 21, bold: true, color: "18201D", margin: 0 });
    slide.addText(`${data.fiscalLabel} · ${data.period} · ${data.team} · ${data.status}`, { x: 8.5, y: 0.42, w: 4.2, h: 0.22, fontFace: "Arial", fontSize: 8, color: "58615D", align: "right", margin: 0 });
    slide.addTable([["Project / objective", "Team / owner", "Status", "Progress", "Approx. cost", "Variance", "Risk", "Next milestone"], ...chunk.map(project => [`${project.name}\n${project.objective}`, `${project.team}\n${project.owner}`, project.status, `${project.progress}%`, formatCurrency(project.approxCost), `${scheduleVariance(project)} days`, project.risk, `${project.milestone}\n${formatDate(project.milestoneDate)}`])], { x: 0.55, y: 1.05, w: 12.2, h: 5.65, fontFace: "Arial", fontSize: 7.5, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF", color: "18201D", rowH: 0.72, margin: 0.06, autoFit: false, bold: false });
    addPptxFooter(slide, index + 5);
  });
  return pptx;
}

async function exportReportPptx() {
  const button = document.querySelector("#exportPptx");
  button.disabled = true;
  try {
    await buildPowerPointReport().writeFile({ fileName: `aster-portfolio-report-${AS_OF_ISO}.pptx` });
    showToast("PowerPoint report exported");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

// ── Project workspace exports ───────────────────────────────────────────────
function projectsExportData() {
  const fiscalProjects = getFiscalProjects();
  const visible = getFilteredProjects();
  const delivery = visible.filter(project => deliveryStatuses.includes(project.status));
  const healthy = visible.filter(project => statusGroups.healthy.includes(project.status)).length;
  const attention = visible.filter(project => statusGroups.attention.includes(project.status));
  const statusCounts = projectStatuses
    .map(status => ({ status, count: visible.filter(project => project.status === status).length }))
    .filter(entry => entry.count);
  const unitMix = projectUnits
    .map(unit => {
      const items = visible.filter(project => project.unit === unit);
      return { unit, total: items.length, bands: unitMixBands.map(band => items.filter(project => band.statuses.includes(project.status)).length) };
    })
    .filter(row => row.total);
  return {
    visible,
    attention,
    statusCounts,
    unitMix,
    fiscalLabel: fiscalYearLabel(selectedFiscalYear),
    scope: {
      status: statusFilterLabel(),
      team: teamFilter === "all" ? "All teams" : teamFilter,
      unit: unitFilter === "all" ? "All units" : unitFilter.startsWith("sub:") ? unitFilter.slice(4).replace("::", " / ") : unitFilter,
      owner: ownerFilter === "all" ? "All owners" : ownerFilter,
      risk: riskFilter === "all" ? "All risk levels" : riskFilter,
      search: query.trim() || "None"
    },
    totals: {
      portfolio: fiscalProjects.length,
      shown: visible.length,
      onTrack: healthy,
      attention: attention.length,
      averageProgress: visible.length ? Math.round(visible.reduce((sum, project) => sum + project.progress, 0) / visible.length) : 0,
      health: delivery.length ? Math.round(healthy / delivery.length * 100) : 0,
      cost: visible.reduce((sum, project) => sum + (Number(project.approxCost) || 0), 0),
      highRisk: visible.filter(project => project.risk === "High").length
    }
  };
}

const PROJECT_REGISTER_COLUMNS = ["Project", "Branch Unit", "Unit", "Category", "FY / Quarter", "Team", "Owner", "Status", "Priority", "Risk", "Progress", "Start", "Target", "Approx. Cost", "Variance (days)", "Forecast", "Next Milestone", "Milestone Date"];

function projectRegisterRow(project) {
  return [project.name, project.unit, project.subUnit || "", project.team, project.owner, project.status, project.priority, project.risk,
    project.progress / 100, project.start, project.end, Number(project.approxCost) || 0, scheduleVariance(project),
    forecastLabel(project), project.milestone, project.milestoneDate];
}

function buildProjectsExcel() {
  if (!window.XLSX) throw new Error("Excel export library is unavailable.");
  const data = projectsExportData();
  const workbook = window.XLSX.utils.book_new();
  workbook.Props = { Title: "Project Workspace Export", Subject: "Project execution register", Author: "Platforms Branch Project and Roadmap App", CreatedDate: AS_OF_DATE };

  const summary = window.XLSX.utils.aoa_to_sheet([
    ["Project Workspace Export"],
    ["As of", formatDate(AS_OF_ISO, { year: "numeric", month: "long", day: "numeric" })],
    ["Fiscal year", data.fiscalLabel],
    [],
    ["Filters applied"],
    ["Status", data.scope.status],
    ["Team", data.scope.team],
    ["Unit", data.scope.unit],
    ["Owner", data.scope.owner],
    ["Risk", data.scope.risk],
    ["Search", data.scope.search],
    [],
    ["Measure", "Value"],
    ["Projects in fiscal year", data.totals.portfolio],
    ["Projects in this export", data.totals.shown],
    ["On track or in-flight", data.totals.onTrack],
    ["Needing attention", data.totals.attention],
    ["Portfolio health", data.totals.health / 100],
    ["Average progress", data.totals.averageProgress / 100],
    ["High delivery risk", data.totals.highRisk],
    ["Approximate cost", data.totals.cost]
  ]);
  summary["!cols"] = [{ wch: 30 }, { wch: 44 }];
  if (summary.B16) summary.B16.z = "0%";
  if (summary.B17) summary.B17.z = "0%";
  if (summary.B19) summary.B19.z = "$#,##0";
  window.XLSX.utils.book_append_sheet(workbook, summary, "Summary");

  const register = window.XLSX.utils.aoa_to_sheet([PROJECT_REGISTER_COLUMNS, ...data.visible.map(projectRegisterRow)]);
  register["!cols"] = [{ wch: 32 }, { wch: 34 }, { wch: 26 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 26 }, { wch: 14 }];
  data.visible.forEach((_, index) => {
    const row = index + 2;
    if (register[`I${row}`]) register[`I${row}`].z = "0%";
    if (register[`L${row}`]) register[`L${row}`].z = "$#,##0";
  });
  window.XLSX.utils.book_append_sheet(workbook, register, "Project Register");

  const distribution = window.XLSX.utils.aoa_to_sheet([
    ["Status", "Projects", "Share"],
    ...data.statusCounts.map(entry => [entry.status, entry.count, data.visible.length ? entry.count / data.visible.length : 0])
  ]);
  distribution["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }];
  data.statusCounts.forEach((_, index) => { if (distribution[`C${index + 2}`]) distribution[`C${index + 2}`].z = "0%"; });
  window.XLSX.utils.book_append_sheet(workbook, distribution, "Status Distribution");

  const mix = window.XLSX.utils.aoa_to_sheet([
    ["Unit", "Projects", ...unitMixBands.map(band => band.label)],
    ...data.unitMix.map(row => [row.unit, row.total, ...row.bands])
  ]);
  mix["!cols"] = [{ wch: 42 }, { wch: 10 }, ...unitMixBands.map(() => ({ wch: 17 }))];
  window.XLSX.utils.book_append_sheet(workbook, mix, "Unit Mix");

  const attention = window.XLSX.utils.aoa_to_sheet([
    ["Project", "Status", "Owner", "Team", "Progress", "Variance (days)", "Risk"],
    ...(data.attention.length ? data.attention.map(project => [project.name, project.status, project.owner, project.team, project.progress / 100, scheduleVariance(project), project.risk]) : [["No projects need attention in this scope"]])
  ]);
  attention["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 8 }];
  data.attention.forEach((_, index) => { if (attention[`E${index + 2}`]) attention[`E${index + 2}`].z = "0%"; });
  window.XLSX.utils.book_append_sheet(workbook, attention, "Needs Attention");
  return workbook;
}

function exportDocHeader(doc, title, subtitle, width) {
  doc.setFillColor(23, 107, 83);
  doc.rect(0, 0, width, 74, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(title, 36, 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(subtitle, 36, 56);
  doc.setTextColor(24, 32, 29);
}

function stampPdfFooter(doc, label) {
  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setTextColor(110, 120, 115);
    doc.setFontSize(7);
    doc.text(`${label}  |  Page ${page} of ${pages}`, 36, doc.internal.pageSize.getHeight() - 20);
  }
}

function buildProjectsPdf() {
  if (!window.jspdf?.jsPDF) throw new Error("PDF export library is unavailable.");
  const data = projectsExportData();
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title: "Project Workspace Export", subject: "Project execution register", author: "Platforms Branch Project and Roadmap App" });
  exportDocHeader(doc, "Project workspace", `Every fiscal year  |  ${data.scope.status}  |  ${data.scope.team}  |  ${data.scope.unit}  |  As of ${AS_OF_LONG}`, 842);

  doc.autoTable({
    startY: 94, margin: { left: 36 }, tableWidth: 300,
    head: [["Measure", "Value"]],
    body: [
      ["Projects in this export", `${data.totals.shown} of ${data.totals.portfolio}`],
      ["Portfolio health", `${data.totals.health}%`],
      ["On track or in-flight", String(data.totals.onTrack)],
      ["Needing attention", String(data.totals.attention)],
      ["Average progress", `${data.totals.averageProgress}%`],
      ["High delivery risk", String(data.totals.highRisk)],
      ["Approximate cost", formatCurrency(data.totals.cost)]
    ],
    theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [23, 107, 83] }
  });
  doc.autoTable({
    startY: 94, margin: { left: 360, right: 36 },
    head: [["Status", "Projects", "Share"]],
    body: data.statusCounts.map(entry => [entry.status, String(entry.count), `${data.visible.length ? Math.round(entry.count / data.visible.length * 100) : 0}%`]),
    theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [54, 112, 155] }
  });

  doc.addPage("a4", "landscape");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Project register", 36, 40);
  doc.autoTable({
    startY: 54, margin: { left: 36, right: 36 },
    head: [["Project", "Unit", "Team / Owner", "Status", "Progress", "Start", "Target", "Approx. cost", "Variance", "Forecast"]],
    body: data.visible.map(project => [project.name, project.unit, `${project.team}\n${project.owner}`, project.status,
      `${project.progress}%`, formatDate(project.start), formatDate(project.end), formatCurrency(project.approxCost),
      `${scheduleVariance(project)}d`, forecastLabel(project)]),
    theme: "striped", styles: { fontSize: 7, cellPadding: 3, valign: "middle" }, headStyles: { fillColor: [23, 107, 83] },
    columnStyles: { 0: { cellWidth: 120 }, 1: { cellWidth: 120 } }
  });

  if (data.attention.length) {
    doc.addPage("a4", "landscape");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Projects needing attention", 36, 40);
    doc.autoTable({
      startY: 54, margin: { left: 36, right: 36 },
      head: [["Project", "Status", "Owner", "Team", "Progress", "Variance", "Risk"]],
      body: data.attention.map(project => [project.name, project.status, project.owner, project.team, `${project.progress}%`, `${scheduleVariance(project)}d`, project.risk]),
      theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [196, 78, 78] }
    });
  }
  stampPdfFooter(doc, "Project workspace export");
  return doc;
}

function buildProjectsPptx() {
  if (!window.PptxGenJS) throw new Error("PowerPoint export library is unavailable.");
  const data = projectsExportData();
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Platforms Branch Project and Roadmap App";
  pptx.title = "Project workspace";
  pptx.subject = "Project execution register";
  pptx.lang = "en-US";

  const title = pptx.addSlide();
  title.background = { color: "1B3A30" };
  title.addText("PROJECT COMMAND CENTER", { x: 0.7, y: 0.7, w: 6, h: 0.25, fontFace: "Arial", fontSize: 10, bold: true, color: "8FD3B8", charSpacing: 1.2, margin: 0 });
  title.addText("Project workspace", { x: 0.7, y: 1.4, w: 9, h: 0.7, fontFace: "Arial", fontSize: 30, bold: true, color: "FFFFFF", margin: 0 });
  title.addText(`${data.totals.shown} of ${data.totals.portfolio} projects  ·  ${data.scope.status}  ·  ${data.scope.team}  ·  ${data.scope.unit}`, { x: 0.7, y: 2.25, w: 10.5, h: 0.4, fontFace: "Arial", fontSize: 13, color: "C4D0CA", margin: 0 });
  title.addText(`${data.fiscalLabel}\nAs of ${AS_OF_LONG}`, { x: 0.7, y: 6.5, w: 5, h: 0.5, fontFace: "Arial", fontSize: 11, color: "8FA79B", margin: 0 });

  const summary = pptx.addSlide();
  summary.addText("Portfolio position", { x: 0.6, y: 0.45, w: 8, h: 0.4, fontFace: "Arial", fontSize: 20, bold: true, color: "18201D", margin: 0 });
  summary.addTable([["Measure", "Value"],
    ["Projects in this export", `${data.totals.shown} of ${data.totals.portfolio}`],
    ["Portfolio health", `${data.totals.health}%`],
    ["On track or in-flight", String(data.totals.onTrack)],
    ["Needing attention", String(data.totals.attention)],
    ["Average progress", `${data.totals.averageProgress}%`],
    ["Approximate cost", formatCurrency(data.totals.cost)]],
    { x: 0.6, y: 1.05, w: 5.6, fontFace: "Arial", fontSize: 11, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });
  summary.addText("Status distribution", { x: 6.6, y: 0.95, w: 6, h: 0.3, fontFace: "Arial", fontSize: 13, bold: true, color: "18201D", margin: 0 });
  summary.addTable([["Status", "Projects", "Share"],
    ...data.statusCounts.map(entry => [entry.status, String(entry.count), `${data.visible.length ? Math.round(entry.count / data.visible.length * 100) : 0}%`])],
    { x: 6.6, y: 1.4, w: 6, fontFace: "Arial", fontSize: 10, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });
  summary.addText("Unit mix", { x: 0.6, y: 4.6, w: 6, h: 0.3, fontFace: "Arial", fontSize: 13, bold: true, color: "18201D", margin: 0 });
  summary.addTable([["Unit", "Projects", ...unitMixBands.map(band => band.label)],
    ...data.unitMix.map(row => [row.unit, String(row.total), ...row.bands.map(String)])],
    { x: 0.6, y: 5.05, w: 12, fontFace: "Arial", fontSize: 9, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });

  const chunkSize = 12;
  for (let index = 0; index < data.visible.length; index += chunkSize) {
    const chunk = data.visible.slice(index, index + chunkSize);
    const slide = pptx.addSlide();
    slide.addText(`Project register${data.visible.length > chunkSize ? ` (${index / chunkSize + 1})` : ""}`, { x: 0.6, y: 0.4, w: 8, h: 0.4, fontFace: "Arial", fontSize: 18, bold: true, color: "18201D", margin: 0 });
    slide.addTable([["Project / unit", "Team / owner", "Status", "Progress", "Start", "Target", "Cost", "Forecast"],
      ...chunk.map(project => [`${project.name}\n${project.unit}`, `${project.team}\n${project.owner}`, project.status,
        `${project.progress}%`, formatDate(project.start), formatDate(project.end), formatCurrency(project.approxCost), forecastLabel(project)])],
      { x: 0.6, y: 1, w: 12.1, fontFace: "Arial", fontSize: 9, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });
  }
  return pptx;
}

// ── Roadmap exports ─────────────────────────────────────────────────────────
function roadmapExportData() {
  const range = timelineRange();
  const visible = getRoadmapVisibleProjects();
  const lanes = projectUnits
    .map(unit => ({ unit, items: visible.filter(project => project.unit === unit) }))
    .filter(lane => lane.items.length);
  const milestones = visible
    .filter(project => {
      const date = new Date(`${project.milestoneDate}T12:00:00`);
      return date >= range.start && date <= range.end;
    })
    .sort((first, second) => new Date(first.milestoneDate) - new Date(second.milestoneDate));
  return {
    range,
    visible,
    lanes,
    milestones,
    quarter: roadmapFullYear ? fiscalYearLabel(selectedFiscalYear) : `Q${roadmapQuarter + 1}`,
    fiscalLabel: fiscalYearLabel(selectedFiscalYear),
    horizon: `${formatDate(range.start.toISOString().slice(0, 10), { year: "numeric", month: "short", day: "numeric" })} to ${formatDate(range.end.toISOString().slice(0, 10), { year: "numeric", month: "short", day: "numeric" })}`,
    vision: roadmapStrategy.vision || "No guiding vision recorded.",
    goals: roadmapStrategy.goals || [],
    metrics: roadmapSuccessMetrics(),
    contentions: scheduleContentions(),
    team: teamFilter === "all" ? "All teams" : teamFilter
  };
}

function buildRoadmapExcel() {
  if (!window.XLSX) throw new Error("Excel export library is unavailable.");
  const data = roadmapExportData();
  const workbook = window.XLSX.utils.book_new();
  workbook.Props = { Title: `Roadmap ${data.quarter} ${data.fiscalLabel}`, Subject: "Portfolio roadmap", Author: "Platforms Branch Project and Roadmap App", CreatedDate: AS_OF_DATE };

  const strategy = window.XLSX.utils.aoa_to_sheet([
    [`Portfolio roadmap - ${data.quarter} ${data.fiscalLabel}`],
    ["Horizon", data.horizon],
    ["Team filter", data.team],
    ["As of", formatDate(AS_OF_ISO, { year: "numeric", month: "long", day: "numeric" })],
    [],
    ["Guiding vision"],
    [data.vision],
    [],
    ["Strategic goals"],
    ["Goal", "Outcome", "Now", "Target", "Unit", "Progress to target"],
    ...(data.goals.length
      ? data.goals.map(goal => [goal.title, goal.outcome, Number(goal.current) || 0, Number(goal.target) || 0, goal.unit || "",
          Number(goal.target) ? Math.min(1, (Number(goal.current) || 0) / Number(goal.target)) : 0])
      : [["No strategic goals recorded"]])
  ]);
  strategy["!cols"] = [{ wch: 30 }, { wch: 62 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }];
  data.goals.forEach((_, index) => { const cell = strategy[`F${index + 11}`]; if (cell) cell.z = "0%"; });
  window.XLSX.utils.book_append_sheet(workbook, strategy, "Vision and Goals");

  const metrics = window.XLSX.utils.aoa_to_sheet([
    ["Metric", "Value", "Target", "Basis"],
    ...data.metrics.map(metric => [metric.label, `${metric.value}${metric.unit}`, metric.target === null ? "No target" : `${metric.target}${metric.unit}`, metric.hint])
  ]);
  metrics["!cols"] = [{ wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 34 }];
  window.XLSX.utils.book_append_sheet(workbook, metrics, "Success Metrics");

  const initiatives = window.XLSX.utils.aoa_to_sheet([
    ["Quarter", "Branch Unit", "Unit", "Category", "FY / Quarter", "Initiative", "Team", "Owner", "Status", "Progress", "Start", "Target", "Milestone", "Milestone Date"],
    ...data.lanes.flatMap(lane => lane.items.map(project => [data.quarter, lane.unit, project.subUnit || "", project.name, project.team, project.owner,
      project.status, project.progress / 100, project.start, project.end, project.milestone, project.milestoneDate]))
  ]);
  initiatives["!cols"] = [{ wch: 9 }, { wch: 42 }, { wch: 26 }, { wch: 32 }, { wch: 10 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 26 }, { wch: 14 }];
  data.visible.forEach((_, index) => { const cell = initiatives[`H${index + 2}`]; if (cell) cell.z = "0%"; });
  window.XLSX.utils.book_append_sheet(workbook, initiatives, "Initiatives");

  const milestoneSheet = window.XLSX.utils.aoa_to_sheet([
    ["Date", "Milestone", "Initiative", "Unit", "Team", "Owner"],
    ...(data.milestones.length
      ? data.milestones.map(project => [project.milestoneDate, project.milestone, project.name, project.unit, project.team, project.owner])
      : [["No milestones committed in this quarter"]])
  ]);
  milestoneSheet["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 32 }, { wch: 42 }, { wch: 10 }, { wch: 18 }];
  window.XLSX.utils.book_append_sheet(workbook, milestoneSheet, "Milestones");

  const contention = window.XLSX.utils.aoa_to_sheet([
    ["Team", "Initiative A", "Initiative B", "Overlap (days)"],
    ...(data.contentions.length
      ? data.contentions.map(overlap => [overlap.team, overlap.a.name, overlap.b.name, overlap.days])
      : [["No two initiatives on the same team overlap in this horizon"]])
  ]);
  contention["!cols"] = [{ wch: 10 }, { wch: 32 }, { wch: 32 }, { wch: 15 }];
  window.XLSX.utils.book_append_sheet(workbook, contention, "Schedule Contention");
  return workbook;
}

function buildRoadmapPdf() {
  if (!window.jspdf?.jsPDF) throw new Error("PDF export library is unavailable.");
  const data = roadmapExportData();
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title: `Roadmap ${data.quarter} ${data.fiscalLabel}`, subject: "Portfolio roadmap", author: "Platforms Branch Project and Roadmap App" });
  exportDocHeader(doc, `Portfolio roadmap - ${data.quarter} ${data.fiscalLabel}`, `${data.horizon}  |  ${data.team}  |  As of ${AS_OF_LONG}`, 842);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Guiding vision", 36, 100);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(data.vision, 770), 36, 116);

  doc.autoTable({
    startY: 156, margin: { left: 36, right: 36 },
    head: [["Strategic goal", "Outcome", "Now", "Target", "To target"]],
    body: data.goals.length
      ? data.goals.map(goal => [goal.title, goal.outcome, `${goal.current}${goal.unit || ""}`, `${goal.target}${goal.unit || ""}`,
          `${Number(goal.target) ? Math.min(100, Math.round((Number(goal.current) || 0) / Number(goal.target) * 100)) : 0}%`])
      : [["No strategic goals recorded", "", "", "", ""]],
    theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [23, 107, 83] },
    columnStyles: { 1: { cellWidth: 330 } }
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 18, margin: { left: 36, right: 36 },
    head: [["Metric for success", "Value", "Target", "Basis"]],
    body: data.metrics.map(metric => [metric.label, `${metric.value}${metric.unit}`, metric.target === null ? "No target" : `${metric.target}${metric.unit}`, metric.hint]),
    theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [54, 112, 155] }
  });

  doc.addPage("a4", "landscape");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Initiatives by unit - ${data.quarter} ${data.fiscalLabel}`, 36, 40);
  const laneRows = data.lanes.flatMap(lane => [
    [{ content: lane.unit, colSpan: 7, styles: { fillColor: [232, 238, 234], fontStyle: "bold", textColor: [24, 32, 29] } }],
    ...lane.items.map(project => ["", project.name, `${project.team}\n${project.owner}`, project.status, `${project.progress}%`,
      `${formatDate(project.start)} - ${formatDate(project.end)}`, `${project.milestone}\n${formatDate(project.milestoneDate)}`])
  ]);
  doc.autoTable({
    startY: 54, margin: { left: 36, right: 36 },
    head: [["", "Initiative", "Team / owner", "Status", "Progress", "Window", "Next milestone"]],
    body: laneRows.length ? laneRows : [["", "No initiatives in this horizon", "", "", "", "", ""]],
    theme: "grid", styles: { fontSize: 8, cellPadding: 4, valign: "middle" }, headStyles: { fillColor: [23, 107, 83] },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 150 } }
  });

  doc.addPage("a4", "landscape");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Milestones and schedule contention", 36, 40);
  doc.autoTable({
    startY: 54, margin: { left: 36, right: 36 },
    head: [["Date", "Milestone", "Initiative", "Unit", "Owner"]],
    body: data.milestones.length
      ? data.milestones.map(project => [formatDate(project.milestoneDate), project.milestone, project.name, project.unit, project.owner])
      : [["-", "No milestones committed in this quarter", "", "", ""]],
    theme: "striped", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [230, 111, 81] }
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 18, margin: { left: 36, right: 36 },
    head: [["Team", "Initiative A", "Initiative B", "Overlap"]],
    body: data.contentions.length
      ? data.contentions.map(overlap => [overlap.team, overlap.a.name, overlap.b.name, `${overlap.days} days`])
      : [["-", "No two initiatives on the same team overlap in this horizon", "", ""]],
    theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [196, 78, 78] }
  });
  stampPdfFooter(doc, `Roadmap ${data.quarter} ${data.fiscalLabel}`);
  return doc;
}

function buildRoadmapPptx() {
  if (!window.PptxGenJS) throw new Error("PowerPoint export library is unavailable.");
  const data = roadmapExportData();
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Platforms Branch Project and Roadmap App";
  pptx.title = `Portfolio roadmap ${data.quarter} ${data.fiscalLabel}`;
  pptx.subject = "Portfolio roadmap";
  pptx.lang = "en-US";

  const title = pptx.addSlide();
  title.background = { color: "263A32" };
  title.addText("PORTFOLIO ROADMAP", { x: 0.7, y: 0.7, w: 6, h: 0.25, fontFace: "Arial", fontSize: 10, bold: true, color: "F4A57D", charSpacing: 1.2, margin: 0 });
  title.addText(`${data.quarter} ${data.fiscalLabel}`, { x: 0.7, y: 1.35, w: 9, h: 0.8, fontFace: "Arial", fontSize: 34, bold: true, color: "FFFFFF", margin: 0 });
  title.addText(data.vision, { x: 0.7, y: 2.4, w: 9.5, h: 1.1, fontFace: "Arial", fontSize: 15, color: "C4D0CA", margin: 0 });
  title.addText(`${data.horizon}  ·  ${data.team}  ·  ${data.visible.length} initiatives`, { x: 0.7, y: 6.4, w: 8, h: 0.4, fontFace: "Arial", fontSize: 11, color: "AEBDB6", margin: 0 });

  const strategy = pptx.addSlide();
  strategy.addText("Strategic goals", { x: 0.6, y: 0.45, w: 8, h: 0.4, fontFace: "Arial", fontSize: 20, bold: true, color: "18201D", margin: 0 });
  strategy.addTable([["Goal", "Outcome", "Now", "Target", "To target"],
    ...(data.goals.length
      ? data.goals.map(goal => [goal.title, goal.outcome, `${goal.current}${goal.unit || ""}`, `${goal.target}${goal.unit || ""}`,
          `${Number(goal.target) ? Math.min(100, Math.round((Number(goal.current) || 0) / Number(goal.target) * 100)) : 0}%`])
      : [["No strategic goals recorded", "", "", "", ""]])],
    { x: 0.6, y: 1.05, w: 12.1, fontFace: "Arial", fontSize: 10, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF", colW: [2.6, 5.9, 1.1, 1.1, 1.4] });
  strategy.addText("Metrics for success", { x: 0.6, y: 4.1, w: 8, h: 0.3, fontFace: "Arial", fontSize: 14, bold: true, color: "18201D", margin: 0 });
  strategy.addTable([["Metric", "Value", "Target", "Basis"],
    ...data.metrics.map(metric => [metric.label, `${metric.value}${metric.unit}`, metric.target === null ? "No target" : `${metric.target}${metric.unit}`, metric.hint])],
    { x: 0.6, y: 4.55, w: 12.1, fontFace: "Arial", fontSize: 10, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });

  data.lanes.forEach(lane => {
    const slide = pptx.addSlide();
    slide.addText(lane.unit, { x: 0.6, y: 0.4, w: 10, h: 0.4, fontFace: "Arial", fontSize: 18, bold: true, color: "18201D", margin: 0 });
    slide.addText(`${data.quarter} ${data.fiscalLabel}  ·  ${lane.items.length} ${lane.items.length === 1 ? "initiative" : "initiatives"}`, { x: 0.6, y: 0.85, w: 8, h: 0.25, fontFace: "Arial", fontSize: 10, color: "58615D", margin: 0 });
    slide.addTable([["Initiative", "Team / owner", "Status", "Progress", "Window", "Next milestone"],
      ...lane.items.map(project => [project.name, `${project.team}\n${project.owner}`, project.status, `${project.progress}%`,
        `${formatDate(project.start)} - ${formatDate(project.end)}`, `${project.milestone}\n${formatDate(project.milestoneDate)}`])],
      { x: 0.6, y: 1.25, w: 12.1, fontFace: "Arial", fontSize: 10, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });
  });

  const closing = pptx.addSlide();
  closing.addText("Milestones this quarter", { x: 0.6, y: 0.45, w: 8, h: 0.4, fontFace: "Arial", fontSize: 20, bold: true, color: "18201D", margin: 0 });
  closing.addTable([["Date", "Milestone", "Initiative", "Owner"],
    ...(data.milestones.length
      ? data.milestones.map(project => [formatDate(project.milestoneDate), project.milestone, project.name, project.owner])
      : [["-", "No milestones committed in this quarter", "", ""]])],
    { x: 0.6, y: 1.05, w: 12.1, fontFace: "Arial", fontSize: 10, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });
  closing.addText("Schedule contention", { x: 0.6, y: 4.2, w: 8, h: 0.3, fontFace: "Arial", fontSize: 14, bold: true, color: "18201D", margin: 0 });
  closing.addTable([["Team", "Initiative A", "Initiative B", "Overlap"],
    ...(data.contentions.length
      ? data.contentions.map(overlap => [overlap.team, overlap.a.name, overlap.b.name, `${overlap.days} days`])
      : [["-", "No two initiatives on the same team overlap in this horizon", "", ""]])],
    { x: 0.6, y: 4.65, w: 12.1, fontFace: "Arial", fontSize: 10, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF" });
  return pptx;
}

const EXPORT_STAMP = AS_OF_ISO;

function exportProjectsExcel() {
  try { window.XLSX.writeFile(buildProjectsExcel(), `project-workspace-${EXPORT_STAMP}.xlsx`, { compression: true }); showToast("Project Excel workbook exported"); }
  catch (error) { showToast(error.message); }
}
function exportProjectsPdf() {
  try { buildProjectsPdf().save(`project-workspace-${EXPORT_STAMP}.pdf`); showToast("Project PDF exported"); }
  catch (error) { showToast(error.message); }
}
async function exportProjectsPptx() {
  const button = document.querySelector("#exportProjectsPptx");
  button.disabled = true;
  try { await buildProjectsPptx().writeFile({ fileName: `project-workspace-${EXPORT_STAMP}.pptx` }); showToast("Project PowerPoint exported"); }
  catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
}
function roadmapExportName() {
  const fy = fiscalYearLabel(selectedFiscalYear).toLowerCase();
  return roadmapFullYear ? `roadmap-${fy}-full-year-${EXPORT_STAMP}` : `roadmap-q${roadmapQuarter + 1}-${fy}-${EXPORT_STAMP}`;
}
function exportRoadmapExcel() {
  try { window.XLSX.writeFile(buildRoadmapExcel(), `${roadmapExportName()}.xlsx`, { compression: true }); showToast("Roadmap Excel workbook exported"); }
  catch (error) { showToast(error.message); }
}
function exportRoadmapPdf() {
  try { buildRoadmapPdf().save(`${roadmapExportName()}.pdf`); showToast("Roadmap PDF exported"); }
  catch (error) { showToast(error.message); }
}
async function exportRoadmapPptx() {
  const button = document.querySelector("#exportRoadmapPptx");
  button.disabled = true;
  try { await buildRoadmapPptx().writeFile({ fileName: `${roadmapExportName()}.pptx` }); showToast("Roadmap PowerPoint exported"); }
  catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
}

function buildTeamsExcel() {
  if (!window.XLSX) throw new Error("Excel export library is unavailable.");
  const teams = getFilteredTeams();
  const workbook = window.XLSX.utils.book_new();
  workbook.Props = { Title: "Aster Team Directory", Subject: "Team capacity and role accountability", Author: "Aster Project Operations", CreatedDate: AS_OF_DATE };
  const summaryRows = [["Aster Team Directory"], ["As of", AS_OF_LONG], ["Capacity filter", document.querySelector("#teamHealthFilter option:checked").textContent], ["Search", teamQuery || "All teams"], [], ["Teams", teams.length], ["Members", teams.reduce((sum, team) => sum + team.headcount, 0)], ["Average capacity", teams.length ? teams.reduce((sum, team) => sum + team.capacity, 0) / teams.length / 100 : 0], ["Assigned projects", new Set(teams.flatMap(team => team.projectIds)).size]];
  const summary = window.XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 25 }, { wch: 30 }];
  if (summary.B8) summary.B8.z = "0%";
  window.XLSX.utils.book_append_sheet(workbook, summary, "Team Summary");
  const teamRows = [["Team", "Specialty", "Product Owner", "Headcount", "Capacity", "Capacity Status", "Assigned Projects"]];
  teams.forEach(team => teamRows.push([team.name, team.specialty, team.roles["Product Owner"] || "Unassigned", team.headcount, team.capacity / 100, teamCapacityLevel(team.capacity).label, assignedTeamProjects(team).map(project => project.name).join(", ")]));
  const directory = window.XLSX.utils.aoa_to_sheet(teamRows);
  directory["!cols"] = [{ wch: 16 }, { wch: 25 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 55 }];
  directory["!autofilter"] = { ref: `A1:G${teamRows.length}` };
  for (let row = 2; row <= teamRows.length; row += 1) if (directory[`E${row}`]) directory[`E${row}`].z = "0%";
  window.XLSX.utils.book_append_sheet(workbook, directory, "Team Directory");
  const roleRows = [["Team", "Role", "Member"]];
  teams.forEach(team => teamRoleFields.forEach(([, role]) => roleRows.push([team.name, role, team.roles[role] || "Unassigned"])));
  const roles = window.XLSX.utils.aoa_to_sheet(roleRows);
  roles["!cols"] = [{ wch: 16 }, { wch: 24 }, { wch: 25 }];
  roles["!autofilter"] = { ref: `A1:C${roleRows.length}` };
  window.XLSX.utils.book_append_sheet(workbook, roles, "Role Accountability");
  return workbook;
}

function buildResourcesExcel() {
  if (!window.XLSX) throw new Error("Excel export library is unavailable.");
  const resources = getFilteredResources();
  const workbook = window.XLSX.utils.book_new();
  workbook.Props = { Title: "Aster Resource Directory", Subject: "Resource role and team assignments", Author: "Aster Project Operations", CreatedDate: AS_OF_DATE };
  const summaryRows = [["Aster Resource Directory"], ["As of", AS_OF_LONG], ["Role filter", document.querySelector("#resourceRoleFilter option:checked").textContent], ["Team filter", document.querySelector("#resourceTeamFilter option:checked").textContent], ["Search", resourceQuery || "All resources"], [], ["Resources", resources.length], ["Average allocation", resources.length ? resources.reduce((sum, resource) => sum + resource.allocation, 0) / resources.length / 100 : 0], ["Available", resources.filter(resource => resource.availability === "Available").length], ["Allocated", resources.filter(resource => resource.availability === "Allocated").length], ["Unavailable", resources.filter(resource => resource.availability === "Unavailable").length]];
  const summary = window.XLSX.utils.aoa_to_sheet(summaryRows);
  summary["!cols"] = [{ wch: 25 }, { wch: 30 }];
  if (summary.B8) summary.B8.z = "0%";
  window.XLSX.utils.book_append_sheet(workbook, summary, "Resource Summary");
  const rows = [["Resource", "Role", "Team", "Allocation", "Availability"]];
  resources.forEach(resource => rows.push([resource.name, resource.role, resource.teamName, resource.allocation / 100, resource.availability]));
  const assignments = window.XLSX.utils.aoa_to_sheet(rows);
  assignments["!cols"] = [{ wch: 25 }, { wch: 24 }, { wch: 16 }, { wch: 14 }, { wch: 15 }];
  assignments["!autofilter"] = { ref: `A1:E${rows.length}` };
  for (let row = 2; row <= rows.length; row += 1) if (assignments[`D${row}`]) assignments[`D${row}`].z = "0%";
  window.XLSX.utils.book_append_sheet(workbook, assignments, "Resource Assignments");
  return workbook;
}

function buildDirectoryPdf(type) {
  if (!window.jspdf?.jsPDF) throw new Error("PDF export library is unavailable.");
  const isTeam = type === "team";
  const rows = isTeam ? getFilteredTeams() : getFilteredResources();
  const title = isTeam ? "Aster Team Directory" : "Aster Resource Directory";
  const subtitle = isTeam ? `${rows.length} teams · ${document.querySelector("#teamHealthFilter option:checked").textContent}` : `${rows.length} resources · ${document.querySelector("#resourceRoleFilter option:checked").textContent} · ${document.querySelector("#resourceTeamFilter option:checked").textContent}`;
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setProperties({ title, subject: isTeam ? "Team capacity and role accountability" : "Resource role and team assignments", author: "Aster Project Operations" });
  doc.setFillColor(38, 58, 50); doc.rect(0, 0, 842, 78, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(21); doc.text(title, 36, 36);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`As of ${AS_OF_LONG}  |  ${subtitle}`, 36, 57);
  if (isTeam) {
    doc.autoTable({ startY: 95, margin: { left: 30, right: 30 }, head: [["Team", "Specialty", "Product Owner", "Members", "Capacity", "Status", "Assigned projects"]], body: rows.map(team => [team.name, team.specialty, team.roles["Product Owner"] || "Unassigned", team.headcount, `${team.capacity}%`, teamCapacityLevel(team.capacity).label, assignedTeamProjects(team).map(project => project.name).join(", ") || "None"]), theme: "striped", styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" }, headStyles: { fillColor: [41, 61, 74] }, columnStyles: { 1: { cellWidth: 110 }, 6: { cellWidth: 180 } } });
    doc.addPage("a4", "landscape"); doc.setTextColor(24, 32, 29); doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.text("Team role accountability", 36, 38);
    const roleRows = []; rows.forEach(team => teamRoleFields.forEach(([, role]) => roleRows.push([team.name, role, team.roles[role] || "Unassigned"])));
    doc.autoTable({ startY: 52, margin: { left: 36, right: 36 }, head: [["Team", "Role", "Member"]], body: roleRows, theme: "grid", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [23, 107, 83] } });
  } else {
    doc.autoTable({ startY: 95, margin: { left: 36, right: 36 }, head: [["Resource", "Role", "Team", "Allocation", "Availability"]], body: rows.map(resource => [resource.name, resource.role, resource.teamName, `${resource.allocation}%`, resource.availability]), theme: "striped", styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [55, 67, 75] } });
  }
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) { doc.setPage(page); doc.setTextColor(110, 120, 115); doc.setFontSize(7); doc.text(`Aster confidential  |  Page ${page} of ${pageCount}`, 36, 575); }
  return doc;
}

function exportTeamsExcel() { try { window.XLSX.writeFile(buildTeamsExcel(), `aster-team-directory-${AS_OF_ISO}.xlsx`, { compression: true }); showToast("Team Excel workbook exported"); } catch (error) { showToast(error.message); } }
function exportTeamsPdf() { try { buildDirectoryPdf("team").save(`aster-team-directory-${AS_OF_ISO}.pdf`); showToast("Team PDF exported"); } catch (error) { showToast(error.message); } }
function exportResourcesExcel() { try { window.XLSX.writeFile(buildResourcesExcel(), `aster-resource-directory-${AS_OF_ISO}.xlsx`, { compression: true }); showToast("Resource Excel workbook exported"); } catch (error) { showToast(error.message); } }
function exportResourcesPdf() { try { buildDirectoryPdf("resource").save(`aster-resource-directory-${AS_OF_ISO}.pdf`); showToast("Resource PDF exported"); } catch (error) { showToast(error.message); } }

// The deck's pages run from the quarter before the fiscal year to the quarter
// after it - eighteen months, Jan 2025 to Jun 2026 on the September 2025 deck -
// so work at either edge of the year is still on the page. Without it, an
// initiative that finished in the previous Q4 is simply not drawn.
function deckWindowBounds() {
  const year = fiscalYearBounds();
  const start = new Date(year.start);
  start.setMonth(start.getMonth() - 3);
  const end = new Date(year.end);
  end.setDate(1);
  end.setMonth(end.getMonth() + 3);
  end.setDate(new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate());
  return { start, end };
}

function timelineRange() {
  // One fiscal quarter, the whole fiscal year (Apr 1 - Mar 31), or the deck's
  // eighteen-month window around it.
  const fy = fiscalYearLabel(selectedFiscalYear);
  const { start, end } = roadmapDeckWindow
    ? deckWindowBounds()
    : roadmapFullYear ? fiscalYearBounds() : fiscalQuarterBounds(roadmapQuarter);
  const label = roadmapDeckWindow
    ? `18 months · ${monthNames[start.getMonth()]} ${start.getFullYear()} - ${monthNames[end.getMonth()]} ${end.getFullYear()}`
    : roadmapFullYear
      ? `${fy} · Apr ${selectedFiscalYear - 1} - Mar ${selectedFiscalYear}`
      : `Q${roadmapQuarter + 1} ${fy} · ${monthNames[start.getMonth()]}-${monthNames[end.getMonth()]}`;
  const milestoneLabel = roadmapDeckWindow ? "18-month window" : roadmapFullYear ? `${fy} horizon` : `Q${roadmapQuarter + 1} ${fy}`;
  const includesEarlier = roadmapDeckWindow ? "" : " Completed work from earlier years is listed too, marked with the period it finished in.";

  const periods = [];
  {
    const pointer = new Date(start);
    while (pointer <= end) {
      periods.push({ label: `${monthNames[pointer.getMonth()]} ${String(pointer.getFullYear()).slice(2)}`, days: new Date(pointer.getFullYear(), pointer.getMonth() + 1, 0).getDate(), isPeriodStart: [3, 6, 9, 0].includes(pointer.getMonth()) });
      pointer.setMonth(pointer.getMonth() + 1);
    }
  }
  return { start, end, duration: end - start + DAY, periods, label, milestoneLabel, includesEarlier };
}

function getRoadmapVisibleProjects() {
  const range = timelineRange();
  // In the eighteen-month window the fiscal-year filter would still hide the
  // quarters either side of it, so the window selects from every project.
  const pool = roadmapDeckWindow ? projects : getFiscalProjects();
  // Completed initiatives are kept even when their dates fall outside the
  // horizon; the row says so rather than the project vanishing.
  return pool.filter(project => matchesProjectScope(project) && (project.status === "Completed"
    || (new Date(`${project.end}T12:00:00`) >= range.start && new Date(`${project.start}T12:00:00`) <= range.end)));
}

function timelineBarClass(status) {
  if (statusGroups.upcoming.includes(status)) return "timeline-bar upcoming";
  if (statusGroups.done.includes(status)) return "timeline-bar done";
  if (statusGroups.attention.includes(status)) return "timeline-bar attention";
  return "timeline-bar";
}

function scheduleContentions() {
  const overlaps = [];
  const visible = getRoadmapVisibleProjects();
  visible.forEach((project, index) => {
    visible.slice(index + 1).forEach(other => {
      if (project.team !== other.team) return;
      const start = new Date(`${project.start}T12:00:00`);
      const end = new Date(`${project.end}T12:00:00`);
      const otherStart = new Date(`${other.start}T12:00:00`);
      const otherEnd = new Date(`${other.end}T12:00:00`);
      if (start > otherEnd || otherStart > end) return;
      const days = Math.round((Math.min(end, otherEnd) - Math.max(start, otherStart)) / DAY);
      if (days > 0) overlaps.push({ team: project.team, a: project, b: other, days });
    });
  });
  return overlaps.sort((first, second) => second.days - first.days);
}

function renderRoadmapScopeStrip() {
  const scope = activeProjectScope();
  const strip = document.querySelector("#roadmapScopeStrip");
  strip.classList.toggle("hidden", scope.length === 0);
  document.querySelector("#roadmapScopeDetail").textContent = scope.length
    ? scope.map(part => `${part.label}: ${part.value}`).join("  ·  ")
    : "";
}

// Declared dependencies, read from the initiatives in view. A link is only
// drawn when both ends exist; a conflict is arithmetic on their own dates.
// Clicking a goal filters the Projects section, which the roadmap then
// inherits, so both sections always agree about what is in scope.
function applyGoalScope(value) {
  goalFilter = value;
  populateTeamFilters();
  document.querySelector("#goalFilter").value = goalFilter;
  switchView("projects");
  renderProjects();
  const goal = value === "none" ? null : (roadmapStrategy.goals || []).find(item => item.id === Number(value));
  showToast(goal ? `Showing initiatives serving "${goal.title}"` : "Showing initiatives not linked to a goal");
}

// A metric is only meaningful if it can be traced back. A focus set is the
// exact list of initiatives a figure was computed from, applied to the shared
// project scope so the Projects list shows those records and nothing else.
function applyFocusSet(label, list, note = "") {
  focusSet = { label, note, ids: new Set(list.map(project => project.id)) };
  populateTeamFilters();
  if (activeView !== "projects") switchView("projects");
  renderProjects();
  showToast(list.length
    ? `Showing the ${list.length} ${list.length === 1 ? "initiative" : "initiatives"} behind "${label}"`
    : `No initiatives are behind "${label}"`);
}

function focusMetric(key) {
  const metric = roadmapSuccessMetrics().find(entry => entry.key === key);
  if (!metric) return;
  applyFocusSet(metric.label, metric.projects, metric.sourceNote);
}

function renderRoadmapDependencies() {
  const visible = getRoadmapVisibleProjects();
  const visibleIds = new Set(visible.map(project => project.id));
  const links = dependencyLinks(projects).filter(link => visibleIds.has(link.dependent.id) || visibleIds.has(link.predecessor.id));
  const conflicts = links.filter(link => link.conflict);
  document.querySelector("#dependencyCount").textContent = links.length;
  document.querySelector("#dependencyLinks").innerHTML = links.length
    ? links
        .slice()
        .sort((first, second) => Number(second.conflict) - Number(first.conflict) || second.days - first.days)
        .slice(0, 5)
        .map(link => `<div class="dependency-link${link.conflict ? " dependency-conflict" : ""}">
          <button class="dependency-node" data-open-project="${link.predecessor.id}" type="button"><span class="project-icon teal">${initials(link.predecessor.name)}</span><span><strong>${link.predecessor.name}</strong><small>ends ${formatDate(link.predecessor.end)}</small></span></button>
          <i class="dependency-arrow">${iconMarkup("arrow-right")}</i>
          <button class="dependency-node" data-open-project="${link.dependent.id}" type="button"><span class="project-icon blue">${initials(link.dependent.name)}</span><span><strong>${link.dependent.name}</strong><small>starts ${formatDate(link.dependent.start)}</small></span></button>
          <span class="dependency-verdict">${link.conflict ? `${iconMarkup("triangle-alert")}blocked by ${link.days}d` : `${iconMarkup("circle-check")}sequence holds`}</span>
        </div>`).join("")
    : `<p class="dependency-empty">No dependencies declared yet. Open an initiative, edit it, and use "Depends on" to record what it waits for.</p>`;
  const note = document.querySelector("#dependencyNote");
  note.innerHTML = `${iconMarkup(conflicts.length ? "triangle-alert" : "circle-check")}<span>${links.length
    ? (conflicts.length
        ? `${conflicts.length} of ${links.length} ${links.length === 1 ? "link" : "links"} cannot hold - a predecessor is still running when the dependent initiative is due to start.`
        : `All ${links.length} declared ${links.length === 1 ? "dependency sequences" : "dependencies sequence"} correctly against the recorded dates.`)
    : "Dependencies are declared on the initiative itself, so this panel stays empty until one is recorded."}</span>`;
  note.classList.toggle("warning", conflicts.length > 0);
}

// Ranks only the initiatives that carry a full set of scoring inputs. Anything
// unscored is reported as unscored rather than ranked at zero.
function renderRoadmapPrioritization() {
  const model = activeScoreModel();
  const modelSelect = document.querySelector("#roadmapScoreModel");
  modelSelect.innerHTML = Object.entries(SCORE_MODELS).map(([key, entry]) => `<option value="${key}"${key === scoreModel ? " selected" : ""}>${entry.label}</option>`).join("");
  modelSelect.title = model.hint;
  document.querySelector("#roadmapSort").value = roadmapSort;
  const visible = getRoadmapVisibleProjects();
  const ranked = rankedByScore(visible);
  const unscored = visible.length - ranked.length;
  document.querySelector("#priorityModelLabel").textContent = model.label;
  document.querySelector("#priorityCount").textContent = ranked.length;
  document.querySelector("#priorityRanking").innerHTML = ranked.length
    ? ranked.slice(0, 6).map((project, index) => {
        const quadrant = scoreQuadrant(project);
        return `<button class="priority-row" data-open-project="${project.id}" type="button">
          <span class="priority-rank">${index + 1}</span>
          <span class="priority-name"><strong>${project.name}</strong><small>${project.unit}${quadrant ? ` - ${quadrant.label}` : ""}</small></span>
          <span class="priority-score">${projectScore(project, model)}</span>
        </button>`;
      }).join("")
    : `<p class="dependency-empty">Nothing is scored yet. Edit an initiative and fill in the ${model.fields.map(field => field.label.toLowerCase()).join(", ")} fields to rank it.</p>`;
  const note = document.querySelector("#priorityNote");
  note.innerHTML = `${iconMarkup(unscored ? "circle-help" : "circle-check")}<span>${visible.length
    ? (unscored
        ? `${ranked.length} of ${visible.length} ${visible.length === 1 ? "initiative" : "initiatives"} in this horizon carry a ${model.label} score. ${unscored} ${unscored === 1 ? "is" : "are"} unscored and cannot be ranked.`
        : `Every initiative in this horizon carries a ${model.label} score.`)
    : "No initiatives fall inside this horizon."}</span>`;
  note.classList.toggle("warning", false);
}

function renderRoadmapContention() {
  const overlaps = scheduleContentions();
  document.querySelector("#contentionCount").textContent = overlaps.length;
  document.querySelector("#contentionFlows").innerHTML = overlaps.length
    ? overlaps.slice(0, 4).map((overlap, index) => `
      <div class="dependency-flow">
        <button class="dependency-node" data-open-project="${overlap.a.id}" type="button" aria-label="Open ${overlap.a.name}"><span class="project-icon ${colors[index % 4]}">${overlap.a.code}</span><span><strong>${overlap.a.name}</strong><small>${formatDate(overlap.a.start)} - ${formatDate(overlap.a.end)}</small></span></button>
        <i data-lucide="arrow-left-right"></i>
        <button class="dependency-node" data-open-project="${overlap.b.id}" type="button" aria-label="Open ${overlap.b.name}"><span class="project-icon ${colors[(index + 2) % 4]}">${overlap.b.code}</span><span><strong>${overlap.b.name}</strong><small>${formatDate(overlap.b.start)} - ${formatDate(overlap.b.end)}</small></span></button>
        <button class="dependency-meta" data-contention-focus="${overlap.a.id}:${overlap.b.id}" type="button" aria-label="Show both initiatives sharing ${overlap.team}">${iconMarkup("list-filter")}${overlap.team} - ${overlap.days}d overlap</button>
      </div>`).join("")
    : `<p class="dependency-empty">No two initiatives on the same team overlap in this horizon.</p>`;
  const note = document.querySelector("#contentionNote");
  note.innerHTML = `${iconMarkup(overlaps.length ? "triangle-alert" : "circle-check")}<span>${overlaps.length
    ? `${overlaps.length} ${overlaps.length === 1 ? "pair" : "pairs"} of initiatives share a team at the same time - confirm capacity before committing dates.`
    : "Every team runs one initiative at a time in this horizon."}</span>`;
  note.classList.toggle("warning", overlaps.length > 0);
}

function roadmapSuccessMetrics() {
  const range = timelineRange();
  const visible = getRoadmapVisibleProjects();
  const delivery = visible.filter(project => deliveryStatuses.includes(project.status));
  const healthy = visible.filter(project => statusGroups.healthy.includes(project.status));
  const holding = delivery.filter(project => !["Off track", "Pause"].includes(project.status));
  const milestones = visible.filter(project => {
    const date = new Date(`${project.milestoneDate}T12:00:00`);
    return date >= range.start && date <= range.end;
  });
  const share = (count, total) => (total ? Math.round(count / total * 100) : 0);
  return [
    { key: "on-track", label: "On-track share", value: share(healthy.length, delivery.length), unit: "%", target: 80,
      hint: `${healthy.length} of ${delivery.length} in delivery`, projects: healthy,
      sourceNote: "the initiatives counted as on track or in flight" },
    { key: "confidence", label: "Schedule confidence", value: share(holding.length, delivery.length), unit: "%", target: 90,
      hint: "not off track or paused", projects: holding,
      sourceNote: "the initiatives in delivery that are neither off track nor paused" },
    { key: "completion", label: "Average completion", value: visible.length ? Math.round(visible.reduce((sum, project) => sum + project.progress, 0) / visible.length) : 0, unit: "%", target: 60,
      hint: `across ${visible.length} ${visible.length === 1 ? "initiative" : "initiatives"}`, projects: visible,
      sourceNote: "every initiative averaged into this figure" },
    { key: "milestones", label: "Milestones committed", value: milestones.length, unit: "", target: null,
      hint: range.milestoneLabel, projects: milestones,
      sourceNote: `the initiatives with a milestone in ${range.milestoneLabel.toLowerCase()}` }
  ];
}

const STRATEGY_GOAL_SLOTS = 4;

function openStrategyModal() {
  const form = document.querySelector("#strategyForm");
  form.elements.vision.value = roadmapStrategy.vision || "";
  document.querySelector("#strategyGoalFields").innerHTML = Array.from({ length: STRATEGY_GOAL_SLOTS }, (_, index) => {
    const goal = roadmapStrategy.goals?.[index] || {};
    return `<fieldset class="strategy-goal-row">
      <legend>Goal ${index + 1}</legend>
      <label>Title<input name="goalTitle${index}" maxlength="48" value="${(goal.title || "").replace(/"/g, "&quot;")}" placeholder="Leave blank to remove"></label>
      <label>Outcome<input name="goalOutcome${index}" maxlength="140" value="${(goal.outcome || "").replace(/"/g, "&quot;")}" placeholder="What changes for Albertans"></label>
      <label>Now<input name="goalCurrent${index}" type="number" min="0" step="any" value="${goal.current ?? ""}"></label>
      <label>Target<input name="goalTarget${index}" type="number" min="0" step="any" value="${goal.target ?? ""}"></label>
      <label>Unit<input name="goalUnit${index}" maxlength="12" value="${(goal.unit || "").replace(/"/g, "&quot;")}" placeholder="% or blank"></label>
    </fieldset>`;
  }).join("");
  document.querySelector("#strategyModal").showModal();
  refreshIcons();
}

function submitStrategy(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(document.querySelector("#strategyForm")));
  const previousGoals = roadmapStrategy.goals || [];
  let nextGoalId = Math.max(0, ...previousGoals.map(goal => goal.id || 0)) + 1;
  roadmapStrategy.vision = data.vision.trim();
  roadmapStrategy.goals = Array.from({ length: STRATEGY_GOAL_SLOTS }, (_, index) => {
    // Reuse the slot's existing id so initiatives already linked to this goal
    // stay linked; only a genuinely new goal gets a new id.
    const existing = previousGoals[index];
    return {
      id: existing?.id ?? nextGoalId++,
      title: (data[`goalTitle${index}`] || "").trim(),
      outcome: (data[`goalOutcome${index}`] || "").trim(),
      current: Number(data[`goalCurrent${index}`]) || 0,
      target: Number(data[`goalTarget${index}`]) || 0,
      unit: (data[`goalUnit${index}`] || "").trim()
    };
  }).filter(goal => goal.title);
  // A goal that is gone can no longer be served, so its links go with it.
  const liveGoalIds = new Set(roadmapStrategy.goals.map(goal => goal.id));
  let droppedLinks = 0;
  projects.forEach(project => {
    const kept = project.goalIds.filter(id => liveGoalIds.has(id));
    droppedLinks += project.goalIds.length - kept.length;
    project.goalIds = kept;
  });
  saveRoadmapStrategy();
  if (droppedLinks) saveProjects();
  document.querySelector("#strategyModal").close();
  populateTeamFilters();
  renderAll();
  showToast(droppedLinks
    ? `Roadmap strategy updated - ${droppedLinks} initiative ${droppedLinks === 1 ? "link" : "links"} removed with the deleted ${droppedLinks === 1 ? "goal" : "goals"}`
    : "Roadmap strategy updated");
}

function renderRoadmapStrategy() {
  document.querySelector("#roadmapVisionText").textContent = roadmapStrategy.vision || "No guiding vision recorded yet.";
  const goals = roadmapStrategy.goals || [];
  document.querySelector("#roadmapGoalCount").textContent = goals.length;
  document.querySelector("#roadmapGoals").innerHTML = goals.length
    ? goals.map(goal => {
        const target = Number(goal.target) || 0;
        const current = Number(goal.current) || 0;
        const percent = target ? Math.min(100, Math.round(current / target * 100)) : 0;
        const state = percent >= 100 ? "met" : percent >= 70 ? "on-track" : "behind";
        const linked = goalInitiatives(goal.id);
        const scored = rankedByScore(linked);
        return `<button class="goal-card" data-goal-scope="${goal.id}" type="button" aria-label="Show the ${linked.length} ${linked.length === 1 ? "initiative" : "initiatives"} serving ${goal.title}">
          <div class="goal-card-top"><strong>${goal.title}</strong><span class="goal-state goal-${state}">${percent}% to target</span></div>
          <p>${goal.outcome}</p>
          <div class="goal-track"><span style="width:${percent}%"></span></div>
          <div class="goal-figures"><span>Now <strong>${current}${goal.unit || ""}</strong></span><span>Target <strong>${target}${goal.unit || ""}</strong></span></div>
          <div class="goal-initiatives">${linked.length
            ? `<span class="goal-initiative-link">${iconMarkup("route")}<strong>${linked.length}</strong> ${linked.length === 1 ? "initiative" : "initiatives"} serve this goal${scored.length ? ` - top score ${projectScore(scored[0])}` : ""}${iconMarkup("chevron-right")}</span>`
            : `<span class="goal-initiative-empty">${iconMarkup("unlink")}No initiative is linked to this goal yet</span>`}</div>
        </button>`;
      }).join("")
    : `<p class="goal-empty">No strategic goals recorded. Use Edit strategy to add the outcomes this roadmap serves.</p>`;
  const unlinked = getRoadmapVisibleProjects().filter(project => !project.goalIds.length);
  const coverage = document.querySelector("#goalCoverage");
  if (coverage) {
    coverage.innerHTML = goals.length
      ? `${iconMarkup(unlinked.length ? "triangle-alert" : "circle-check")}<span>${unlinked.length
          ? `<button class="text-button" data-goal-scope="none" type="button">${unlinked.length} ${unlinked.length === 1 ? "initiative is" : "initiatives are"} not linked to any goal</button> in this horizon.`
          : "Every initiative in this horizon is linked to a goal."}</span>`
      : "";
    coverage.classList.toggle("warning", goals.length > 0 && unlinked.length > 0);
    coverage.classList.toggle("hidden", !goals.length);
  }

  document.querySelector("#roadmapMetrics").innerHTML = roadmapSuccessMetrics().map(metric => {
    const state = metric.target === null ? "neutral" : metric.value >= metric.target ? "met" : metric.value >= metric.target - 15 ? "watch" : "behind";
    const count = metric.projects.length;
    return `<button class="success-metric metric-${state}" data-metric-focus="${metric.key}" type="button" aria-label="Show the ${count} ${count === 1 ? "initiative" : "initiatives"} behind ${metric.label}">
      <span class="success-metric-label">${metric.label}</span>
      <strong>${metric.value}${metric.unit}</strong>
      <small>${metric.hint}</small>
      <span class="success-metric-target">${metric.target === null ? "No target set" : `Target ${metric.target}${metric.unit}`}</span>
      <span class="card-source">${iconMarkup("list-filter")}${count} ${count === 1 ? "initiative" : "initiatives"}</span>
    </button>`;
  }).join("");
}

function renderQuarterPicker() {
  const picker = document.querySelector("#roadmapQuarterPicker");
  const currentQuarter = fiscalQuarterOf(AS_OF_DATE);
  const inCurrentFiscalYear = getFiscalYear(AS_OF_DATE) === selectedFiscalYear;
  const fyLabel = fiscalYearLabel(selectedFiscalYear);
  const quarterButtons = FISCAL_QUARTERS.map((entry, index) => {
    const active = !roadmapFullYear && index === roadmapQuarter;
    const isNow = inCurrentFiscalYear && index === currentQuarter;
    return `<button data-quarter="${index}" class="${active ? "active" : ""}" type="button" aria-pressed="${active}" title="Q${entry.quarter} ${fyLabel} - ${entry.months}">Q${entry.quarter}${isNow ? '<i class="quarter-now" aria-label="current quarter"></i>' : ""}</button>`;
  }).join("");
  const deck = deckWindowBounds();
  picker.innerHTML = `${quarterButtons}`
    + `<button data-quarter="fy" class="quarter-fy ${roadmapFullYear && !roadmapDeckWindow ? "active" : ""}" type="button" aria-pressed="${roadmapFullYear && !roadmapDeckWindow}" title="${fyLabel} - the whole fiscal year, Apr ${selectedFiscalYear - 1} to Mar ${selectedFiscalYear}">${fyLabel}</button>`
    + `<button data-quarter="deck" class="quarter-fy quarter-window ${roadmapDeckWindow ? "active" : ""}" type="button" aria-pressed="${roadmapDeckWindow}" title="18 months, the window the roadmap deck's own pages use: ${monthNames[deck.start.getMonth()]} ${deck.start.getFullYear()} to ${monthNames[deck.end.getMonth()]} ${deck.end.getFullYear()}. Shows work that starts before or ends after the fiscal year.">18M</button>`;
  document.querySelector("#roadmapFiscalNoteYear").textContent = fyLabel;
  const note = document.querySelector("#roadmapPeriodNote");
  if (note) note.textContent = timelineRange().includesEarlier.trim();
}

function fiscalTimelineRange() {
  const { start, end } = fiscalYearBounds();
  const periods = [];
  const pointer = new Date(start);
  while (pointer <= end) {
    periods.push({
      label: `${monthNames[pointer.getMonth()]} ${String(pointer.getFullYear()).slice(2)}`,
      days: new Date(pointer.getFullYear(), pointer.getMonth() + 1, 0).getDate(),
      isPeriodStart: [3, 6, 9, 0].includes(pointer.getMonth())
    });
    pointer.setMonth(pointer.getMonth() + 1);
  }
  return { start, end, duration: end - start + DAY, periods };
}

function timelineRowMarkup(project, range, gridMarkup, todayPosition, iconColor) {
  const projectStart = new Date(`${project.start}T12:00:00`);
  const projectEnd = new Date(`${project.end}T12:00:00`);
  const milestoneDate = new Date(`${project.milestoneDate}T12:00:00`);
  const clippedStart = projectStart < range.start ? range.start : projectStart;
  const clippedEnd = projectEnd > range.end ? new Date(range.end.getTime() + DAY) : new Date(projectEnd.getTime() + DAY);
  const start = (clippedStart - range.start) / range.duration * 100;
  const width = Math.max(0, (clippedEnd - clippedStart) / range.duration * 100);
  const milestone = (milestoneDate - range.start + DAY / 2) / range.duration * 100;
  const milestoneMarkup = milestoneDate >= range.start && milestoneDate <= range.end
    ? `<span class="timeline-milestone" style="--position:${milestone}%" title="${project.milestone} - ${formatDate(project.milestoneDate)}"></span>`
    : "";
  return `<div class="timeline-row"><div class="timeline-project"><span class="project-icon ${iconColor}">${project.code}</span><div><strong title="${project.name}">${project.name}</strong><small>${project.team} - ${project.owner}</small></div></div><div class="timeline-track" style="${todayPosition === null ? "" : `--today:${todayPosition}%`}">${gridMarkup}${todayPosition === null ? "" : `<span class="today-line"></span>`}${timelineOutsideMarkup(project, range) || `<button class="${timelineBarClass(project.status)} open-project" data-id="${project.id}" type="button" style="--start:${start}%;--width:${width}%;--bar-color:${statusLegendColors[project.status] || "var(--green)"}" title="${project.name}: ${formatDate(project.start)} to ${formatDate(project.end)} - ${project.status}, ${project.progress}% complete" aria-label="${project.name}, ${project.status}, ${project.progress}% complete"><span class="timeline-bar-fill" style="width:${project.progress}%"></span><span class="timeline-bar-label">${project.progress}%</span></button>${milestoneMarkup}`}</div></div>`;
}

// ---------------------------------------------------------------------------
// Deck-style sections on the timeline.
//
// The roadmap deck lays each page out as a left column of section names, each
// spanning the rows of the projects inside it, with the project's own name
// written inside its status-coloured bar. This reproduces that: one section per
// sub-category (or per category where there are no sub-categories), the label
// written once and vertically centred, and one row per project.
//
// Projects that sit directly under a unit with no category keep the older
// per-project rows, so nothing is lost for the units the deck does not group.
// ---------------------------------------------------------------------------

// The deepest grouping a unit's projects actually have.
function timelineSectionsFor(unit, unitProjects) {
  const sections = [];
  subGroupsFor(unit, unitProjects).forEach(group => {
    nestedGroupsFor(unit, group.sub, group.items).forEach(nested => {
      sections.push({
        category: group.sub,
        label: nested.subCategory || group.sub || "",
        items: nested.items
      });
    });
  });
  return sections;
}

// A bar carries its own name, as the deck does. Below roughly an eighth of the
// horizon there is no room for the text inside, so it is written alongside
// instead of being clipped to nothing.
const NARROW_BAR_PERCENT = 13;

// Entirely before or after the axis: there is no honest position for a bar, so
// an anchored marker states when the work happened instead of drawing a bar of
// zero width at the edge. Used by both row kinds, so a project is never
// silently reduced to a sliver whichever layout it is in.
// The deck tints alternate quarters behind the bars, which is what makes a
// long row readable at a glance. Parity is counted from the first whole
// quarter in the range so the bands line up with the quarter ruler above.
function timelineGridMarkup(range, columns) {
  let quarter = -1;
  let parity = 0;
  const cells = range.periods.map(period => {
    if (period.isPeriodStart || quarter === -1) {
      quarter += 1;
      parity = quarter % 2;
    }
    const classes = [period.isPeriodStart ? "period-start" : "", parity ? "quarter-alt" : ""].filter(Boolean).join(" ");
    return `<i${classes ? ` class="${classes}"` : ""}></i>`;
  }).join("");
  return `<span class="timeline-grid" style="grid-template-columns:${columns}">${cells}</span>`;
}

function timelineOutsideMarkup(project, range) {
  const projectStart = new Date(`${project.start}T12:00:00`);
  const projectEnd = new Date(`${project.end}T12:00:00`);
  if (projectEnd >= range.start && projectStart <= range.end) return "";
  const before = projectEnd < range.start;
  return `<button class="timeline-outside${before ? " outside-before" : " outside-after"} open-project" data-id="${project.id}" type="button" style="--bar-color:${statusLegendColors[project.status] || "var(--green)"}" title="${project.name}: ${formatDate(project.start)} to ${formatDate(project.end)} - ${project.status}, ${project.progress}% complete. Outside the period shown." aria-label="${project.name}, ${project.status}, ${before ? "finished" : "starts"} ${formatDate(before ? project.end : project.start, { month: "short", day: "numeric", year: "numeric" })}, outside the period shown">
    <i>${iconMarkup(before ? "chevron-left" : "chevron-right")}</i>
    <span><b>${project.name}</b><small>${before ? `finished ${formatDate(project.end, { month: "short", year: "numeric" })}` : `starts ${formatDate(project.start, { month: "short", year: "numeric" })}`}</small></span>
  </button>`;
}

function timelineBarMarkup(project, range, todayPosition) {
  const projectStart = new Date(`${project.start}T12:00:00`);
  const projectEnd = new Date(`${project.end}T12:00:00`);
  const milestoneDate = new Date(`${project.milestoneDate}T12:00:00`);
  const clippedStart = projectStart < range.start ? range.start : projectStart;
  const clippedEnd = projectEnd > range.end ? new Date(range.end.getTime() + DAY) : new Date(projectEnd.getTime() + DAY);
  const start = (clippedStart - range.start) / range.duration * 100;
  const width = Math.max(0, (clippedEnd - clippedStart) / range.duration * 100);
  const milestone = (milestoneDate - range.start + DAY / 2) / range.duration * 100;
  const milestoneMarkup = milestoneDate >= range.start && milestoneDate <= range.end
    ? `<span class="timeline-milestone" style="--position:${milestone}%" title="${project.milestone} - ${formatDate(project.milestoneDate)}"></span>`
    : "";
  const away = timelineOutsideMarkup(project, range);
  if (away) return away;
  const narrow = width < NARROW_BAR_PERCENT;
  const continues = projectEnd > range.end;
  const startsEarlier = projectStart < range.start;
  const title = `${project.name}: ${formatDate(project.start)} to ${formatDate(project.end)} - ${project.status}, ${project.progress}% complete`;
  const bar = `<button class="${timelineBarClass(project.status)} open-project${narrow ? " bar-narrow" : ""}${continues ? " bar-continues" : ""}${startsEarlier ? " bar-from-earlier" : ""}" data-id="${project.id}" type="button" style="--start:${start}%;--width:${width}%;--bar-color:${statusLegendColors[project.status] || "var(--green)"}" title="${title}" aria-label="${project.name}, ${project.status}, ${project.progress}% complete, ${formatDate(project.start)} to ${formatDate(project.end)}">
    <span class="timeline-bar-fill" style="width:${project.progress}%"></span>
    ${narrow ? "" : `<span class="timeline-bar-name">${project.name}</span><span class="timeline-bar-pct">${project.progress}%</span>`}
  </button>`;
  const outside = narrow
    ? `<span class="timeline-bar-outside" style="--start:${start}%;--width:${width}%" aria-hidden="true">${project.name} <b>${project.progress}%</b></span>`
    : "";
  return `${bar}${outside}${milestoneMarkup}`;
}

function timelineSectionRow(project, range, gridMarkup, todayPosition) {
  return `<div class="timeline-srow"><div class="timeline-track" style="${todayPosition === null ? "" : `--today:${todayPosition}%`}">${gridMarkup}${todayPosition === null ? "" : `<span class="today-line"></span>`}${timelineBarMarkup(project, range, todayPosition)}</div></div>`;
}

function timelineSectionMarkup(section, range, gridMarkup, todayPosition, compare, index = 0) {
  const rows = section.items.slice().sort(compare)
    .map(project => timelineSectionRow(project, range, gridMarkup, todayPosition)).join("");
  const count = section.items.length;
  // The dots summarise the section's own statuses, so the header carries
  // information rather than decoration.
  const dots = unitMixBands
    .map(band => ({ band, total: section.items.filter(project => band.statuses.includes(project.status)).length }))
    .filter(entry => entry.total)
    .map(entry => `<i style="background:${entry.band.color}" title="${entry.total} ${entry.band.label.toLowerCase()}"></i>`)
    .join("");
  return `<div class="timeline-section${index % 2 ? " timeline-section-alt" : ""}">
    <div class="timeline-section-label">
      <strong title="${section.label}">${section.label}</strong>
      <span class="timeline-section-meta"><span class="timeline-section-count">${count}</span><span class="timeline-section-dots">${dots}</span></span>
    </div>
    <div class="timeline-section-rows">${rows}</div>
  </div>`;
}

function timelineLanesMarkup(entries, range, gridMarkup, todayPosition, noun, order = "schedule") {
  let barIndex = 0;
  // Ordering by score puts unscored initiatives last rather than treating a
  // missing score as zero.
  const compare = order === "score"
    ? (first, second) => {
        const firstScore = projectScore(first);
        const secondScore = projectScore(second);
        if (firstScore === null && secondScore === null) return first.start.localeCompare(second.start);
        if (firstScore === null) return 1;
        if (secondScore === null) return -1;
        return secondScore - firstScore || first.start.localeCompare(second.start);
      }
    : (first, second) => first.start.localeCompare(second.start);
  return entries.map(([unit, unitProjects]) => {
    let lastCategory = null;
    let sectionIndex = 0;
    const body = collapsedUnits.has(unit) ? "" : timelineSectionsFor(unit, unitProjects).map(section => {
      // A category band appears only when its sections are named something
      // else, so a category never repeats itself directly above its own rows.
      const needsCategoryBand = section.category && section.label !== section.category && section.category !== lastCategory;
      lastCategory = section.category;
      const band = needsCategoryBand
        ? `<div class="timeline-lane timeline-sublane"><div class="timeline-lane-heading"><span>${section.category}</span><small>${unitProjects.filter(project => project.subUnit === section.category).length}</small></div><div class="timeline-lane-track">${gridMarkup}</div></div>`
        : "";
      if (!section.label) {
        // No grouping below the unit: keep the per-project rows, which carry
        // the project name in the frozen column.
        return band + section.items.slice().sort(compare).map(project => {
          const markup = timelineRowMarkup(project, range, gridMarkup, todayPosition, colors[barIndex % 4]);
          barIndex += 1;
          return markup;
        }).join("");
      }
      barIndex += section.items.length;
      sectionIndex += 1;
      return band + timelineSectionMarkup(section, range, gridMarkup, todayPosition, compare, sectionIndex - 1);
    }).join("");
    const count = `${unitProjects.length} ${unitProjects.length === 1 ? noun : `${noun}s`}`;
    return `<div class="timeline-lane"><div class="timeline-lane-heading">${unitToggleMarkup(unit)}<span>${unit}</span><small>${count}</small></div><div class="timeline-lane-track">${gridMarkup}</div></div>${body}`;
  }).join("");
}

function renderProjectTimeline(grouped) {
  const range = fiscalTimelineRange();
  const columns = range.periods.map(period => `${period.days}fr`).join(" ");
  const todayPosition = AS_OF_DATE >= range.start && AS_OF_DATE <= range.end
    ? (AS_OF_DATE - range.start + DAY / 2) / range.duration * 100
    : null;
  const currentQuarter = getFiscalYear(AS_OF_DATE) === selectedFiscalYear ? fiscalQuarterOf(AS_OF_DATE) : -1;
  const bands = quarterBands(range, currentQuarter);
  const gridMarkup = timelineGridMarkup(range, columns);
  document.querySelector("#projectTimelineLabel").textContent = `${fiscalYearLabel(selectedFiscalYear)} · Apr ${selectedFiscalYear - 1} - Mar ${selectedFiscalYear}`;

  const lanes = timelineLanesMarkup(grouped, range, gridMarkup, todayPosition, "project");

  elements.projectTimeline.innerHTML = `
    ${timelineResizerMarkup("project")}
    <div class="timeline-header"><div class="timeline-project-heading"><span>Project</span><small>${fiscalYearLabel(selectedFiscalYear)}</small></div><div class="timeline-header-scale"><div class="timeline-quarters" style="grid-template-columns:${bands.map(band => `${band.days}fr`).join(" ")}">${bands.map(band => `<div class="timeline-quarter${band.current ? " current" : ""}"><strong>Q${band.quarter}</strong><small>${band.months}</small></div>`).join("")}</div><div class="timeline-months" style="grid-template-columns:${columns}">${range.periods.map(period => `<div class="timeline-month">${period.label}</div>`).join("")}</div></div>${todayPosition === null ? "" : `<span class="timeline-today-flag" style="left:calc(var(--timeline-label-width) + (100% - var(--timeline-label-width) - var(--timeline-gutter)) * ${todayPosition / 100})">Today</span>`}${releaseMarkersMarkup(range)}</div>
    ${lanes || `<p class="timeline-empty">No projects match the current filters.</p>`}`;
}

// Release markers are placed from the release's own date, and only when that
// date falls inside the horizon on screen.
function releaseMarkersMarkup(range) {
  return sortedReleases()
    .filter(release => release.date && release.status !== "Cancelled")
    .map(release => {
      const date = new Date(`${release.date}T12:00:00`);
      if (date < range.start || date > range.end) return "";
      const position = (date - range.start) / range.duration;
      const contents = releaseContents(release.id).length;
      const risks = releaseRisks(release).length;
      return `<span class="timeline-release-flag${risks ? " release-flag-risk" : ""}" style="left:calc(var(--timeline-label-width) + (100% - var(--timeline-label-width) - var(--timeline-gutter)) * ${position})" title="${release.name} - ${release.date}, ${contents} ${contents === 1 ? "initiative" : "initiatives"}${risks ? `, ${risks} finishing after this date` : ""}">${release.name}</span>`;
    })
    .join("");
}

// The legend mirrors the deck's own chip row, so a bar's colour can be read
// off it directly.
function renderStatusLegend(selector = "#roadmapStatusLegend", visible = getRoadmapVisibleProjects()) {
  const host = document.querySelector(selector);
  if (!host) return;
  host.innerHTML = Object.entries(DECK_STATUS_COLORS).map(([status, color]) => {
    const count = visible.filter(project => project.status === status).length;
    return `<button class="status-chip${count ? "" : " status-chip-empty"}" data-status-chip="${status}" type="button" style="--chip:${color}" aria-label="${count} ${status} ${count === 1 ? "initiative" : "initiatives"} - filter the project list" title="${count} ${status} in this view">${status}<b>${count}</b></button>`;
  }).join("");
}

function renderRoadmap() {
  const range = timelineRange();
  const visible = getRoadmapVisibleProjects();
  const columns = range.periods.map(period => `${period.days}fr`).join(" ");
  const todayPosition = AS_OF_DATE >= range.start && AS_OF_DATE <= range.end ? (AS_OF_DATE - range.start + DAY / 2) / range.duration * 100 : null;
  document.querySelector("#roadmapPeriodLabel").textContent = range.label;
  document.querySelector("#roadmapMilestoneWindow").textContent = range.milestoneLabel;

  const bands = quarterBands(range, roadmapFullYear
    ? (getFiscalYear(AS_OF_DATE) === selectedFiscalYear ? fiscalQuarterOf(AS_OF_DATE) : -1)
    : roadmapQuarter);
  elements.timeline.dataset.horizon = roadmapDeckWindow ? "window" : roadmapFullYear ? "fy" : "quarter";
  const gridMarkup = timelineGridMarkup(range, columns);
  const laneEntries = projectUnits
    .map(unit => [unit, visible.filter(project => project.unit === unit)])
    .filter(([, items]) => items.length);
  const laneMarkup = timelineLanesMarkup(laneEntries, range, gridMarkup, todayPosition, "initiative", roadmapSort);

  elements.timeline.innerHTML = `
    ${timelineResizerMarkup("initiative")}
    <div class="timeline-header"><div class="timeline-project-heading"><span>Initiative</span><small>${fiscalYearLabel(selectedFiscalYear)} · Apr ${selectedFiscalYear - 1} - Mar ${selectedFiscalYear}</small></div><div class="timeline-header-scale"><div class="timeline-quarters" style="grid-template-columns:${bands.map(band => `${band.days}fr`).join(" ")}">${bands.map(band => `<div class="timeline-quarter${band.current ? " current" : ""}"><strong>Q${band.quarter}</strong><small>${band.months}</small></div>`).join("")}</div><div class="timeline-months" style="grid-template-columns:${columns}">${range.periods.map(period => `<div class="timeline-month">${period.label}</div>`).join("")}</div></div>${todayPosition === null ? "" : `<span class="timeline-today-flag" style="left:calc(var(--timeline-label-width) + (100% - var(--timeline-label-width) - var(--timeline-gutter)) * ${todayPosition / 100})">Today</span>`}${releaseMarkersMarkup(range)}</div>
    ${laneMarkup || `<p class="timeline-empty">No initiatives fall inside this horizon.</p>`}`;

  const nearing = visible.filter(project => project.progress >= 75).length;
  const planned = visible.filter(project => statusGroups.upcoming.includes(project.status)).length;
  const milestones = visible.filter(project => new Date(`${project.milestoneDate}T12:00:00`) >= range.start && new Date(`${project.milestoneDate}T12:00:00`) <= range.end).length;
  const summary = [
    ["active", visible.length, "Portfolio initiatives", "folder-kanban", "#176b53", "#dceee7"],
    ["nearing", nearing, "Nearing completion", "badge-check", "#36709b", "#e2edf5"],
    ["planned", planned, "Planned next", "calendar-clock", "#c78218", "#fbefd8"],
    ["milestones", milestones, "Milestones ahead", "flag", "#e66f51", "#fbe6df"]
  ];
  elements.roadmapSummary.innerHTML = summary.map(item => `<button class="roadmap-summary-item drilldown-card" data-drilldown="${item[0]}" type="button" style="--summary-color:${item[4]};--summary-bg:${item[5]}" aria-label="Drill down into ${item[2]}"><i>${iconMarkup(item[3])}</i><div><strong>${item[1]}</strong><span>${item[2]}</span></div>${iconMarkup("chevron-right")}</button>`).join("");
  renderMilestones(visible, range);
  renderRoadmapContention();
  renderRoadmapDependencies();
  renderRoadmapPrioritization();
  renderReleases();
  renderStatusLegend();
  renderRoadmapStrategy();
  renderRoadmapScopeStrip();
  renderQuarterPicker();
  refreshIcons();
}

function renderMilestones(sourceProjects = getFiscalProjects(), range = fiscalYearBounds()) {
  const upcoming = [...sourceProjects].filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= AS_OF_DATE && date >= range.start && date <= range.end; }).sort((a, b) => new Date(a.milestoneDate) - new Date(b.milestoneDate)).slice(0, 3);
  elements.milestoneList.innerHTML = upcoming.map((project, index) => `<button class="milestone-card open-project" data-id="${project.id}" type="button" style="--milestone-color:${["#e66f51", "#176b53", "#36709b"][index]}" aria-label="Open ${project.milestone} details"><time>${formatDate(project.milestoneDate, { month: "short", day: "numeric" })}</time><strong>${project.milestone}</strong><span>${project.name}</span></button>`).join("");
}

// The drawer lists the project's own phases. It used to list three invented
// "workstreams" whose percentages were the project's own figure plus or minus a
// constant, which is why changing one phase looked like it changed the others:
// every card was reading the same number. Each card here carries the phase's
// own recorded progress and nothing is derived.
function projectPhaseDrawerMarkup(project) {
  const phases = Array.isArray(project.phases) ? project.phases : [];
  const heading = `<div class="drawer-list-heading"><h3>Project phases</h3><span>${phases.length ? "Select a phase to open and edit it" : "None recorded"}</span></div>`;
  if (!phases.length) {
    return `${heading}<p class="drawer-empty">No phases are recorded for this project. Add them from the project's edit form.</p>`;
  }
  return `${heading}<div class="workstream-list">${phases.map((phase, index) => `<button class="workstream-card" data-phase-jump="${project.id}" data-phase-index="${index}" type="button">
    <span class="workstream-status">${phase.status === "Completed" ? iconMarkup("circle-check") : iconMarkup("layers-3")}</span>
    <span><strong>${phase.name}</strong><small>${phase.start && phase.end ? `${formatDate(phase.start)} - ${formatDate(phase.end)}` : "No dates set"} - ${phase.status}</small>
    ${hasPhaseProgress(phase) ? `<span class="mini-progress"><i style="width:${phase.progress}%"></i></span>` : ""}</span>
    <b>${hasPhaseProgress(phase) ? `${phase.progress}%` : "-"}</b>${iconMarkup("chevron-right")}</button>`).join("")}</div>`;
}

function drawerReturnFooter(label) {
  return `<div class="drawer-return-footer"><button class="drawer-bottom-back" data-drawer-back type="button">${iconMarkup("arrow-left")} Return to ${label}</button></div>`;
}

function renderPortfolioDrawer(key, parentView = activeView) {
  const definition = drilldownDefinitions[key];
  if (!definition) return;
  const source = parentView === "roadmap" ? getRoadmapVisibleProjects() : getFiscalProjects();
  const range = timelineRange();
  const matching = key === "milestones" && parentView === "roadmap" ? source.filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= range.start && date <= range.end; }) : source.filter(definition.filter);
  drawerState = { level: "portfolio", key, parent: { level: "view", view: parentView } };
  elements.drawer.innerHTML = `<div class="drawer-header"><div class="drawer-header-top"><button class="drawer-back" data-drawer-back type="button">${iconMarkup("arrow-left")} Back to ${parentView === "roadmap" ? "roadmap" : "projects"}</button><button class="icon-button close-drawer" type="button" aria-label="Close details">${iconMarkup("x")}</button></div><div class="drawer-title-row"><span class="drawer-title-icon">${iconMarkup(definition.icon)}</span><div><h2 id="drawerTitle">${definition.title}</h2><p>${definition.description}</p></div></div></div>
    <div class="drawer-body"><div class="drawer-level"><span>Portfolio</span>${iconMarkup("chevron-right")}<strong>${definition.title}</strong></div><div class="drawer-list-heading"><h3>${matching.length} ${matching.length === 1 ? "project" : "projects"}</h3><span>Select a project to continue</span></div><div class="drawer-project-list">${matching.map((project, index) => `<button class="drawer-project-card open-project" data-id="${project.id}" type="button"><span class="project-icon ${colors[index % colors.length]}">${project.code}</span><span><strong>${project.name}</strong><small>${project.team} - ${project.owner}</small><span class="mini-progress"><i style="width:${project.progress}%"></i></span></span><span class="drawer-project-meta"><b>${project.progress}%</b>${iconMarkup("chevron-right")}</span></button>`).join("") || `<div class="drawer-empty">No projects match this portfolio segment.</div>`}</div></div>${drawerReturnFooter(parentView === "roadmap" ? "roadmap" : "projects")}`;
  openDrawer();
}

function renderDrawer(projectId, tab = "overview", explicitParent) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project) return;
  const existingProject = drawerState?.level === "project" && drawerState.projectId === project.id;
  const parent = explicitParent || (existingProject ? drawerState.parent : drawerState?.level === "portfolio" ? { level: "portfolio", key: drawerState.key, view: drawerState.parent.view } : drawerState?.level === "team" ? { level: "team", teamId: drawerState.teamId } : { level: "view", view: activeView });
  drawerState = { level: "project", projectId: project.id, tab, parent };
  const halfway = new Date((new Date(project.start).getTime() + new Date(project.end).getTime()) / 2).toISOString().slice(0, 10);
  const overview = `<div class="drawer-stat-grid"><div class="drawer-stat"><span>Owner</span><strong>${project.owner}</strong></div><div class="drawer-stat"><span>Target</span><strong>${formatDate(project.end)}</strong></div><div class="drawer-stat"><span>Risk</span><strong>${project.risk}</strong></div></div><section class="drawer-section"><div class="drawer-progress-label"><strong>Overall progress</strong><span>${project.progress}%</span></div><div class="progress-track drawer-progress"><span style="width:${project.progress}%"></span></div></section><section class="drawer-section"><h3>Objective</h3><p class="drawer-copy">${project.objective}</p></section><section class="drawer-section"><h3>Core team</h3><div class="drawer-team">${project.members.map(member => `<span class="avatar">${member}</span>`).join("")}<span>${project.members.length} contributors</span></div></section>`;
  const phasesTab = projectPhaseDrawerMarkup(project);
  const milestones = `<section><div class="drawer-list-heading"><h3>Delivery milestones</h3><span>Key gates and target dates</span></div><div class="drawer-milestone"><i></i><strong>Project kickoff</strong><time>${formatDate(project.start)}</time></div><div class="drawer-milestone"><i class="${project.progress < 50 ? "future" : ""}"></i><strong>Midpoint review</strong><time>${formatDate(halfway)}</time></div><div class="drawer-milestone"><i class="future"></i><strong>${project.milestone}</strong><time>${formatDate(project.milestoneDate)}</time></div><div class="drawer-milestone"><i class="future"></i><strong>Target completion</strong><time>${formatDate(project.end)}</time></div></section><section class="drawer-section"><h3>Delivery signal</h3><div class="risk-callout risk-${project.risk.toLowerCase()}">${iconMarkup(project.risk === "High" ? "triangle-alert" : "shield-check")}<span><strong>${project.risk} risk</strong><small>${project.status === "Off track" ? "Executive intervention is recommended." : "Risk posture is monitored in the weekly review."}</small></span></div></section>`;
  const backLabel = parent.level === "portfolio" ? drilldownDefinitions[parent.key].title : parent.level === "team" ? `Team ${parent.teamId}` : parent.view === "roadmap" ? "Roadmap" : "Projects";
  elements.drawer.innerHTML = `<div class="drawer-header"><div class="drawer-header-top"><div class="drawer-header-actions"><button class="drawer-back" data-drawer-back type="button">${iconMarkup("arrow-left")} ${backLabel}</button><span class="status-pill status-${slug(project.status)}">${project.status}</span></div><button class="icon-button close-drawer" type="button" aria-label="Close project details">${iconMarkup("x")}</button></div><h2 id="drawerTitle">${project.name}</h2><p>${project.team} initiative - ${project.owner}</p></div><div class="drawer-tabs" role="tablist" aria-label="Project details"><button class="${tab === "overview" ? "active" : ""}" data-project-tab="overview" data-id="${project.id}" type="button">Overview</button><button class="${tab === "phases" ? "active" : ""}" data-project-tab="phases" data-id="${project.id}" type="button">Phases</button><button class="${tab === "milestones" ? "active" : ""}" data-project-tab="milestones" data-id="${project.id}" type="button">Milestones</button></div><div class="drawer-body">${tab === "overview" ? overview : tab === "phases" ? phasesTab : milestones}</div>${drawerReturnFooter(backLabel)}`;
  openDrawer();
}

function openDrawer() {
  elements.drawer.classList.add("open");
  elements.drawerBackdrop.classList.add("open");
  elements.drawer.setAttribute("aria-hidden", "false");
  refreshIcons();
}

function closeDrawer() {
  elements.drawer.classList.remove("open");
  elements.drawerBackdrop.classList.remove("open");
  elements.drawer.setAttribute("aria-hidden", "true");
  drawerState = null;
}

function returnToParent() {
  if (!drawerState) return;
  if (drawerState.level === "project" && drawerState.parent.level === "portfolio") {
    renderPortfolioDrawer(drawerState.parent.key, drawerState.parent.view);
  } else if (drawerState.level === "project" && drawerState.parent.level === "team") {
    renderTeamDrawer(drawerState.parent.teamId);
  } else {
    closeDrawer();
  }
}

function switchView(view) {
  activeView = view;
  document.body.dataset.workspace = view;
  document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  document.querySelectorAll(".view").forEach(item => item.classList.remove("active"));
  if (view === "projects") document.querySelector("#projectsView").classList.add("active");
  else if (view === "roadmap") { document.querySelector("#roadmapView").classList.add("active"); renderRoadmap(); }
  else if (view === "ideas") { document.querySelector("#ideasView").classList.add("active"); renderIdeas(); }
  else if (view === "reports") { document.querySelector("#reportsView").classList.add("active"); renderReports(); }
  else if (view === "team") { document.querySelector("#teamsView").classList.add("active"); renderTeams(); }
  else if (view === "resources") { document.querySelector("#resourcesView").classList.add("active"); renderResources(); }
  else {
    document.querySelector("#placeholderView").classList.add("active");
    document.querySelector("#placeholderTitle").textContent = view[0].toUpperCase() + view.slice(1);
  }
  document.querySelector("#sidebar").classList.remove("open");
  updateWorkspaceContext(view);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateWorkspaceContext(view) {
  const context = {
    projects: ["layout-dashboard", "Delivery workspace", "Projects", "Search projects, owners, teams...", "New project"],
    "project-detail": ["briefcase-business", "Project workspace", "Project details", "Search projects, owners, teams...", "New project"],
    roadmap: ["route", "Strategy workspace", "Roadmap", "Search initiatives, milestones, teams...", "New initiative"],
    ideas: ["lightbulb", "Intake workspace", "Ideas", "Search ideas and feedback...", "New project"],
    reports: ["chart-no-axes-combined", "Intelligence workspace", "Reports", "Search reports and portfolio data...", "New project"],
    team: ["users", "Management workspace", "Team", "Search people and teams...", "New team"],
    resources: ["boxes", "Management workspace", "Resources", "Search resources...", "New resource"]
  }[view] || ["layout-dashboard", "Workspace", view, "Search workspace...", "New project"];
  document.querySelector("#workspaceContext").innerHTML = `<span class="workspace-context-icon">${iconMarkup(context[0])}</span><span><small>${context[1]}</small><strong>${context[2]}</strong></span>`;
  document.querySelector("#globalSearch").placeholder = context[3];
  document.querySelector("#globalSearch").setAttribute("aria-label", context[3].replace("...", ""));
  document.querySelector("#openProjectModal span").textContent = context[4];
  document.querySelector("#openProjectModal").setAttribute("aria-label", context[4]);
  refreshIcons();
}

// ---- Strategy alignment fields on the project form ------------------------

function renderProjectGoalChecks(goalIds = []) {
  const goals = roadmapStrategy.goals || [];
  const host = document.querySelector("#projectGoalFields");
  host.innerHTML = goals.length
    ? goals.map(goal => `<label class="goal-check"><input type="checkbox" data-goal-check value="${goal.id}"${goalIds.includes(goal.id) ? " checked" : ""}><span><strong>${goal.title}</strong><small>${goal.outcome || "No outcome recorded"}</small></span></label>`).join("")
    : `<p class="alignment-empty">No strategic goals recorded yet. Add them under Roadmap - Edit strategy, then link this initiative to one.</p>`;
}

function renderProjectDependsOptions(project) {
  const select = document.querySelector("#projectDependsOn");
  const selected = project ? project.dependsOn : [];
  const options = projectUnits
    .map(unit => {
      const items = projects
        .filter(item => item.unit === unit && (!project || item.id !== project.id))
        .sort((first, second) => first.name.localeCompare(second.name));
      return items.length
        ? `<optgroup label="${unit}">${items.map(item => `<option value="${item.id}"${selected.includes(item.id) ? " selected" : ""}>${item.name}</option>`).join("")}</optgroup>`
        : "";
    })
    .join("");
  select.innerHTML = options || `<option value="" disabled>No other initiatives to depend on yet</option>`;
}

function renderProjectScoreFields(scoring = {}) {
  const model = activeScoreModel();
  document.querySelector("#projectScoreModelName").textContent = `${model.label} - ${model.hint}`;
  document.querySelector("#projectScoreFields").innerHTML = model.fields.map(field => `<label>${field.label}<input type="number" data-score-field="${field.key}" min="${field.min}"${field.max === null ? "" : ` max="${field.max}"`} step="${field.step}" value="${scoring[field.key] ?? ""}" placeholder="unscored"><small>${field.help}</small></label>`).join("");
  updateScorePreview();
}

function readScoreFields() {
  const model = activeScoreModel();
  const scoring = {};
  model.fields.forEach(field => {
    const input = document.querySelector(`[data-score-field="${field.key}"]`);
    scoring[field.key] = input ? numberOrNull(input.value) : null;
  });
  return scoring;
}

// The preview only ever reflects what is typed in: with a field blank it says
// so rather than showing a partial score.
function updateScorePreview() {
  const model = activeScoreModel();
  const scoring = readScoreFields();
  const preview = document.querySelector("#projectScorePreview");
  if (!preview) return;
  const raw = model.score(scoring);
  if (raw === null || !Number.isFinite(raw)) {
    const missing = model.fields.filter(field => scoring[field.key] === null || scoring[field.key] === 0).map(field => field.label);
    preview.textContent = missing.length
      ? `Not scored yet - ${missing.join(", ").toLowerCase()} still needed.`
      : "Not scored yet.";
    preview.classList.remove("scored");
    return;
  }
  const quadrant = scoreQuadrant({ scoring });
  preview.textContent = `${model.label} score ${raw.toFixed(model.decimals)}${quadrant ? ` - ${quadrant.label}` : ""}`;
  preview.classList.add("scored");
}

function renderProjectReleaseOptions(project) {
  const select = document.querySelector("#projectRelease");
  select.innerHTML = `<option value="">Not part of a release</option>`
    + sortedReleases().map(release => `<option value="${release.id}"${project && project.releaseId === release.id ? " selected" : ""}>${release.name}${release.date ? ` - ${formatDate(release.date)}` : ""}</option>`).join("");
  select.disabled = releases.length === 0;
}

function renderAlignmentFields(project = null) {
  renderCustomFieldInputs(project);
  renderProjectGoalChecks(project ? project.goalIds : []);
  renderProjectDependsOptions(project);
  renderProjectReleaseOptions(project);
  renderProjectScoreFields(project ? project.scoring : {});
}

function readAlignmentFields(existing) {
  const goalIds = [...document.querySelectorAll("#projectGoalFields [data-goal-check]:checked")].map(input => Number(input.value));
  const dependsOn = [...document.querySelector("#projectDependsOn").selectedOptions].map(option => Number(option.value)).filter(Number.isFinite);
  // Keep numbers captured under a different model rather than dropping them.
  const scoring = { ...(existing?.scoring || {}), ...readScoreFields() };
  const releaseValue = document.querySelector("#projectRelease").value;
  const releaseId = releaseValue && releaseById(releaseValue) ? Number(releaseValue) : null;
  return { goalIds, dependsOn, scoring, releaseId, custom: readCustomFieldInputs(existing) };
}

function openModal() {
  projectBeingEdited = null;
  elements.form.reset();
  elements.form.elements.end.setCustomValidity("");
  elements.form.elements.milestoneDate.setCustomValidity("");
  const start = new Date();
  const end = new Date(start.getTime() + 90 * DAY);
  elements.form.elements.start.value = start.toISOString().slice(0, 10);
  elements.form.elements.end.value = end.toISOString().slice(0, 10);
  elements.form.elements.milestoneDate.value = new Date(start.getTime() + 45 * DAY).toISOString().slice(0, 10);
  projectTeamTouched = false;
  populateProjectUnitOptions(elements.form.elements.unit.value);
  populateProjectSubUnitOptions(elements.form.elements.unit.value, "");
  populateProjectSubCategoryOptions(elements.form.elements.unit.value, elements.form.elements.subUnit.value, "");
  renderPhaseRows([]);
  renderAlignmentFields(null);
  populateProjectTeamOptions(defaultTeamForUnit(elements.form.elements.unit.value));
  document.querySelector("#projectModalKicker").textContent = "Portfolio intake";
  document.querySelector("#projectModalTitle").textContent = "Create a new project";
  document.querySelector("#saveProjectButton span").textContent = "Create project";
  document.querySelector("#saveProjectButton i, #saveProjectButton svg")?.remove();
  document.querySelector("#saveProjectButton").insertAdjacentHTML("afterbegin", iconMarkup("plus"));
  elements.modal.showModal();
  refreshIcons();
}

function openEditProjectModal(projectId) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project) return;
  projectBeingEdited = project.id;
  elements.form.reset();
  projectTeamTouched = true;
  populateProjectUnitOptions(project.unit);
  populateProjectSubUnitOptions(project.unit, project.subUnit);
  populateProjectSubCategoryOptions(project.unit, project.subUnit, project.subCategory);
  renderPhaseRows(project.phases);
  renderAlignmentFields(project);
  document.querySelectorAll(".phase-row-focused").forEach(row => row.classList.remove("phase-row-focused"));
  populateProjectTeamOptions(project.team);
  const values = { name: project.name, unit: project.unit, team: project.team, subUnit: project.subUnit || "", owner: project.owner, objective: project.objective, start: project.start, end: project.end, status: project.status, progress: project.progress, priority: project.priority, risk: project.risk, approxCost: project.approxCost ?? "", scheduleVariance: scheduleVariance(project), contributors: project.memberNames?.filter(name => name.toLowerCase() !== project.owner.toLowerCase()).join(", ") || "", milestone: project.milestone, milestoneDate: project.milestoneDate };
  Object.entries(values).forEach(([field, value]) => { elements.form.elements[field].value = value; });
  // The phase rows are built before these values land, so the overall progress
  // note is refreshed here to quote the figure the field actually holds.
  updateProgressRollupNote();
  document.querySelector("#projectModalKicker").textContent = "Project management";
  document.querySelector("#projectModalTitle").textContent = `Edit ${project.name}`;
  document.querySelector("#saveProjectButton span").textContent = "Save changes";
  document.querySelector("#saveProjectButton i, #saveProjectButton svg")?.remove();
  document.querySelector("#saveProjectButton").insertAdjacentHTML("afterbegin", iconMarkup("save"));
  elements.modal.showModal();
  refreshIcons();
}

function openDeleteProjectModal(projectId) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project) return;
  projectPendingDeletion = project.id;
  document.querySelector("#deleteProjectName").textContent = project.name;
  elements.deleteProjectModal.showModal();
  refreshIcons();
}

function deleteSelectedProject() {
  const project = projects.find(item => item.id === projectPendingDeletion);
  if (!project) return;
  projects = projects.filter(item => item.id !== project.id);
  teamDirectory.forEach(team => { team.projectIds = team.projectIds.filter(id => id !== project.id); });
  saveProjects();
  saveTeams();
  elements.deleteProjectModal.close();
  projectPendingDeletion = null;
  populateTeamFilters();
  populateFiscalYearFilters();
  renderAll();
  returnToProjects();
  showToast(`${project.name} deleted`);
}

function setTeamFormMode(team = null) {
  teamBeingEdited = team?.id || null;
  elements.teamForm.reset();
  document.querySelector("#teamModalKicker").textContent = team ? "Team management" : "Organization intake";
  document.querySelector("#teamModalTitle").textContent = team ? `Modify ${team.name}` : "Create a new team";
  document.querySelector("#teamModalDescription").textContent = team ? "Update team identity and accountable role assignments." : "Define accountable roles for a cross-functional delivery team.";
  document.querySelector("#saveTeamButton span").textContent = team ? "Save changes" : "Create team";
  document.querySelector("#saveTeamButton i, #saveTeamButton svg")?.remove();
  document.querySelector("#saveTeamButton").insertAdjacentHTML("afterbegin", iconMarkup(team ? "save" : "user-round-plus"));
  if (!team) return;
  elements.teamForm.elements.teamName.value = team.name;
  teamRoleFields.forEach(([field, label]) => { elements.teamForm.elements[field].value = team.roles?.[label] || ""; });
}

function openTeamModal() {
  setTeamFormMode();
  elements.teamModal.showModal();
  refreshIcons();
}

function openModifyTeamModal(teamId) {
  const team = teamDirectory.find(item => item.id === Number(teamId));
  if (!team) return;
  setTeamFormMode(team);
  elements.teamModal.showModal();
  refreshIcons();
}

function openPrimaryCreateModal() {
  if (activeView === "team") openTeamModal();
  else if (activeView === "resources") openResourceModal();
  else openModal();
}

function openResourceModal() {
  resourceBeingEdited = null;
  elements.resourceForm.reset();
  populateResourceFilters();
  document.querySelector("#resourceModalKicker").textContent = "Resource intake";
  document.querySelector("#resourceModalTitle").textContent = "New resource";
  document.querySelector("#resourceModalDescription").textContent = "Assign a person to a standard role and synchronize the selected team.";
  document.querySelector("#saveResourceButton span").textContent = "Create resource";
  updateResourceMoveWarning();
  elements.resourceModal.showModal();
  refreshIcons();
}

function openModifyResourceModal(resourceId) {
  const resource = findResource(resourceId);
  if (!resource) return;
  resourceBeingEdited = { teamId: resource.teamId, role: resource.role, name: resource.name };
  elements.resourceForm.reset();
  populateResourceFilters();
  elements.resourceForm.elements.resourceName.value = resource.name;
  elements.resourceForm.elements.resourceRole.value = resource.role;
  elements.resourceForm.elements.assignedTeam.value = resource.teamId;
  elements.resourceForm.elements.allocation.value = resource.allocation;
  elements.resourceForm.elements.availability.value = resource.availability;
  document.querySelector("#resourceModalKicker").textContent = "Resource management";
  document.querySelector("#resourceModalTitle").textContent = `Modify ${resource.name}`;
  document.querySelector("#resourceModalDescription").textContent = "Update this assignment and synchronize the affected teams.";
  document.querySelector("#saveResourceButton span").textContent = "Save changes";
  updateResourceMoveWarning();
  elements.resourceModal.showModal();
  refreshIcons();
}

function teamRoleSlotsFor(team, name) {
  if (!name) return [];
  return teamRoleFields.map(([, label]) => label).filter(label => team.roles[label] === name);
}

function plannedResourceMove(data) {
  const team = teamDirectory.find(item => item.id === Number(data.assignedTeam));
  if (!team) return null;
  const name = data.resourceName.trim();
  const previousTeam = resourceBeingEdited ? teamDirectory.find(item => item.id === resourceBeingEdited.teamId) : null;
  const movingTeams = Boolean(previousTeam) && previousTeam.id !== team.id;
  // Moving a person to another team carries every role they hold on the old team.
  const sourceRoles = movingTeams ? teamRoleSlotsFor(previousTeam, resourceBeingEdited.name) : [];
  const targetRoles = movingTeams
    ? sourceRoles.map(role => (role === resourceBeingEdited.role ? data.resourceRole : role))
    : [data.resourceRole];
  const displaced = [...new Set(targetRoles.map(role => team.roles[role]).filter(person => person && person !== name))];
  return { team, previousTeam, movingTeams, name, sourceRoles, targetRoles, displaced };
}

function updateResourceMoveWarning() {
  const warning = document.querySelector("#resourceMoveWarning");
  if (!warning) return;
  const plan = plannedResourceMove(Object.fromEntries(new FormData(elements.resourceForm)));
  if (!plan) { warning.textContent = ""; return; }
  const notes = [];
  if (plan.movingTeams && plan.sourceRoles.length > 1) {
    notes.push(`${plan.name} holds ${plan.sourceRoles.length} roles on ${plan.previousTeam.name} - all of them move to ${plan.team.name}.`);
  }
  if (plan.displaced.length) {
    notes.push(`This replaces ${plan.displaced.join(" and ")} on ${plan.team.name}.`);
  }
  warning.textContent = notes.join(" ");
  warning.hidden = notes.length === 0;
}

function submitResource(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.resourceForm));
  const plan = plannedResourceMove(data);
  if (!plan) return;
  const { team, previousTeam, movingTeams, name, sourceRoles, displaced } = plan;
  if (movingTeams) {
    sourceRoles.forEach(role => {
      const targetRole = role === resourceBeingEdited.role ? data.resourceRole : role;
      const carriedMeta = previousTeam.resourceMeta?.[role];
      previousTeam.roles[role] = "";
      if (previousTeam.resourceMeta) delete previousTeam.resourceMeta[role];
      team.roles[targetRole] = name;
      if (carriedMeta) {
        team.resourceMeta = team.resourceMeta || {};
        team.resourceMeta[targetRole] = { ...carriedMeta };
      }
    });
    recomputeTeamMembers(previousTeam);
  } else if (previousTeam && previousTeam.roles[resourceBeingEdited.role] === resourceBeingEdited.name && resourceBeingEdited.role !== data.resourceRole) {
    previousTeam.roles[resourceBeingEdited.role] = "";
    if (previousTeam.resourceMeta) delete previousTeam.resourceMeta[resourceBeingEdited.role];
    recomputeTeamMembers(previousTeam);
  }
  const previousResourceId = resourceBeingEdited ? `${resourceBeingEdited.teamId}-${slug(resourceBeingEdited.role)}` : null;
  const savedResourceId = `${team.id}-${slug(data.resourceRole)}`;
  team.roles[data.resourceRole] = name;
  team.resourceMeta = team.resourceMeta || {};
  team.resourceMeta[data.resourceRole] = { allocation: Number(data.allocation), availability: data.availability };
  recomputeTeamMembers(team);
  team.headcount = Math.max(team.headcount, team.members.length);
  saveTeams();
  elements.resourceModal.close();
  elements.resourceForm.reset();
  renderTeams();
  renderResources();
  if (drawerState?.level === "resource" && [previousResourceId, savedResourceId].includes(drawerState.resourceId)) {
    if (findResource(savedResourceId)) renderResourceDrawer(savedResourceId);
    else closeDrawer();
  }
  const moved = movingTeams
    ? `${name} moved to ${team.name}${sourceRoles.length > 1 ? ` with ${sourceRoles.length} roles` : ""}`
    : resourceBeingEdited ? `${name} updated` : `${name} assigned to ${team.name}`;
  showToast(displaced.length ? `${moved} - replaced ${displaced.join(" and ")}` : moved);
  resourceBeingEdited = null;
}

function openDeleteResourceModal(resourceId) {
  const resource = findResource(resourceId);
  if (!resource) return;
  resourcePendingDeletion = { teamId: resource.teamId, role: resource.role, name: resource.name };
  document.querySelector("#deleteResourceName").textContent = resource.name;
  document.querySelector("#deleteResourceImpact").textContent = `This will remove ${resource.name} as ${resource.role} from ${resource.teamName}.`;
  elements.deleteResourceModal.showModal();
  refreshIcons();
}

function deleteSelectedResource() {
  if (!resourcePendingDeletion) return;
  const team = teamDirectory.find(item => item.id === resourcePendingDeletion.teamId);
  if (!team || team.roles[resourcePendingDeletion.role] !== resourcePendingDeletion.name) return;
  team.roles[resourcePendingDeletion.role] = "";
  if (team.resourceMeta) delete team.resourceMeta[resourcePendingDeletion.role];
  recomputeTeamMembers(team);
  saveTeams();
  elements.deleteResourceModal.close();
  closeDrawer();
  renderTeams();
  renderResources();
  showToast(`${resourcePendingDeletion.name} removed from ${team.name}`);
  resourcePendingDeletion = null;
}

function submitTeam(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.teamForm));
  const roleEntries = teamRoleFields.map(([field, label]) => [label, data[field].trim()]);
  const members = [...new Set(roleEntries.map(([, member]) => member).filter(Boolean))];
  const existing = teamDirectory.find(team => team.id === teamBeingEdited);
  const previousName = existing?.name;
  if (existing) {
    Object.assign(existing, { name: data.teamName.trim(), lead: data.productOwner.trim(), headcount: members.length, members, roles: Object.fromEntries(roleEntries) });
  } else {
    const id = Math.max(0, ...teamDirectory.map(team => team.id)) + 1;
    teamDirectory.push({ id, name: data.teamName.trim(), specialty: "Cross-functional Delivery", lead: data.productOwner.trim(), capacity: 0, headcount: members.length, projectIds: [], members, roles: Object.fromEntries(roleEntries) });
  }
  const renamedProjects = previousName && previousName !== data.teamName.trim()
    ? projects.filter(project => project.team === previousName)
    : [];
  renamedProjects.forEach(project => { project.team = data.teamName.trim(); });
  saveTeams();
  if (renamedProjects.length) {
    saveProjects();
    populateTeamFilters();
    renderAll();
  }
  elements.teamModal.close();
  elements.teamForm.reset();
  renderTeams();
  showToast(existing ? `${data.teamName.trim()} updated` : `${data.teamName.trim()} added to the team directory`);
  teamBeingEdited = null;
}

function submitProject(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.form));
  if (new Date(data.end) <= new Date(data.start)) {
    elements.form.elements.end.setCustomValidity("Target date must be after the start date.");
    elements.form.elements.end.reportValidity();
    return;
  }
  if (new Date(data.milestoneDate) < new Date(data.start) || new Date(data.milestoneDate) > new Date(data.end)) {
    elements.form.elements.milestoneDate.setCustomValidity("Milestone date must fall within the project timeline.");
    elements.form.elements.milestoneDate.reportValidity();
    return;
  }
  elements.form.elements.end.setCustomValidity("");
  elements.form.elements.milestoneDate.setCustomValidity("");
  const contributorNames = data.contributors.split(",").map(name => name.trim()).filter(Boolean);
  const memberNames = [data.owner, ...contributorNames.filter(name => name.toLowerCase() !== data.owner.toLowerCase())];
  const existing = projects.find(project => project.id === projectBeingEdited);
  const members = existing && !existing.memberNames && !contributorNames.length ? [initials(data.owner), ...existing.members.slice(1)] : memberNames.map(initials);
  const historyBefore = existing ? { ...existing } : null;
  const alignment = readAlignmentFields(existing);
  if (existing && wouldCreateCycle(existing.id, alignment.dependsOn)) {
    const select = elements.form.elements.dependsOn;
    select.setCustomValidity("That dependency is circular - the initiative would end up waiting on itself.");
    select.reportValidity();
    return;
  }
  elements.form.elements.dependsOn.setCustomValidity("");
  const projectData = { goalIds: alignment.goalIds, dependsOn: alignment.dependsOn, scoring: alignment.scoring, releaseId: alignment.releaseId, custom: alignment.custom, name: data.name, code: initials(data.name), team: directoryTeamNames().includes(data.team) ? data.team : defaultTeamForUnit(data.unit), unit: data.unit, subUnit: data.subUnit !== ADD_NEW_VALUE && subCategoriesFor(data.unit).includes(data.subUnit) ? data.subUnit : "", subCategory: data.subCategory === ADD_NEW_VALUE ? "" : String(data.subCategory || "").trim(), phases: readPhaseRows(), owner: data.owner, status: data.status, progress: phaseProgressRollup(readPhaseRows()) ?? Number(data.progress), start: data.start, end: data.end, risk: data.risk, priority: data.priority, approxCost: Number(data.approxCost), objective: data.objective, milestone: data.milestone, milestoneDate: data.milestoneDate, scheduleVariance: Number(data.scheduleVariance), members, memberNames: existing && !existing.memberNames && !contributorNames.length ? undefined : memberNames };
  const savedProject = existing || { id: Date.now(), ...projectData };
  if (existing) Object.assign(existing, projectData);
  else projects.push(savedProject);
  recordProjectChange(historyBefore, savedProject, "edited the project form");
  teamDirectory.forEach(team => { team.projectIds = team.projectIds.filter(id => id !== savedProject.id); });
  const assignedTeam = teamDirectory.find(team => team.name === savedProject.team);
  if (assignedTeam && !assignedTeam.projectIds.includes(savedProject.id)) assignedTeam.projectIds.push(savedProject.id);
  if (ideaAwaitingPromotion) {
    const idea = ideaById(ideaAwaitingPromotion);
    if (idea) {
      idea.promotedProjectId = savedProject.id;
      idea.status = "Accepted";
      saveIdeas();
    }
    ideaAwaitingPromotion = null;
  }
  saveProjects();
  saveTeams();
  elements.modal.close();
  elements.form.reset();
  populateTeamFilters();
  populateFiscalYearFilters();
  renderAll();
  if (existing) renderProjectPage(existing.id);
  // Only announce the plain outcome when the project is actually on screen;
  // otherwise revealSavedProject says what it had to change to show it.
  if (!revealSavedProject(savedProject, !existing)) {
    showToast(existing ? `${data.name} updated` : `${data.name} added to the portfolio`);
  }
  projectBeingEdited = null;
}

// A save that lands outside the view is the same as a save that did nothing,
// as far as the person looking at the screen can tell. So after saving, if the
// project would not be visible, the view moves to where it is and says so
// rather than leaving an empty space behind.
function revealSavedProject(project, isNew) {
  const reasons = [];
  if (!projectOverlapsFiscalYear(project)) {
    const year = getFiscalYear(new Date(`${project.start}T12:00:00`));
    reasons.push(`the fiscal year to ${fiscalYearLabel(year)}`);
    setFiscalYear(year);
  }
  if (!matchesProjectScope(project)) {
    reasons.push("the filters");
    clearProjectScope();
  }
  if (!reasons.length) return false;
  showToast(`${isNew ? "Added" : "Saved"} "${project.name}" - moved ${reasons.join(" and ")} so you can see it`);
  return true;
}

function showToast(message) {
  elements.toast.querySelector("span").textContent = message;
  elements.toast.classList.add("show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 2800);
}

function renderAll() {
  renderMetrics();
  renderHealth();
  renderAttention();
  renderCapacity();
  renderProjects();
  renderRoadmap();
  renderReports();
  renderTeams();
  renderResources();
  renderIdeas();
  renderSavedViews();
  renderAlerts();
  refreshIcons();
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) switchView(viewButton.dataset.view);
  const phaseJump = event.target.closest("[data-phase-jump]");
  if (phaseJump) {
    openProjectPhase(phaseJump.dataset.phaseJump, Number(phaseJump.dataset.phaseIndex));
    return;
  }
  const projectButton = event.target.closest(".open-project");
  if (projectButton && suppressNextBarClick) { suppressNextBarClick = false; return; }
  if (projectButton) renderDrawer(projectButton.dataset.id);
  const projectPageButton = event.target.closest(".open-project-page, .project-select-row");
  if (projectPageButton) renderProjectPage(projectPageButton.dataset.id || projectPageButton.dataset.projectPage);
  const editProjectButton = event.target.closest("[data-edit-project]");
  if (editProjectButton) openEditProjectModal(editProjectButton.dataset.editProject);
  const deleteProjectButton = event.target.closest("[data-delete-project]");
  if (deleteProjectButton) openDeleteProjectModal(deleteProjectButton.dataset.deleteProject);
  const drilldownButton = event.target.closest("[data-drilldown]");
  if (drilldownButton) renderPortfolioDrawer(drilldownButton.dataset.drilldown);
  const openProjectButton = event.target.closest("[data-open-project]");
  if (openProjectButton) renderProjectPage(openProjectButton.dataset.openProject);
  const goalScopeButton = event.target.closest("[data-goal-scope]");
  if (goalScopeButton) applyGoalScope(goalScopeButton.dataset.goalScope);
  const statusChip = event.target.closest("[data-status-chip]");
  if (statusChip) {
    statusFilter = statusChip.dataset.statusChip;
    populateTeamFilters();
    if (activeView !== "projects") switchView("projects");
    renderProjects();
    showToast(`Showing ${statusChip.dataset.statusChip} initiatives`);
  }
  const metricButton = event.target.closest("[data-metric-focus]");
  if (metricButton) focusMetric(metricButton.dataset.metricFocus);
  const contentionButton = event.target.closest("[data-contention-focus]");
  if (contentionButton) {
    const pair = contentionButton.dataset.contentionFocus.split(":").map(Number)
      .map(id => projects.find(project => project.id === id)).filter(Boolean);
    if (pair.length) applyFocusSet(`${pair[0].team} overlap`, pair, "the two initiatives sharing this team at the same time");
  }
  const releaseFocusButton = event.target.closest("[data-release-focus]");
  if (releaseFocusButton) {
    const release = releaseById(releaseFocusButton.dataset.releaseFocus);
    if (release) applyFocusSet(release.name, releaseContents(release.id), "the initiatives assigned to this release");
  }
  const shareProjectButton = event.target.closest("[data-share-project]");
  if (shareProjectButton) {
    const project = projects.find(item => item.id === Number(shareProjectButton.dataset.shareProject));
    if (project) openShareModal(shareUrlForProject(project.id), `Anyone opening this link lands on ${project.name}.`);
  }
  const deleteFieldButton = event.target.closest("[data-delete-field]");
  if (deleteFieldButton) deleteCustomField(deleteFieldButton.dataset.deleteField);
  const removeTaxonomyButton = event.target.closest("[data-remove-taxonomy]");
  if (removeTaxonomyButton) removeTaxonomyRow(removeTaxonomyButton);
  const editSpecButton = event.target.closest("[data-edit-spec]");
  if (editSpecButton) openSpecModal(editSpecButton.dataset.editSpec);
  const addNoteButton = event.target.closest("[data-add-note]");
  if (addNoteButton) {
    const input = document.querySelector("#projectNoteInput");
    if (addProjectNote(addNoteButton.dataset.addNote, input.value)) {
      renderProjectPage(addNoteButton.dataset.addNote);
      showToast("Note added");
    }
  }
  const deleteNoteButton = event.target.closest("[data-delete-note]");
  if (deleteNoteButton) {
    deleteProjectNote(deleteNoteButton.dataset.projectId, deleteNoteButton.dataset.deleteNote);
    renderProjectPage(deleteNoteButton.dataset.projectId);
  }
  const editReleaseButton = event.target.closest("[data-edit-release]");
  if (editReleaseButton) openReleaseModal(editReleaseButton.dataset.editRelease);
  const deleteReleaseButton = event.target.closest("[data-delete-release]");
  if (deleteReleaseButton) deleteRelease(deleteReleaseButton.dataset.deleteRelease);
  const openIdeaButton = event.target.closest("[data-open-idea]");
  if (openIdeaButton) openIdeaModal(openIdeaButton.dataset.openIdea);
  const promoteIdeaButton = event.target.closest("[data-promote-idea]");
  if (promoteIdeaButton) promoteIdea(promoteIdeaButton.dataset.promoteIdea);
  const deleteIdeaButton = event.target.closest("[data-delete-idea]");
  if (deleteIdeaButton) deleteIdea(deleteIdeaButton.dataset.deleteIdea);
  const deleteFeedbackButton = event.target.closest("[data-delete-feedback]");
  if (deleteFeedbackButton) deleteFeedbackRecord(deleteFeedbackButton.dataset.deleteFeedback);
  const tabButton = event.target.closest("[data-project-tab]");
  if (tabButton) renderDrawer(tabButton.dataset.id, tabButton.dataset.projectTab);
  if (event.target.closest("[data-drawer-back]")) returnToParent();
  if (event.target.closest("[data-return-projects]")) returnToProjects();
  const teamButton = event.target.closest("[data-team-id]");
  if (teamButton) renderTeamDrawer(teamButton.dataset.teamId);
  const modifyTeamButton = event.target.closest("[data-modify-team]");
  if (modifyTeamButton) openModifyTeamModal(modifyTeamButton.dataset.modifyTeam);
  const resourceTeamButton = event.target.closest("[data-resource-team]");
  if (resourceTeamButton) { switchView("team"); renderTeamDrawer(resourceTeamButton.dataset.resourceTeam); }
  const openResourceButton = event.target.closest("[data-open-resource]");
  if (openResourceButton) renderResourceDrawer(openResourceButton.dataset.openResource);
  const modifyResourceButton = event.target.closest("[data-modify-resource]");
  if (modifyResourceButton) openModifyResourceModal(modifyResourceButton.dataset.modifyResource);
  const deleteResourceButton = event.target.closest("[data-delete-resource]");
  if (deleteResourceButton) openDeleteResourceModal(deleteResourceButton.dataset.deleteResource);
  const deleteTeamButton = event.target.closest("[data-delete-team]");
  if (deleteTeamButton) openDeleteTeamModal(deleteTeamButton.dataset.deleteTeam);
  if (event.target.closest(".close-drawer") || event.target === elements.drawerBackdrop) closeDrawer();
  const reportStatusButton = event.target.closest("[data-report-status]");
  if (reportStatusButton) { reportStatus = reportStatusButton.dataset.reportStatus; document.querySelector("#reportStatus").value = reportStatus; renderReports(); }
  const reportRiskButton = event.target.closest("[data-report-risk]");
  if (reportRiskButton) { const matching = projects.filter(project => project.risk === reportRiskButton.dataset.reportRisk && (reportTeam === "all" || project.team === reportTeam)); renderReportRiskDrawer(reportRiskButton.dataset.reportRisk, matching); }
});

function renderReportRiskDrawer(risk, matching) {
  drawerState = { level: "view", view: "reports" };
  elements.drawer.innerHTML = `<div class="drawer-header"><div class="drawer-header-top"><span class="drawer-context">Risk report drilldown</span><button class="icon-button close-drawer" type="button" aria-label="Close details">${iconMarkup("x")}</button></div><h2 id="drawerTitle">${risk}-risk exposure</h2><p>Projects requiring the corresponding governance response.</p></div><div class="drawer-body"><div class="drawer-project-list">${matching.map((project, index) => `<button class="drawer-project-card open-project" data-id="${project.id}" type="button"><span class="project-icon ${colors[index % colors.length]}">${project.code}</span><span><strong>${project.name}</strong><small>${project.team} - ${project.status}</small><span class="mini-progress"><i style="width:${project.progress}%"></i></span></span><span class="drawer-project-meta"><b>${project.progress}%</b>${iconMarkup("chevron-right")}</span></button>`).join("") || `<div class="drawer-empty">No projects in this risk category.</div>`}</div></div>${drawerReturnFooter("reports")}`;
  openDrawer();
}

document.addEventListener("keydown", event => {
  const selectable = event.target.closest(".project-card.open-project-page, .project-select-row");
  if (selectable && ["Enter", " "].includes(event.key)) { event.preventDefault(); renderProjectPage(selectable.dataset.id || selectable.dataset.projectPage); }
});

document.addEventListener("click", event => {
  const band = event.target.closest("[data-mix-band]");
  if (!band) return;
  focusProjectsOnBand(band.dataset.mixBand, band.dataset.mixUnit);
});

document.addEventListener("pointerdown", event => {
  const handle = event.target.closest("[data-timeline-resizer]");
  if (!handle) return;
  event.preventDefault();
  const startX = event.clientX;
  const startWidth = timelineLabelWidth();
  handle.classList.add("dragging");
  document.body.classList.add("timeline-resizing");
  const move = moveEvent => applyTimelineLabelWidth(startWidth + (moveEvent.clientX - startX), false);
  const finish = endEvent => {
    applyTimelineLabelWidth(startWidth + (endEvent.clientX - startX));
    handle.classList.remove("dragging");
    document.body.classList.remove("timeline-resizing");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
});

document.addEventListener("dblclick", event => {
  if (!event.target.closest("[data-timeline-resizer]")) return;
  applyTimelineLabelWidth(TIMELINE_LABEL.initial);
});

document.addEventListener("keydown", event => {
  const handle = event.target.closest?.("[data-timeline-resizer]");
  if (!handle) return;
  const step = event.shiftKey ? 48 : 16;
  if (event.key === "ArrowRight") applyTimelineLabelWidth(timelineLabelWidth() + step);
  else if (event.key === "ArrowLeft") applyTimelineLabelWidth(timelineLabelWidth() - step);
  else if (event.key === "Home") applyTimelineLabelWidth(TIMELINE_LABEL.initial);
  else return;
  event.preventDefault();
});

document.addEventListener("click", event => {
  const toggle = event.target.closest("[data-toggle-unit]");
  if (!toggle) return;
  event.preventDefault();
  event.stopPropagation();
  const unit = toggle.dataset.toggleUnit;
  if (collapsedUnits.has(unit)) collapsedUnits.delete(unit);
  else collapsedUnits.add(unit);
  saveCollapsedUnits();
  if (activeView === "roadmap") renderRoadmap();
  else renderProjects();
}, true);

document.querySelectorAll("[data-layout]").forEach(button => button.addEventListener("click", () => {
  activeLayout = button.dataset.layout;
  document.querySelectorAll("[data-layout]").forEach(item => item.classList.toggle("active", item === button));
  renderProjects();
}));


document.querySelector("#clearRoadmapScope").addEventListener("click", clearProjectScope);

document.querySelector("#roadmapQuarterPicker").addEventListener("click", event => {
  const button = event.target.closest("[data-quarter]");
  if (!button) return;
  if (button.dataset.quarter === "deck") {
    roadmapDeckWindow = true;
    roadmapFullYear = true;
  } else if (button.dataset.quarter === "fy") {
    roadmapDeckWindow = false;
    roadmapFullYear = true;
  } else {
    roadmapDeckWindow = false;
    roadmapFullYear = false;
    roadmapQuarter = Number(button.dataset.quarter);
  }
  renderRoadmap();
  const range = timelineRange();
  showToast(roadmapDeckWindow
    ? `18 months - ${range.label.split("· ")[1]}, the window the deck uses`
    : roadmapFullYear
      ? `${fiscalYearLabel(selectedFiscalYear)} - full fiscal year`
      : `Q${roadmapQuarter + 1} ${fiscalYearLabel(selectedFiscalYear)} selected`);
});

document.querySelector("#globalSearch").addEventListener("input", event => { query = event.target.value; if (activeView !== "projects") switchView("projects"); renderProjects(); });
document.querySelector("#statusFilter").addEventListener("change", event => { statusFilter = event.target.value; renderProjects(); });
document.querySelector("#teamFilter").addEventListener("change", event => { teamFilter = event.target.value; populateTeamFilters(); renderProjects(); });
document.querySelector("#unitFilter").addEventListener("change", event => { unitFilter = event.target.value; renderProjects(); });
document.querySelector("#ownerFilter").addEventListener("change", event => { ownerFilter = event.target.value; renderProjects(); });
document.querySelector("#riskFilter").addEventListener("change", event => { riskFilter = event.target.value; renderProjects(); });
document.querySelector("#goalFilter").addEventListener("change", event => { goalFilter = event.target.value; renderProjects(); if (activeView === "roadmap") renderRoadmap(); });
document.querySelector("#roadmapSort").addEventListener("change", event => { roadmapSort = event.target.value; renderRoadmap(); });
document.querySelector("#roadmapScoreModel").addEventListener("change", event => {
  scoreModel = SCORE_MODELS[event.target.value] ? event.target.value : DEFAULT_SCORE_MODEL;
  saveScoreModel();
  renderRoadmap();
  if (elements.modal.open) renderProjectScoreFields(projectBeingEdited ? projects.find(item => item.id === projectBeingEdited)?.scoring : readScoreFields());
});
elements.form.elements.subUnit.addEventListener("change", event => {
  if (handleTaxonomySelect("unit", event.target)) return;
  populateProjectSubCategoryOptions(elements.form.elements.unit.value, event.target.value, "");
});
elements.form.elements.subCategory.addEventListener("change", event => {
  handleTaxonomySelect("category", event.target);
});
document.querySelector("#projectForm").addEventListener("click", event => {
  const add = event.target.closest("[data-add-taxonomy]");
  if (add) commitTaxonomyName(add.dataset.addTaxonomy);
  const cancel = event.target.closest("[data-cancel-taxonomy]");
  if (cancel) closeTaxonomyAdder(cancel.dataset.cancelTaxonomy);
});
document.querySelector("#projectForm").addEventListener("keydown", event => {
  const row = event.target.closest(".taxonomy-add-row");
  if (!row || event.key !== "Enter") return;
  // Enter in the name field adds the name rather than submitting the project.
  event.preventDefault();
  commitTaxonomyName(row.dataset.level);
});
document.querySelector("#projectScoreFields").addEventListener("input", updateScorePreview);
// --- board drag and drop: a drop is a status edit -------------------------
const projectBoard = document.querySelector("#boardLayout");
projectBoard.addEventListener("dragstart", event => {
  const card = event.target.closest("[data-board-project]");
  if (!card) return;
  draggedProjectId = Number(card.dataset.boardProject);
  card.classList.add("dragging");
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.dataset.boardProject); }
});
projectBoard.addEventListener("dragend", () => {
  draggedProjectId = null;
  document.querySelectorAll(".board-card.dragging").forEach(card => card.classList.remove("dragging"));
  document.querySelectorAll(".board-column.drop-target").forEach(column => column.classList.remove("drop-target"));
});
projectBoard.addEventListener("dragover", event => {
  const column = event.target.closest("[data-board-status]");
  if (!column) return;
  event.preventDefault();
  document.querySelectorAll(".board-column.drop-target").forEach(item => item.classList.remove("drop-target"));
  column.classList.add("drop-target");
});
projectBoard.addEventListener("drop", event => {
  const column = event.target.closest("[data-board-status]");
  if (!column) return;
  event.preventDefault();
  const projectId = draggedProjectId ?? Number(event.dataTransfer?.getData("text/plain"));
  draggedProjectId = null;
  if (projectId) moveProjectToStatus(projectId, column.dataset.boardStatus);
});

// --- dragging a roadmap bar rewrites its dates ---------------------------
// The conversion from pixels to days uses the track's own width and the
// horizon currently displayed, so a drag lands on the day it looks like.
let timelineDrag = null;

function timelineDayDelta(event) {
  if (!timelineDrag || !timelineDrag.pxPerDay) return 0;
  return Math.round((event.clientX - timelineDrag.startX) / timelineDrag.pxPerDay);
}

document.querySelector("#roadmapScroll").addEventListener("pointerdown", event => {
  const bar = event.target.closest(".timeline-bar");
  if (!bar || event.button !== 0) return;
  // The track is what the drag is measured against. The row around it may be
  // a per-project row or a deck-style section row, so it is not required here.
  const track = bar.closest(".timeline-track");
  if (!track || !bar.dataset.id) return;
  const range = timelineRange();
  const width = track.getBoundingClientRect().width;
  const days = Math.max(1, Math.round(range.duration / DAY));
  const barBox = bar.getBoundingClientRect();
  const grip = 10;
  const edge = event.clientX - barBox.left <= grip ? "start" : (barBox.right - event.clientX <= grip ? "end" : null);
  timelineDrag = {
    projectId: Number(bar.dataset.id),
    startX: event.clientX,
    pxPerDay: width / days,
    edge,
    bar,
    moved: false
  };
  bar.classList.add("dragging");
  bar.setPointerCapture?.(event.pointerId);
});

document.addEventListener("pointermove", event => {
  if (!timelineDrag) return;
  const delta = timelineDayDelta(event);
  if (delta) timelineDrag.moved = true;
  timelineDrag.bar.style.setProperty("--drag-offset", `${delta * timelineDrag.pxPerDay}px`);
  timelineDrag.bar.dataset.dragEdge = timelineDrag.edge || "move";
});

document.addEventListener("pointerup", event => {
  if (!timelineDrag) return;
  const { projectId, edge, bar } = timelineDrag;
  const delta = timelineDayDelta(event);
  bar.classList.remove("dragging");
  bar.style.removeProperty("--drag-offset");
  delete bar.dataset.dragEdge;
  timelineDrag = null;
  if (!delta) return;
  suppressNextBarClick = true;
  window.setTimeout(() => { suppressNextBarClick = false; }, 0);
  const project = projects.find(item => item.id === projectId);
  if (!project) return;
  if (edge) {
    applyProjectEdgeResize(projectId, edge, delta);
    showToast(`${project.name}: ${edge === "start" ? "start" : "target"} date now ${formatDate(edge === "start" ? project.start : project.end)}`);
  } else {
    applyProjectDateShift(projectId, delta);
    showToast(`${project.name} moved ${Math.abs(delta)} ${Math.abs(delta) === 1 ? "day" : "days"} ${delta > 0 ? "later" : "earlier"} - now ${formatDate(project.start)} to ${formatDate(project.end)}`);
  }
  renderAll();
});

document.querySelector("#loginModeSwitch").addEventListener("click", () => setLoginMode(loginMode === "register" ? "signin" : "register"));
document.querySelector("#workspaceBadge").addEventListener("click", openSettingsModal);
document.querySelector("#workspacePanel").addEventListener("click", event => {
  if (event.target.closest("#addMemberButton")) addWorkspaceMember();
  if (event.target.closest("#createShareLinkButton")) createWorkspaceShareLink();
  if (event.target.closest("#createWorkspaceButton")) createWorkspace();
  if (event.target.closest("#leaveWorkspaceButton")) { leaveWorkspace(); showToast("Working from this browser only"); }
  if (event.target.closest("#changePasswordButton")) changeWorkspacePassword();
  const remove = event.target.closest("[data-remove-member]");
  if (remove) removeWorkspaceMember(remove.dataset.removeMember);
  const copy = event.target.closest("[data-copy-link]");
  if (copy) openShareModal(workspaceLinkUrl(copy.dataset.copyLink), `This link gives access to ${workspace.name}. Revoke it under Settings when it is no longer needed.`);
  const revoke = event.target.closest("[data-revoke-link]");
  if (revoke) revokeWorkspaceShareLink(revoke.dataset.revokeLink);
});
document.querySelector("#workspacePanel").addEventListener("change", event => {
  if (event.target.id === "workspaceSelect" && event.target.value) openWorkspace(event.target.value);
});
document.querySelector("#notificationButton").addEventListener("click", event => { event.stopPropagation(); toggleAlertPanel(); });
document.querySelector("#closeAlertPanel").addEventListener("click", () => toggleAlertPanel(false));
document.querySelector("#alertList").addEventListener("click", () => toggleAlertPanel(false));
document.addEventListener("click", event => {
  const panel = document.querySelector("#alertPanel");
  if (panel.classList.contains("hidden")) return;
  if (!event.target.closest("#alertPanel") && !event.target.closest("#notificationButton")) toggleAlertPanel(false);
});
document.querySelector("#saveViewButton").addEventListener("click", saveCurrentView);
document.querySelector("#deleteViewButton").addEventListener("click", deleteSavedView);
document.querySelector("#savedViewSelect").addEventListener("change", event => applySavedView(event.target.value));
document.querySelector("#shareViewButton").addEventListener("click", () => {
  const parts = activeProjectScope();
  openShareModal(shareUrlForScope(), parts.length
    ? `This link reopens the projects list filtered by ${parts.map(part => `${part.label.toLowerCase()} ${part.value}`).join(", ")}.`
    : "This link reopens the full projects list with no filters applied.");
});
document.querySelector("#copyShareLink").addEventListener("click", copyShareLink);
document.querySelector("#closeShareModal").addEventListener("click", () => document.querySelector("#shareModal").close());
document.querySelector("#doneShareModal").addEventListener("click", () => document.querySelector("#shareModal").close());
document.querySelector("#openSettingsModal").addEventListener("click", openSettingsModal);
document.querySelector("#defaultPasswordNotice").addEventListener("click", event => {
  if (event.target.closest("#openPasswordSettings")) openSettingsModal();
});
document.querySelector("#closeSettingsModal").addEventListener("click", () => document.querySelector("#settingsModal").close());
document.querySelector("#doneSettingsModal").addEventListener("click", () => document.querySelector("#settingsModal").close());
document.querySelector("#addCustomFieldButton").addEventListener("click", addCustomField);
document.querySelector("#customFieldType").addEventListener("change", event => {
  document.querySelector("#customFieldOptions").classList.toggle("hidden", event.target.value !== "select");
});
document.querySelector("#settingsScoreModel").addEventListener("change", event => {
  scoreModel = SCORE_MODELS[event.target.value] ? event.target.value : DEFAULT_SCORE_MODEL;
  saveScoreModel();
  renderAll();
  showToast(`Prioritization model set to ${activeScoreModel().label}`);
});
document.querySelector("#specForm").addEventListener("submit", submitSpec);
document.querySelector("#closeSpecModal").addEventListener("click", () => { document.querySelector("#specModal").close(); specProjectId = null; });
document.querySelector("#cancelSpecModal").addEventListener("click", () => { document.querySelector("#specModal").close(); specProjectId = null; });
document.querySelector("#addReleaseButton").addEventListener("click", () => openReleaseModal());
document.querySelector("#releaseForm").addEventListener("submit", submitRelease);
document.querySelector("#closeReleaseModal").addEventListener("click", () => { document.querySelector("#releaseModal").close(); releaseBeingEdited = null; });
document.querySelector("#cancelReleaseModal").addEventListener("click", () => { document.querySelector("#releaseModal").close(); releaseBeingEdited = null; });
document.querySelector("#captureIdeaButton").addEventListener("click", () => openIdeaModal());
document.querySelector("#ideaForm").addEventListener("submit", submitIdea);
document.querySelector("#closeIdeaModal").addEventListener("click", () => { document.querySelector("#ideaModal").close(); ideaBeingEdited = null; });
document.querySelector("#cancelIdeaModal").addEventListener("click", () => { document.querySelector("#ideaModal").close(); ideaBeingEdited = null; });
document.querySelector("#addFeedbackButton").addEventListener("click", addFeedbackRecord);

// Dragging a card between columns is the same operation as editing its status,
// so both paths go through moveIdeaToStatus.
const ideaBoard = document.querySelector("#ideaBoard");
ideaBoard.addEventListener("dragstart", event => {
  const card = event.target.closest("[data-idea-id]");
  if (!card) return;
  draggedIdeaId = Number(card.dataset.ideaId);
  card.classList.add("dragging");
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.dataset.ideaId); }
});
ideaBoard.addEventListener("dragend", () => {
  draggedIdeaId = null;
  document.querySelectorAll(".idea-card.dragging").forEach(card => card.classList.remove("dragging"));
  document.querySelectorAll(".idea-column.drop-target").forEach(column => column.classList.remove("drop-target"));
});
ideaBoard.addEventListener("dragover", event => {
  const column = event.target.closest("[data-idea-status]");
  if (!column) return;
  event.preventDefault();
  document.querySelectorAll(".idea-column.drop-target").forEach(item => item.classList.remove("drop-target"));
  column.classList.add("drop-target");
});
ideaBoard.addEventListener("drop", event => {
  const column = event.target.closest("[data-idea-status]");
  if (!column) return;
  event.preventDefault();
  const ideaId = draggedIdeaId ?? Number(event.dataTransfer?.getData("text/plain"));
  draggedIdeaId = null;
  if (ideaId) moveIdeaToStatus(ideaId, column.dataset.ideaStatus);
});
document.querySelector("#roadmapTeamFilter").addEventListener("change", event => { teamFilter = event.target.value; populateTeamFilters(); renderProjects(); renderRoadmap(); });
document.querySelector("#projectFiscalYear").addEventListener("change", event => setFiscalYear(event.target.value));
document.querySelector("#roadmapFiscalYear").addEventListener("change", event => setFiscalYear(event.target.value));
document.querySelector("#reportFiscalYear").addEventListener("change", event => setFiscalYear(event.target.value));
document.querySelector("#reportTeam").addEventListener("change", event => { reportTeam = event.target.value; renderReports(); });
document.querySelector("#reportStatus").addEventListener("change", event => { reportStatus = event.target.value; renderReports(); });
document.querySelector("#reportPeriod").addEventListener("change", event => { reportPeriod = event.target.value; renderReports(); });
document.querySelector("#teamSearch").addEventListener("input", event => { teamQuery = event.target.value; renderTeams(); });
document.querySelector("#teamHealthFilter").addEventListener("change", event => { teamHealthFilter = event.target.value; renderTeams(); });
document.querySelector("#resourceSearch").addEventListener("input", event => { resourceQuery = event.target.value; renderResources(); });
document.querySelector("#resourceRoleFilter").addEventListener("change", event => { resourceRoleFilter = event.target.value; renderResources(); });
document.querySelector("#resourceTeamFilter").addEventListener("change", event => { resourceTeamFilter = event.target.value; renderResources(); });
document.querySelector("#exportExcel").addEventListener("click", exportReportExcel);
document.querySelector("#exportPdf").addEventListener("click", exportReportPdf);
document.querySelector("#exportPptx").addEventListener("click", exportReportPptx);
document.querySelector("#printReport").addEventListener("click", () => window.print());
document.querySelector("#exportProjectsExcel").addEventListener("click", exportProjectsExcel);
document.querySelector("#exportProjectsPdf").addEventListener("click", exportProjectsPdf);
document.querySelector("#exportProjectsPptx").addEventListener("click", exportProjectsPptx);
document.querySelector("#exportRoadmapExcel").addEventListener("click", exportRoadmapExcel);
document.querySelector("#exportRoadmapPdf").addEventListener("click", exportRoadmapPdf);
document.querySelector("#exportRoadmapPptx").addEventListener("click", exportRoadmapPptx);
document.querySelector("#exportTeamsExcel").addEventListener("click", exportTeamsExcel);
document.querySelector("#exportTeamsPdf").addEventListener("click", exportTeamsPdf);
document.querySelector("#exportResourcesExcel").addEventListener("click", exportResourcesExcel);
document.querySelector("#exportResourcesPdf").addEventListener("click", exportResourcesPdf);
document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#openProjectModal").addEventListener("click", openPrimaryCreateModal);
document.querySelector("#editStrategyButton").addEventListener("click", openStrategyModal);
document.querySelector("#closeStrategyModal").addEventListener("click", () => document.querySelector("#strategyModal").close());
document.querySelector("#cancelStrategyModal").addEventListener("click", () => document.querySelector("#strategyModal").close());
document.querySelector("#strategyForm").addEventListener("submit", submitStrategy);
document.querySelector("#roadmapAddProject").addEventListener("click", openModal);
document.addEventListener("click", event => {
  const card = event.target.closest("[data-edit-phase]");
  if (!card) return;
  openEditProjectModal(card.dataset.projectId);
  if (card.dataset.editPhase === "new") {
    document.querySelector("#addPhaseButton").click();
    return;
  }
  const row = document.querySelectorAll("#phaseRows .phase-row")[Number(card.dataset.editPhase)];
  if (!row) return;
  row.classList.add("phase-row-focused");
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  // Arriving from the card's progress lands on that phase's own figure.
  const wantsProgress = event.target.closest("[data-phase-field]")?.dataset.phaseField === "progress";
  const field = wantsProgress ? row.querySelector(".phase-progress") : row.querySelector(".phase-name");
  document.querySelectorAll(".phase-field-focused").forEach(item => item.classList.remove("phase-field-focused"));
  field?.closest(".phase-field")?.classList.add("phase-field-focused");
  field?.focus();
  field?.select?.();
});

document.querySelector("#addPhaseButton").addEventListener("click", () => {
  document.querySelector("#phaseRows").insertAdjacentHTML("beforeend", phaseRowMarkup());
  updatePhaseEmptyState();
  refreshIcons();
  document.querySelector("#phaseRows .phase-row:last-child .phase-name")?.focus();
});

document.querySelector("#phaseRows").addEventListener("input", event => {
  if (event.target.closest(".phase-progress, .phase-name")) updateProgressRollupNote();
});

document.querySelector("#phaseRows").addEventListener("click", event => {
  const remove = event.target.closest("[data-remove-phase]");
  if (!remove) return;
  remove.closest(".phase-row").remove();
  updatePhaseEmptyState();
});

document.querySelector("#closeProjectModal").addEventListener("click", () => { elements.modal.close(); projectBeingEdited = null; });
document.querySelector("#cancelProjectModal").addEventListener("click", () => { elements.modal.close(); projectBeingEdited = null; });
document.querySelector("#closeTeamModal").addEventListener("click", () => { elements.teamModal.close(); teamBeingEdited = null; });
document.querySelector("#cancelTeamModal").addEventListener("click", () => { elements.teamModal.close(); teamBeingEdited = null; });
document.querySelector("#cancelDeleteTeam").addEventListener("click", () => { elements.deleteTeamModal.close(); teamPendingDeletion = null; });
document.querySelector("#confirmDeleteTeam").addEventListener("click", deleteSelectedTeam);
document.querySelector("#closeResourceModal").addEventListener("click", () => { elements.resourceModal.close(); resourceBeingEdited = null; });
document.querySelector("#cancelResourceModal").addEventListener("click", () => { elements.resourceModal.close(); resourceBeingEdited = null; });
document.querySelector("#cancelDeleteResource").addEventListener("click", () => { elements.deleteResourceModal.close(); resourcePendingDeletion = null; });
document.querySelector("#confirmDeleteResource").addEventListener("click", deleteSelectedResource);
document.querySelector("#cancelDeleteProject").addEventListener("click", () => { elements.deleteProjectModal.close(); projectPendingDeletion = null; });
document.querySelector("#confirmDeleteProject").addEventListener("click", deleteSelectedProject);
document.querySelector("#openTemplateUpload").addEventListener("click", openTemplateUpload);
document.querySelector("#openTemplateLibrary").addEventListener("click", openTemplateLibrary);
document.querySelector("#closeTemplateLibrary").addEventListener("click", () => elements.templateLibraryModal.close());
document.querySelector("#closeTemplateLibraryFooter").addEventListener("click", () => elements.templateLibraryModal.close());
document.querySelector("#closeTemplateUpload").addEventListener("click", () => elements.templateUploadModal.close());
document.querySelector("#cancelTemplateUpload").addEventListener("click", () => elements.templateUploadModal.close());
document.querySelector("#downloadProjectTemplate").addEventListener("click", downloadProjectTemplate);
document.querySelector("#downloadProjectTemplateFooter").addEventListener("click", downloadProjectTemplate);
document.querySelector("#importProjectTemplate").addEventListener("click", importProjectTemplate);
document.querySelector("#projectTemplateFile").addEventListener("change", event => { if (event.target.files[0]) readProjectTemplate(event.target.files[0]); });
document.querySelector("#templateDropZone").addEventListener("dragover", event => { event.preventDefault(); event.currentTarget.classList.add("dragging"); });
document.querySelector("#templateDropZone").addEventListener("dragleave", event => event.currentTarget.classList.remove("dragging"));
document.querySelector("#templateDropZone").addEventListener("drop", event => { event.preventDefault(); event.currentTarget.classList.remove("dragging"); if (event.dataTransfer.files[0]) readProjectTemplate(event.dataTransfer.files[0]); });
document.querySelector("#todayButton").addEventListener("click", () => { roadmapFullYear = false; roadmapQuarter = fiscalQuarterOf(AS_OF_DATE); setFiscalYear(getFiscalYear(AS_OF_DATE)); document.querySelector(".today-line")?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); showToast(`Timeline centered on today in ${fiscalYearLabel(selectedFiscalYear)}`); });
elements.form.addEventListener("submit", submitProject);
elements.teamForm.addEventListener("submit", submitTeam);
elements.resourceForm.addEventListener("submit", submitResource);
["assignedTeam", "resourceRole", "resourceName"].forEach(field => {
  elements.resourceForm.elements[field].addEventListener("change", updateResourceMoveWarning);
  elements.resourceForm.elements[field].addEventListener("input", updateResourceMoveWarning);
});
elements.loginForm.addEventListener("submit", signIn);
document.querySelector("#togglePassword").addEventListener("click", event => {
  const password = elements.loginForm.elements.password;
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  event.currentTarget.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  event.currentTarget.innerHTML = iconMarkup(showing ? "eye" : "eye-off");
  refreshIcons();
});
document.querySelector("#forgotPassword").addEventListener("click", () => { document.querySelector("#loginError").textContent = "Contact your workspace administrator to reset your password."; });
document.querySelector("#userMenuButton").addEventListener("click", event => {
  event.stopPropagation();
  const menu = document.querySelector("#userMenu");
  menu.hidden = !menu.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
});
document.querySelector("#logoutButton").addEventListener("click", signOutEverywhere);
document.addEventListener("click", event => {
  const menu = document.querySelector("#userMenu");
  if (!menu.hidden && !event.target.closest("#userMenu, #userMenuButton")) {
    menu.hidden = true;
    document.querySelector("#userMenuButton").setAttribute("aria-expanded", "false");
  }
});
elements.form.elements.team.addEventListener("change", () => { projectTeamTouched = true; });
elements.form.elements.unit.addEventListener("change", event => {
  populateProjectSubUnitOptions(event.target.value, elements.form.elements.subUnit.value);
  populateProjectSubCategoryOptions(event.target.value, elements.form.elements.subUnit.value, elements.form.elements.subCategory.value);
  if (!projectTeamTouched) populateProjectTeamOptions(defaultTeamForUnit(event.target.value));
});
elements.form.elements.end.addEventListener("input", () => elements.form.elements.end.setCustomValidity(""));
elements.form.elements.milestoneDate.addEventListener("input", () => elements.form.elements.milestoneDate.setCustomValidity(""));
document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) { event.preventDefault(); document.querySelector("#globalSearch").focus(); }
  if (event.key === "Escape") closeDrawer();
});

document.body.dataset.workspace = "projects";
applyAuthState(loadAuthSession());
populateTeamFilters();
populateFiscalYearFilters();
populateResourceFilters();
applyTimelineLabelWidth(timelineLabelWidth(), false);
initTimelineViewports();
reconcileTeamProjectIds();
populateProjectUnitOptions(projectUnits[0]);
populateProjectSubUnitOptions(projectUnits[0], "");
populateProjectSubCategoryOptions(projectUnits[0], "", "");
populateProjectTeamOptions(defaultTeamForUnit(elements.form.elements.unit.value));
renderAll();
// A shared link only ever narrows what is shown; with no link the app opens
// exactly as before.
applyLinkedScope();
renderLoginMode();
// Then find out whether there is a server to share through. Until this answers,
// the app is fully usable on this browser's own data.
bootstrapWorkspace().then(renderLoginMode).catch(() => renderLoginMode());