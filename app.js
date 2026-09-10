const DAY = 86400000;
const AS_OF_DATE = new Date("2026-09-10T12:00:00");
const AUTH_STORAGE_KEY = "platforms-branch-session";
const DEFAULT_PASSWORD = "1234";
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const colors = ["teal", "coral", "amber", "blue"];
const teamRoleFields = [
  ["productOwner", "Product Owner"], ["solutionSponsor", "Solution Sponsor"], ["executiveSponsor", "Executive Sponsor"],
  ["stakeholder1", "Stakeholder 1"], ["stakeholder2", "Stakeholder 2"], ["businessSponsor", "Business Sponsor"],
  ["businessExecutive", "Business Executive"], ["developer", "Developer"], ["architect", "Architect"], ["devLead", "Dev Lead"],
  ["scrumMaster", "Scrum Master"], ["projectManager", "Project Manager"], ["businessAnalyst", "Business Analyst"],
  ["frontEndDesigner", "Front End Designer"], ["serviceDesigner", "Service Designer"], ["qa", "QA"]
];
const resourceRoles = ["Product Owner", "Scrum Master", "Project Manager", "Developer", "Architect", "Service Designer", "Front End Designer", "QA", "Business Analyst"];
const projectUnits = ["Identity and Access Management", "Alberta Wallet and Credentials", "Platform Operations", "Alberta Payments", "Web Services", "CRA Income and Data Verification Services"];
const unitTeamAssignments = { "Identity and Access Management": "Team 7", "Alberta Wallet and Credentials": "Team 1", "Platform Operations": "Team 2", "Alberta Payments": "Team 5", "Web Services": "Team 3", "CRA Income and Data Verification Services": "Team 8" };
const projectTemplateColumns = ["Project Name", "Team", "Unit", "Owner", "Objective", "Start Date", "Target Date", "Status", "Progress (%)", "Priority", "Risk Level", "Approx. Cost in dollars", "Schedule Variance (days)", "Contributors", "Milestone Name", "Milestone Date"];
const projectTemplateTeams = Array.from({ length: 10 }, (_, index) => `Team ${index + 1}`);

const seedProjects = [
  { id: 1, name: "Customer portal redesign", code: "CPR", team: "Design", owner: "Maya Chen", status: "On track", progress: 72, start: "2026-07-15", end: "2026-11-20", risk: "Low", priority: "High", approxCost: 480000, scheduleVariance: 0, objective: "Modernize the customer service experience and reduce support effort.", milestone: "Design handoff", milestoneDate: "2026-10-09", members: ["MC", "JR", "AN", "SK"] },
  { id: 2, name: "Mobile app v2", code: "MAV", team: "Product", owner: "Jon Bell", status: "At risk", progress: 48, start: "2026-08-01", end: "2027-01-22", risk: "High", priority: "High", approxCost: 760000, scheduleVariance: 14, objective: "Ship the next generation mobile experience with offline workflows.", milestone: "Beta release", milestoneDate: "2026-11-12", members: ["JB", "RL", "KM", "TD"] },
  { id: 3, name: "Data platform migration", code: "DPM", team: "Engineering", owner: "Ana Silva", status: "On track", progress: 64, start: "2026-06-10", end: "2026-12-16", risk: "Medium", priority: "High", approxCost: 1250000, scheduleVariance: 0, objective: "Consolidate analytics infrastructure on a scalable governed platform.", milestone: "Warehouse cutover", milestoneDate: "2026-10-28", members: ["AS", "NK", "DM"] },
  { id: 4, name: "Global web launch", code: "GWL", team: "Marketing", owner: "Theo Martin", status: "Off track", progress: 39, start: "2026-08-18", end: "2026-11-05", risk: "High", priority: "High", approxCost: 620000, scheduleVariance: 28, objective: "Launch localized web experiences across priority growth markets.", milestone: "Content freeze", milestoneDate: "2026-09-25", members: ["TM", "LF", "OP"] },
  { id: 5, name: "Identity modernization", code: "IDM", team: "Engineering", owner: "Rina Patel", status: "On track", progress: 81, start: "2026-05-20", end: "2026-10-30", risk: "Low", priority: "Medium", approxCost: 390000, scheduleVariance: -3, objective: "Introduce unified identity, SSO, and role-based access controls.", milestone: "SSO rollout", milestoneDate: "2026-09-30", members: ["RP", "EH", "WY"] },
  { id: 6, name: "FY27 planning cycle", code: "FPC", team: "Operations", owner: "Sam Okafor", status: "Planned", progress: 12, start: "2026-10-01", end: "2027-02-12", risk: "Low", priority: "Medium", approxCost: 180000, scheduleVariance: 0, objective: "Align annual investment, capacity, and operating targets.", milestone: "Plan review", milestoneDate: "2026-12-04", members: ["SO", "ER", "BC"] },
  { id: 7, name: "Partner enablement hub", code: "PEH", team: "Product", owner: "Lena Ford", status: "On track", progress: 56, start: "2026-07-28", end: "2026-12-09", risk: "Medium", priority: "Medium", approxCost: 275000, scheduleVariance: 0, objective: "Centralize partner training, certification, and sales resources.", milestone: "Pilot cohort", milestoneDate: "2026-10-16", members: ["LF", "AG", "PS"] }
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

let projects = loadProjects();
let teamDirectory = loadTeams();
let activeView = "projects";
let activeLayout = "table";
let query = "";
let statusFilter = "all";
let teamFilter = "all";
let unitFilter = "all";
let roadmapTeam = "all";
let roadmapScaleMode = "quarter";
let selectedFiscalYear = getFiscalYear(AS_OF_DATE);
let reportTeam = "all";
let reportStatus = "all";
let reportPeriod = "quarter";
let teamQuery = "";
let teamHealthFilter = "all";
let teamPendingDeletion = null;
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
  healthy: { title: "On-track delivery", description: "Initiatives progressing within their agreed delivery tolerance.", icon: "circle-check", filter: project => project.status === "On track" },
  attention: { title: "Projects needing attention", description: "Initiatives with material schedule or delivery risk.", icon: "triangle-alert", filter: project => ["At risk", "Off track"].includes(project.status) },
  progress: { title: "Portfolio progress", description: "Progress distribution across all active initiatives.", icon: "gauge", filter: () => true },
  nearing: { title: "Nearing completion", description: "Initiatives at or above 75% overall completion.", icon: "badge-check", filter: project => project.progress >= 75 },
  planned: { title: "Planned initiatives", description: "Approved work scheduled to begin next.", icon: "calendar-clock", filter: project => project.status === "Planned" },
  milestones: { title: "Upcoming milestones", description: "Portfolio milestones scheduled after the current reporting date.", icon: "flag", filter: project => new Date(project.milestoneDate) >= new Date("2026-09-10") }
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
  projectCount: document.querySelector("#projectCount"),
  tableBody: document.querySelector("#projectTableBody"),
  cardLayout: document.querySelector("#cardLayout"),
  tableLayout: document.querySelector("#tableLayout"),
  emptyState: document.querySelector("#emptyState"),
  projectDetail: document.querySelector("#projectDetailContent"),
  timeline: document.querySelector("#timeline"),
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

function signIn(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.loginForm));
  const email = data.email.trim().toLowerCase();
  const error = document.querySelector("#loginError");
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

function loadProjects() {
  try {
    const saved = JSON.parse(localStorage.getItem("aster-projects"));
    return (Array.isArray(saved) ? saved : seedProjects).map(normalizeProjectUnit);
  } catch {
    return seedProjects.map(normalizeProjectUnit);
  }
}

function normalizeProjectUnit(project) {
  const projectDefaults = { "Customer portal redesign": "Web Services", "Mobile app v2": "Alberta Wallet and Credentials", "Data platform migration": "CRA Income and Data Verification Services", "Global web launch": "Web Services", "Identity modernization": "Identity and Access Management", "FY27 planning cycle": "Platform Operations", "Partner enablement hub": "Alberta Wallet and Credentials" };
  const teamDefaults = { Product: "Alberta Wallet and Credentials", Engineering: "Platform Operations", Design: "Web Services", Marketing: "Alberta Payments", Operations: "Platform Operations" };
  const { code: _legacyCode, ...projectWithoutCode } = project;
  const unit = projectUnits.includes(project.unit) ? project.unit : projectDefaults[project.name] || teamDefaults[project.team] || "Platform Operations";
  const team = /^Team \d+$/.test(project.team || "") ? project.team : unitTeamAssignments[unit];
  return { ...projectWithoutCode, code: initials(project.name), unit, team };
}

function saveProjects() {
  localStorage.setItem("aster-projects", JSON.stringify(projects));
}

function loadTeams() {
  try {
    const saved = JSON.parse(localStorage.getItem("aster-teams"));
    return (Array.isArray(saved) ? saved : seedTeams).map(normalizeTeamRoles);
  } catch {
    return seedTeams.map(normalizeTeamRoles);
  }
}

function normalizeTeamRoles(team) {
  if (team.roles) return team;
  const members = team.members?.length ? team.members : [team.lead];
  const roles = Object.fromEntries(teamRoleFields.map(([, label], index) => [label, index === 0 ? team.lead : members[index % members.length]]));
  return { ...team, roles };
}

function saveTeams() {
  localStorage.setItem("aster-teams", JSON.stringify(teamDirectory));
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
    intake.getCell(`B${row}`).dataValidation = listValidation(projectTemplateTeams, "Team");
    intake.getCell(`C${row}`).dataValidation = listValidation(projectUnits, "Unit");
    intake.getCell(`D${row}`).dataValidation = textValidation("Owner", 40);
    intake.getCell(`E${row}`).dataValidation = textValidation("Objective", 180);
    ["F", "G"].forEach(column => { intake.getCell(`${column}${row}`).numFmt = "mm/dd/yyyy"; intake.getCell(`${column}${row}`).dataValidation = dateValidation(column === "F" ? "Start Date" : "Target Date"); });
    intake.getCell(`P${row}`).numFmt = "yyyy-mm-dd";
    intake.getCell(`P${row}`).dataValidation = dateValidation("Milestone Date");
    intake.getCell(`H${row}`).dataValidation = listValidation(["Planned", "On track", "At risk", "Off track"], "Status");
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
  if (!projectTemplateTeams.includes(String(row.Team || "").trim())) errors.push("Team must be Team 1 through Team 10");
  if (!projectUnits.includes(String(row.Unit || "").trim())) errors.push("Unit must be selected from the approved list");
  if (!["Planned", "On track", "At risk", "Off track"].includes(status)) errors.push("Status is invalid");
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

function getFiscalProjects() {
  return projects.filter(project => projectOverlapsFiscalYear(project));
}

function iconMarkup(name) {
  return `<i data-lucide="${name}"></i>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function getFilteredProjects() {
  const normalized = query.trim().toLowerCase();
  return getFiscalProjects().filter(project => {
    const matchesQuery = !normalized || [project.name, project.owner, project.team, project.unit].some(value => value.toLowerCase().includes(normalized));
    return matchesQuery && (statusFilter === "all" || project.status === statusFilter) && (teamFilter === "all" || project.team === teamFilter) && (unitFilter === "all" || project.unit === unitFilter);
  });
}

function renderMetrics() {
  const fiscalProjects = getFiscalProjects();
  const total = fiscalProjects.length;
  const teamCount = new Set(fiscalProjects.map(project => project.team)).size;
  const onTrack = fiscalProjects.filter(project => project.status === "On track").length;
  const atRisk = fiscalProjects.filter(project => ["At risk", "Off track"].includes(project.status)).length;
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
  const counts = {
    "On track": fiscalProjects.filter(project => project.status === "On track").length,
    "At risk": fiscalProjects.filter(project => project.status === "At risk").length,
    "Off track": fiscalProjects.filter(project => project.status === "Off track").length,
    "Planned": fiscalProjects.filter(project => project.status === "Planned").length
  };
  const healthyPercent = fiscalProjects.length ? Math.round(counts["On track"] / fiscalProjects.length * 100) : 0;
  const riskPercent = fiscalProjects.length ? Math.round(counts["At risk"] / fiscalProjects.length * 100) : 0;
  elements.healthScore.textContent = `${healthyPercent}%`;
  elements.healthRing.style.setProperty("--health", `${healthyPercent}%`);
  elements.healthRing.style.setProperty("--risk", `${riskPercent}%`);
  elements.healthLegend.innerHTML = [
    ["On track", counts["On track"], "var(--green)"],
    ["At risk", counts["At risk"], "var(--amber)"],
    ["Off track", counts["Off track"], "var(--red)"],
    ["Planned", counts["Planned"], "var(--blue)"]
  ].map(item => `<div class="legend-row"><i style="background:${item[2]}"></i><span>${item[0]}</span><strong>${item[1]}</strong></div>`).join("");
}

function renderAttention() {
  const attention = getFiscalProjects().filter(project => ["At risk", "Off track"].includes(project.status));
  elements.attentionCount.textContent = attention.length;
  elements.attentionList.innerHTML = attention.map(project => `
    <div class="attention-item">
      <span class="attention-icon ${project.status === "At risk" ? "amber" : ""}">${iconMarkup(project.status === "At risk" ? "clock-3" : "triangle-alert")}</span>
      <div><strong>${project.name}</strong><small>${project.status === "At risk" ? "Timeline needs review" : "Critical launch blocker"} - ${project.owner}</small></div>
      <button class="icon-button subtle open-project" data-id="${project.id}" type="button" aria-label="Open ${project.name}">${iconMarkup("arrow-up-right")}</button>
    </div>`).join("");
}

function renderCapacity() {
  const capacity = [
    ["Engineering", 88, "#176b53"], ["Product", 76, "#36709b"], ["Design", 94, "#e66f51"], ["Marketing", 69, "#c78218"]
  ];
  elements.capacityChart.innerHTML = capacity.map(item => `<div class="capacity-row"><span>${item[0]}</span><div class="capacity-track"><span style="width:${item[1]}%;--bar-color:${item[2]}"></span></div><strong>${item[1]}%</strong></div>`).join("");
}

function teamCapacityLevel(capacity) {
  if (capacity >= 90) return { key: "near-capacity", label: "Near capacity", color: "#c44e4e" };
  if (capacity >= 70) return { key: "balanced", label: "Balanced", color: "#176b53" };
  return { key: "available", label: "Available", color: "#36709b" };
}

function assignedTeamProjects(team) {
  return team.projectIds.map(id => projects.find(project => project.id === id)).filter(Boolean);
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
  elements.resourceGrid.innerHTML = filtered.map(resource => `<article class="resource-card"><button class="resource-card-main" data-open-resource="${resource.id}" type="button" aria-label="Open ${resource.name} details"><div class="resource-card-head"><span class="avatar">${initials(resource.name)}</span><span class="resource-availability availability-${slug(resource.availability)}">${resource.availability}</span></div><h3>${resource.name}</h3><div class="resource-card-details"><div class="resource-detail-row resource-role-line"><span class="resource-detail-icon">${iconMarkup("briefcase-business")}</span><span><small>Role</small><strong>${resource.role}</strong></span></div><div class="resource-detail-row resource-team-line"><span class="resource-detail-icon">${iconMarkup("users")}</span><span><small>Resource team</small><strong>${resource.teamName}</strong></span></div></div><div class="resource-view-link"><span>View details</span>${iconMarkup("arrow-right")}</div><div class="team-capacity-label"><span>Allocation</span><strong>${resource.allocation}%</strong></div><div class="capacity-track"><span style="width:${resource.allocation}%;--bar-color:${resource.allocation >= 90 ? "#c44e4e" : "#176b53"}"></span></div></button><div class="resource-card-actions"><button class="resource-modify-button" data-modify-resource="${resource.id}" type="button">${iconMarkup("pencil")} Modify</button><button class="resource-delete-button" data-delete-resource="${resource.id}" type="button">${iconMarkup("trash-2")} Delete</button></div></article>`).join("");
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
    const cardRoles = [["Product Owner", team.roles["Product Owner"]], ["Lead", team.roles["Dev Lead"]], ["Solution Sponsor", team.roles["Solution Sponsor"]], ["Executive Sponsor", team.roles["Executive Sponsor"]]];
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
  saveTeams();
  elements.deleteTeamModal.close();
  closeDrawer();
  renderTeams();
  showToast(`${team.name} removed from the team directory`);
  teamPendingDeletion = null;
}

function projectRow(project, index) {
  return `<tr class="project-select-row" data-project-page="${project.id}" tabindex="0" aria-label="Open ${project.name} details">
    <td><div class="project-name"><span class="project-icon ${colors[index % colors.length]}">${initials(project.name)}</span><div><button class="open-project-page" data-id="${project.id}" type="button">${project.name}</button><small>${project.team}</small></div></div></td>
    <td><span class="status-pill status-${slug(project.status)}">${project.status}</span></td>
    <td><div class="table-progress"><div class="progress-track"><span style="width:${project.progress}%"></span></div><span>${project.progress}%</span></div></td>
    <td><div class="owner-cell"><span class="avatar">${initials(project.owner)}</span><span>${project.owner}</span></div></td>
    <td><time datetime="${project.end}">${formatDate(project.end, { month: "short", day: "numeric", year: "numeric" })}</time></td>
    <td><span class="risk-pill risk-${project.risk.toLowerCase()}">${project.risk}</span></td>
    <td><button class="icon-button subtle row-action open-project-page" data-id="${project.id}" type="button" aria-label="Open ${project.name} details">${iconMarkup("arrow-right")}</button></td>
  </tr>`;
}

function projectCard(project, index) {
  return `<article class="project-card open-project-page" data-id="${project.id}" tabindex="0" role="button" aria-label="Open ${project.name} details page">
    <div class="project-card-top"><span class="project-icon ${colors[index % colors.length]}">${initials(project.name)}</span><span class="status-pill status-${slug(project.status)}">${project.status}</span></div>
    <h3>${project.name}</h3><p>${project.objective}</p>
    <div class="project-card-unit"><span>${iconMarkup("building-2")}</span><div><small>Unit</small><strong>${project.unit}</strong></div></div>
    <div class="project-card-progress"><div class="progress-track"><span style="width:${project.progress}%"></span></div><strong>${project.progress}%</strong></div>
    <div class="project-card-meta"><div class="owner-cell"><span class="avatar">${initials(project.owner)}</span><span>${project.owner}</span></div><span class="icon-button subtle" aria-hidden="true">${iconMarkup("arrow-up-right")}</span></div>
  </article>`;
}

function renderProjectPage(projectId) {
  const project = projects.find(item => item.id === Number(projectId));
  if (!project) return;
  const workstreams = projectWorkstreams(project);
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
      <div class="project-page-actions"><span class="status-pill status-${slug(project.status)}">${project.status}</span><button class="secondary-button" type="button">${iconMarkup("share-2")}Share</button><button class="danger-button" data-delete-project="${project.id}" type="button">${iconMarkup("trash-2")}Delete</button><button class="primary-button" data-edit-project="${project.id}" type="button">${iconMarkup("pencil")}Edit project</button></div>
    </header>
    <div class="project-page-stats">
      <div><span>Owner</span><strong><i class="avatar">${initials(project.owner)}</i>${project.owner}</strong></div>
      <div><span>Unit</span><strong>${project.unit}</strong></div>
      <div><span>Timeline</span><strong>${formatDate(project.start)} - ${formatDate(project.end)}</strong></div>
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
          <div class="section-heading-row"><div><span class="section-kicker">Execution</span><h2>Workstreams</h2></div><span class="detail-count">${workstreams.length} workstreams</span></div>
          <div class="detail-workstream-grid">${workstreams.map(stream => `<button class="detail-workstream-card" data-page-workstream="${stream.id}" data-project-id="${project.id}" type="button"><div class="detail-workstream-top"><span class="workstream-status">${iconMarkup(stream.progress >= 90 ? "circle-check" : "layers-3")}</span><span class="risk-pill ${stream.progress < 40 ? "risk-high" : stream.progress < 70 ? "risk-medium" : "risk-low"}">${stream.progress < 40 ? "Needs focus" : stream.progress < 70 ? "In progress" : "Healthy"}</span></div><h3>${stream.name}</h3><p>${stream.tasks.length} tasks assigned to ${stream.owner}</p><div class="project-card-progress"><div class="progress-track"><span style="width:${stream.progress}%"></span></div><strong>${stream.progress}%</strong></div><span class="card-link">View task details ${iconMarkup("arrow-right")}</span></button>`).join("")}</div>
        </section>
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

function renderProjects() {
  const filtered = getFilteredProjects();
  const grouped = [...filtered.reduce((groups, project) => {
    const unit = project.unit || "Not assigned";
    if (!groups.has(unit)) groups.set(unit, []);
    groups.get(unit).push(project);
    return groups;
  }, new Map()).entries()].sort(([unitA], [unitB]) => unitA.localeCompare(unitB));
  elements.projectCount.textContent = `(${filtered.length})`;
  elements.tableBody.innerHTML = grouped.map(([unit, unitProjects]) => `<tr class="project-unit-table-heading"><td colspan="7"><div><span>${iconMarkup("building-2")}</span><strong>${unit}</strong><small>${unitProjects.length} ${unitProjects.length === 1 ? "project" : "projects"}</small></div></td></tr>${unitProjects.map(project => projectRow(project, projects.indexOf(project))).join("")}`).join("");
  elements.cardLayout.innerHTML = grouped.map(([unit, unitProjects]) => `<section class="project-unit-group"><div class="project-unit-heading"><span class="project-unit-heading-icon">${iconMarkup("building-2")}</span><div><span>Unit</span><h3>${unit}</h3></div><strong>${unitProjects.length} ${unitProjects.length === 1 ? "project" : "projects"}</strong></div><div class="project-unit-card-grid">${unitProjects.map(project => projectCard(project, projects.indexOf(project))).join("")}</div></section>`).join("");
  const empty = filtered.length === 0;
  elements.emptyState.classList.toggle("hidden", !empty);
  elements.tableLayout.classList.toggle("hidden", empty || activeLayout !== "table");
  elements.cardLayout.classList.toggle("hidden", empty || activeLayout !== "cards");
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
  document.querySelector("#roadmapTeamFilter").value = roadmapTeam;
  document.querySelector("#reportTeam").value = reportTeam;
  document.querySelector("#unitFilter").innerHTML = `<option value="all">All units</option>${units.map(unit => `<option value="${unit}">${unit}</option>`).join("")}`;
  document.querySelector("#unitFilter").value = units.includes(unitFilter) ? unitFilter : "all";
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
  if (project.status === "At risk") return 14;
  if (project.status === "Planned") return 0;
  return project.progress >= 75 ? -3 : 0;
}

function forecastLabel(project) {
  if (project.status === "Off track") return "Delayed";
  if (project.status === "At risk") return "Watch";
  if (project.status === "Planned") return "Planned";
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
  const delivery = visible.filter(project => project.status !== "Planned");
  const onTrack = visible.filter(project => project.status === "On track").length;
  const average = total ? Math.round(visible.reduce((sum, project) => sum + project.progress, 0) / total) : 0;
  const scheduleConfidence = delivery.length ? Math.round(delivery.filter(project => !["Off track"].includes(project.status)).length / delivery.length * 100) : 0;
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
  elements.teamReport.innerHTML = teams.length ? teams.map(team => { const teamProjects = visible.filter(project => project.team === team); const progress = Math.round(teamProjects.reduce((sum, project) => sum + project.progress, 0) / teamProjects.length); const healthy = teamProjects.filter(project => project.status === "On track").length; return `<div class="team-report-row"><div><strong>${team}</strong><small>${teamProjects.length} ${teamProjects.length === 1 ? "initiative" : "initiatives"}</small></div><div class="team-health-bar"><span style="width:${progress}%"></span></div><strong>${progress}%</strong><span class="team-confidence ${healthy === teamProjects.length ? "good" : "watch"}">${healthy}/${teamProjects.length} healthy</span></div>`; }).join("") : `<div class="report-empty">No team data available.</div>`;

  const cutoff = reportPeriodCutoff();
  const milestones = visible.filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= AS_OF_DATE && date <= cutoff; }).sort((a, b) => new Date(a.milestoneDate) - new Date(b.milestoneDate));
  elements.reportMilestones.innerHTML = milestones.length ? milestones.map(project => `<button class="forecast-row open-project" data-id="${project.id}" type="button"><time><strong>${formatDate(project.milestoneDate, { day: "2-digit" })}</strong><span>${formatDate(project.milestoneDate, { month: "short" })}</span></time><span><strong>${project.milestone}</strong><small>${project.name}</small></span><span class="forecast-badge forecast-${slug(forecastLabel(project))}">${forecastLabel(project)}</span>${iconMarkup("chevron-right")}</button>`).join("") : `<div class="report-empty">No milestones in the selected reporting horizon.</div>`;

  elements.reportProjectCount.textContent = `(${total})`;
  elements.reportTableBody.innerHTML = visible.map((project, index) => { const variance = scheduleVariance(project); return `<tr><td><div class="project-name"><span class="project-icon ${colors[index % colors.length]}">${project.code}</span><div><button class="open-project" data-id="${project.id}" type="button">${project.name}</button><small>${project.team} - ${project.owner}</small></div></div></td><td><span class="status-pill status-${slug(project.status)}">${project.status}</span></td><td><div class="table-progress"><div class="progress-track"><span style="width:${project.progress}%"></span></div><span>${project.progress}%</span></div></td><td><strong class="report-cost">${formatCurrency(project.approxCost)}</strong></td><td><span class="variance ${variance > 0 ? "late" : variance < 0 ? "ahead" : "stable"}">${variance > 0 ? `+${variance} days` : variance < 0 ? `${variance} days` : "On baseline"}</span></td><td><span class="risk-pill risk-${project.risk.toLowerCase()}">${project.risk}</span></td><td><strong class="report-milestone-name">${project.milestone}</strong><small class="report-date">${formatDate(project.milestoneDate, { month: "short", day: "numeric", year: "numeric" })}</small></td><td><span class="forecast-badge forecast-${slug(forecastLabel(project))}">${forecastLabel(project)}</span></td></tr>`; }).join("");
  refreshIcons();
}

function reportExportData() {
  const visible = getReportProjects();
  const active = visible.filter(project => project.status !== "Planned");
  const onTrack = visible.filter(project => project.status === "On track").length;
  const average = visible.length ? Math.round(visible.reduce((sum, project) => sum + project.progress, 0) / visible.length) : 0;
  const scheduleConfidence = active.length ? Math.round(active.filter(project => project.status !== "Off track").length / active.length * 100) : 0;
  const highRisk = visible.filter(project => project.risk === "High").length;
  const totalCost = visible.reduce((sum, project) => sum + (Number(project.approxCost) || 0), 0);
  const period = document.querySelector("#reportPeriod option:checked").textContent;
  const team = document.querySelector("#reportTeam option:checked").textContent;
  const status = document.querySelector("#reportStatus option:checked").textContent;
  const fiscal = fiscalYearBounds();
  const cutoff = reportPeriodCutoff();
  const riskCost = visible.filter(project => project.risk === "High").reduce((sum, project) => sum + (Number(project.approxCost) || 0), 0);
  const upcomingMilestones = [...visible].filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= AS_OF_DATE && date <= cutoff; }).sort((a, b) => new Date(a.milestoneDate) - new Date(b.milestoneDate));
  const exceptions = visible.filter(project => ["At risk", "Off track"].includes(project.status));
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
    ["As of", "September 10, 2026"],
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

  const registerRows = [["Project", "Unit", "Objective", "Team", "Owner", "RAG Status", "Progress", "Approximate Cost USD", "Schedule Variance Days", "Risk", "Priority", "Start Date", "Target Date", "Next Milestone", "Milestone Date", "Forecast", "Fiscal Year"]];
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
    window.XLSX.writeFile(buildExcelReport(), "aster-portfolio-report-2026-09-10.xlsx", { compression: true });
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
  doc.text(`As of September 10, 2026  |  ${data.fiscalLabel}  |  ${data.period}  |  ${data.team}  |  ${data.status}`, 36, 59);

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
    head: [["Project", "Objective", "Team / Owner", "RAG", "Progress", "Approx. cost", "Variance", "Risk"]],
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
    buildPdfReport().save("aster-portfolio-report-2026-09-10.pdf");
    showToast("PDF report exported");
  } catch (error) {
    showToast(error.message);
  }
}

function addPptxFooter(slide, pageNumber) {
  slide.addText(`Aster confidential  |  September 10, 2026  |  ${pageNumber}`, { x: 0.45, y: 7.12, w: 12.4, h: 0.18, fontFace: "Arial", fontSize: 7, color: "7C8781", margin: 0 });
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
  titleSlide.addText(`${data.fiscalLabel} · ${data.period}\n${data.team} · ${data.status}\nAs of September 10, 2026`, { x: 9.9, y: 1.45, w: 2.7, h: 1.15, fontFace: "Arial", fontSize: 12, bold: true, color: "FFFFFF", breakLine: false, margin: 0.08, valign: "mid", fill: { color: "314A40" }, line: { color: "537064" } });
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
  const statusRows = ["On track", "At risk", "Off track", "Planned"].map(status => [status, data.visible.filter(project => project.status === status).length, data.visible.length ? `${Math.round(data.visible.filter(project => project.status === status).length / data.visible.length * 100)}%` : "0%"]);
  summarySlide.addText("RAG status distribution", { x: 0.6, y: 4.2, w: 3.2, h: 0.3, fontFace: "Arial", fontSize: 13, bold: true, color: "18201D", margin: 0 });
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
    slide.addTable([["Project / objective", "Team / owner", "RAG", "Progress", "Approx. cost", "Variance", "Risk", "Next milestone"], ...chunk.map(project => [`${project.name}\n${project.objective}`, `${project.team}\n${project.owner}`, project.status, `${project.progress}%`, formatCurrency(project.approxCost), `${scheduleVariance(project)} days`, project.risk, `${project.milestone}\n${formatDate(project.milestoneDate)}`])], { x: 0.55, y: 1.05, w: 12.2, h: 5.65, fontFace: "Arial", fontSize: 7.5, border: { type: "solid", color: "DDE2DF", pt: 0.6 }, fill: "FFFFFF", color: "18201D", rowH: 0.72, margin: 0.06, autoFit: false, bold: false });
    addPptxFooter(slide, index + 5);
  });
  return pptx;
}

async function exportReportPptx() {
  const button = document.querySelector("#exportPptx");
  button.disabled = true;
  try {
    await buildPowerPointReport().writeFile({ fileName: "aster-portfolio-report-2026-09-10.pptx" });
    showToast("PowerPoint report exported");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function buildTeamsExcel() {
  if (!window.XLSX) throw new Error("Excel export library is unavailable.");
  const teams = getFilteredTeams();
  const workbook = window.XLSX.utils.book_new();
  workbook.Props = { Title: "Aster Team Directory", Subject: "Team capacity and role accountability", Author: "Aster Project Operations", CreatedDate: AS_OF_DATE };
  const summaryRows = [["Aster Team Directory"], ["As of", "September 10, 2026"], ["Capacity filter", document.querySelector("#teamHealthFilter option:checked").textContent], ["Search", teamQuery || "All teams"], [], ["Teams", teams.length], ["Members", teams.reduce((sum, team) => sum + team.headcount, 0)], ["Average capacity", teams.length ? teams.reduce((sum, team) => sum + team.capacity, 0) / teams.length / 100 : 0], ["Assigned projects", new Set(teams.flatMap(team => team.projectIds)).size]];
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
  const summaryRows = [["Aster Resource Directory"], ["As of", "September 10, 2026"], ["Role filter", document.querySelector("#resourceRoleFilter option:checked").textContent], ["Team filter", document.querySelector("#resourceTeamFilter option:checked").textContent], ["Search", resourceQuery || "All resources"], [], ["Resources", resources.length], ["Average allocation", resources.length ? resources.reduce((sum, resource) => sum + resource.allocation, 0) / resources.length / 100 : 0], ["Available", resources.filter(resource => resource.availability === "Available").length], ["Allocated", resources.filter(resource => resource.availability === "Allocated").length], ["Unavailable", resources.filter(resource => resource.availability === "Unavailable").length]];
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
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`As of September 10, 2026  |  ${subtitle}`, 36, 57);
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

function exportTeamsExcel() { try { window.XLSX.writeFile(buildTeamsExcel(), "aster-team-directory-2026-09-10.xlsx", { compression: true }); showToast("Team Excel workbook exported"); } catch (error) { showToast(error.message); } }
function exportTeamsPdf() { try { buildDirectoryPdf("team").save("aster-team-directory-2026-09-10.pdf"); showToast("Team PDF exported"); } catch (error) { showToast(error.message); } }
function exportResourcesExcel() { try { window.XLSX.writeFile(buildResourcesExcel(), "aster-resource-directory-2026-09-10.xlsx", { compression: true }); showToast("Resource Excel workbook exported"); } catch (error) { showToast(error.message); } }
function exportResourcesPdf() { try { buildDirectoryPdf("resource").save("aster-resource-directory-2026-09-10.pdf"); showToast("Resource PDF exported"); } catch (error) { showToast(error.message); } }

function timelineRange() {
  const fiscal = fiscalYearBounds();
  const anchor = AS_OF_DATE >= fiscal.start && AS_OF_DATE <= fiscal.end ? AS_OF_DATE : fiscal.start;
  let start;
  let end;
  let label;
  let milestoneLabel;

  if (roadmapScaleMode === "month") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(start);
    milestoneLabel = label;
  } else if (roadmapScaleMode === "quarter") {
    const fiscalMonth = (anchor.getMonth() - 3 + 12) % 12;
    const quarter = Math.floor(fiscalMonth / 3);
    start = new Date(fiscal.start.getFullYear(), 3 + quarter * 3, 1, 12);
    end = new Date(start.getFullYear(), start.getMonth() + 3, 0, 12);
    label = `Q${quarter + 1} ${fiscalYearLabel(selectedFiscalYear)} · ${monthNames[start.getMonth()]}-${monthNames[end.getMonth()]}`;
    milestoneLabel = `Q${quarter + 1} ${fiscalYearLabel(selectedFiscalYear)}`;
  } else {
    start = fiscal.start;
    end = fiscal.end;
    label = `${fiscalYearLabel(selectedFiscalYear)} · Apr ${selectedFiscalYear - 1}-Mar ${selectedFiscalYear}`;
    milestoneLabel = `${fiscalYearLabel(selectedFiscalYear)} horizon`;
  }

  const periods = [];
  if (roadmapScaleMode === "month") {
    const days = end.getDate();
    for (let day = 1; day <= days; day += 7) {
      const periodDays = Math.min(7, days - day + 1);
      periods.push({ label: `${monthNames[start.getMonth()]} ${day}`, days: periodDays });
    }
  } else {
    const pointer = new Date(start);
    while (pointer <= end) {
      periods.push({ label: `${monthNames[pointer.getMonth()]} ${String(pointer.getFullYear()).slice(2)}`, days: new Date(pointer.getFullYear(), pointer.getMonth() + 1, 0).getDate() });
      pointer.setMonth(pointer.getMonth() + 1);
    }
  }
  return { start, end, duration: end - start + DAY, periods, label, milestoneLabel };
}

function getRoadmapVisibleProjects() {
  const range = timelineRange();
  return getFiscalProjects().filter(project => (roadmapTeam === "all" || project.team === roadmapTeam) && new Date(`${project.end}T12:00:00`) >= range.start && new Date(`${project.start}T12:00:00`) <= range.end);
}

function renderRoadmap() {
  const range = timelineRange();
  const visible = getRoadmapVisibleProjects();
  const columns = range.periods.map(period => `${period.days}fr`).join(" ");
  const todayPosition = AS_OF_DATE >= range.start && AS_OF_DATE <= range.end ? (AS_OF_DATE - range.start + DAY / 2) / range.duration * 100 : null;
  document.querySelector("#roadmapPeriodLabel").textContent = range.label;
  document.querySelector("#roadmapMilestoneWindow").textContent = range.milestoneLabel;
  elements.timeline.dataset.timelineScale = roadmapScaleMode;
  elements.timeline.innerHTML = `
    <div class="timeline-header"><div class="timeline-project-heading">Project</div><div class="timeline-months" style="grid-template-columns:${columns}">${range.periods.map(period => `<div class="timeline-month">${period.label}</div>`).join("")}</div></div>
    ${visible.map((project, index) => {
      const projectStart = new Date(`${project.start}T12:00:00`);
      const projectEnd = new Date(`${project.end}T12:00:00`);
      const milestoneDate = new Date(`${project.milestoneDate}T12:00:00`);
      const clippedStart = projectStart < range.start ? range.start : projectStart;
      const clippedEnd = projectEnd > range.end ? new Date(range.end.getTime() + DAY) : new Date(projectEnd.getTime() + DAY);
      const start = (clippedStart - range.start) / range.duration * 100;
      const width = Math.max(0, (clippedEnd - clippedStart) / range.duration * 100);
      const milestone = (milestoneDate - range.start + DAY / 2) / range.duration * 100;
      const milestoneMarkup = milestoneDate >= range.start && milestoneDate <= range.end ? `<span class="timeline-milestone" style="--position:${milestone}%" title="${project.milestone}"></span>` : "";
      const barColor = ["#176b53", "#e66f51", "#36709b", "#c78218"][index % 4];
      return `<div class="timeline-row"><div class="timeline-project"><span class="project-icon ${colors[index % 4]}">${project.code}</span><div><strong>${project.name}</strong><small>${project.team}</small></div></div><div class="timeline-track" style="${todayPosition === null ? "" : `--today:${todayPosition}%`}"><span class="timeline-grid" style="grid-template-columns:${columns}">${range.periods.map(() => "<i></i>").join("")}</span>${todayPosition === null ? "" : `<span class="today-line"></span>`}<button class="timeline-bar open-project ${project.status === "Planned" ? "planned" : ""}" data-id="${project.id}" type="button" style="--start:${start}%;--width:${width}%;--bar-color:${barColor}" title="${project.name}: ${formatDate(project.start)} to ${formatDate(project.end)}">${project.progress}%</button>${milestoneMarkup}</div></div>`;
    }).join("")}`;

  const completed = visible.filter(project => project.progress >= 75).length;
  const planned = visible.filter(project => project.status === "Planned").length;
  const milestones = visible.filter(project => new Date(`${project.milestoneDate}T12:00:00`) >= range.start && new Date(`${project.milestoneDate}T12:00:00`) <= range.end).length;
  const summary = [
    ["active", visible.length, "Portfolio initiatives", "folder-kanban", "#176b53", "#dceee7"],
    ["nearing", completed, "Nearing completion", "badge-check", "#36709b", "#e2edf5"],
    ["planned", planned, "Planned next", "calendar-clock", "#c78218", "#fbefd8"],
    ["milestones", milestones, "Milestones ahead", "flag", "#e66f51", "#fbe6df"]
  ];
  elements.roadmapSummary.innerHTML = summary.map(item => `<button class="roadmap-summary-item drilldown-card" data-drilldown="${item[0]}" type="button" style="--summary-color:${item[4]};--summary-bg:${item[5]}" aria-label="Drill down into ${item[2]}"><i>${iconMarkup(item[3])}</i><div><strong>${item[1]}</strong><span>${item[2]}</span></div>${iconMarkup("chevron-right")}</button>`).join("");
  renderMilestones(visible, range);
  refreshIcons();
}

function renderMilestones(sourceProjects = getFiscalProjects(), range = fiscalYearBounds()) {
  const upcoming = [...sourceProjects].filter(project => { const date = new Date(`${project.milestoneDate}T12:00:00`); return date >= AS_OF_DATE && date >= range.start && date <= range.end; }).sort((a, b) => new Date(a.milestoneDate) - new Date(b.milestoneDate)).slice(0, 3);
  elements.milestoneList.innerHTML = upcoming.map((project, index) => `<button class="milestone-card open-project" data-id="${project.id}" type="button" style="--milestone-color:${["#e66f51", "#176b53", "#36709b"][index]}" aria-label="Open ${project.milestone} details"><time>${formatDate(project.milestoneDate, { month: "short", day: "numeric" })}</time><strong>${project.milestone}</strong><span>${project.name}</span></button>`).join("");
}

function projectWorkstreams(project) {
  const progress = project.progress;
  return [
    { id: "discovery", name: "Discovery and alignment", owner: project.memberNames?.[0] || project.members[0] || initials(project.owner), progress: Math.min(100, progress + 24), tasks: ["Confirm scope and success measures", "Validate stakeholder requirements", "Approve delivery brief"] },
    { id: "delivery", name: "Core delivery", owner: project.memberNames?.[1] || project.members[1] || initials(project.owner), progress, tasks: ["Complete primary implementation", "Review quality and controls", "Resolve open dependencies"] },
    { id: "launch", name: "Launch readiness", owner: project.memberNames?.[2] || project.members[2] || initials(project.owner), progress: Math.max(5, progress - 28), tasks: ["Prepare rollout plan", "Complete operational handoff", "Monitor launch indicators"] }
  ];
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
  const workstreams = `<div class="drawer-list-heading"><h3>Delivery workstreams</h3><span>Select a workstream for task details</span></div><div class="workstream-list">${projectWorkstreams(project).map(stream => `<button class="workstream-card" data-workstream="${stream.id}" data-project-id="${project.id}" type="button"><span class="workstream-status">${stream.progress === 100 ? iconMarkup("circle-check") : iconMarkup("layers-3")}</span><span><strong>${stream.name}</strong><small>${stream.tasks.length} tasks - Owner ${stream.owner}</small><span class="mini-progress"><i style="width:${stream.progress}%"></i></span></span><b>${stream.progress}%</b>${iconMarkup("chevron-right")}</button>`).join("")}</div>`;
  const milestones = `<section><div class="drawer-list-heading"><h3>Delivery milestones</h3><span>Key gates and target dates</span></div><div class="drawer-milestone"><i></i><strong>Project kickoff</strong><time>${formatDate(project.start)}</time></div><div class="drawer-milestone"><i class="${project.progress < 50 ? "future" : ""}"></i><strong>Midpoint review</strong><time>${formatDate(halfway)}</time></div><div class="drawer-milestone"><i class="future"></i><strong>${project.milestone}</strong><time>${formatDate(project.milestoneDate)}</time></div><div class="drawer-milestone"><i class="future"></i><strong>Target completion</strong><time>${formatDate(project.end)}</time></div></section><section class="drawer-section"><h3>Delivery signal</h3><div class="risk-callout risk-${project.risk.toLowerCase()}">${iconMarkup(project.risk === "High" ? "triangle-alert" : "shield-check")}<span><strong>${project.risk} risk</strong><small>${project.status === "Off track" ? "Executive intervention is recommended." : "Risk posture is monitored in the weekly review."}</small></span></div></section>`;
  const backLabel = parent.level === "portfolio" ? drilldownDefinitions[parent.key].title : parent.level === "team" ? `Team ${parent.teamId}` : parent.view === "roadmap" ? "Roadmap" : "Projects";
  elements.drawer.innerHTML = `<div class="drawer-header"><div class="drawer-header-top"><div class="drawer-header-actions"><button class="drawer-back" data-drawer-back type="button">${iconMarkup("arrow-left")} ${backLabel}</button><span class="status-pill status-${slug(project.status)}">${project.status}</span></div><button class="icon-button close-drawer" type="button" aria-label="Close project details">${iconMarkup("x")}</button></div><h2 id="drawerTitle">${project.name}</h2><p>${project.team} initiative - ${project.owner}</p></div><div class="drawer-tabs" role="tablist" aria-label="Project details"><button class="${tab === "overview" ? "active" : ""}" data-project-tab="overview" data-id="${project.id}" type="button">Overview</button><button class="${tab === "workstreams" ? "active" : ""}" data-project-tab="workstreams" data-id="${project.id}" type="button">Workstreams</button><button class="${tab === "milestones" ? "active" : ""}" data-project-tab="milestones" data-id="${project.id}" type="button">Milestones</button></div><div class="drawer-body">${tab === "overview" ? overview : tab === "workstreams" ? workstreams : milestones}</div>${drawerReturnFooter(backLabel)}`;
  openDrawer();
}

function renderWorkstreamDrawer(projectId, workstreamId) {
  const project = projects.find(item => item.id === Number(projectId));
  const stream = project && projectWorkstreams(project).find(item => item.id === workstreamId);
  if (!project || !stream) return;
  const parent = activeView === "project-detail" ? { level: "page", projectId: project.id } : drawerState?.level === "project" ? drawerState.parent : { level: "view", view: activeView };
  drawerState = { level: "workstream", projectId: project.id, workstreamId, parent };
  const completedTasks = Math.round(stream.tasks.length * stream.progress / 100);
  const returnLabel = parent.level === "page" ? "project details" : "project workstreams";
  elements.drawer.innerHTML = `<div class="drawer-header compact"><div class="drawer-header-top"><button class="drawer-back" data-drawer-back type="button">${iconMarkup("arrow-left")} ${returnLabel[0].toUpperCase() + returnLabel.slice(1)}</button><button class="icon-button close-drawer" type="button" aria-label="Close details">${iconMarkup("x")}</button></div><p class="drawer-context">${project.name}</p><h2 id="drawerTitle">${stream.name}</h2></div><div class="drawer-body"><div class="drawer-level"><span>Project</span>${iconMarkup("chevron-right")}<span>Workstreams</span>${iconMarkup("chevron-right")}<strong>${stream.name}</strong></div><div class="drawer-stat-grid"><div class="drawer-stat"><span>Owner</span><strong>${stream.owner}</strong></div><div class="drawer-stat"><span>Progress</span><strong>${stream.progress}%</strong></div><div class="drawer-stat"><span>Tasks</span><strong>${completedTasks}/${stream.tasks.length}</strong></div></div><section class="drawer-section"><h3>Task breakdown</h3><div class="task-list">${stream.tasks.map((task, index) => { const complete = index < completedTasks; return `<label class="task-row"><input type="checkbox" ${complete ? "checked" : ""}><span class="task-check">${iconMarkup("check")}</span><span><strong>${task}</strong><small>${complete ? "Complete" : index === completedTasks ? "In progress" : "Not started"}</small></span></label>`; }).join("")}</div></section><section class="drawer-section"><h3>Workstream progress</h3><div class="progress-track drawer-progress"><span style="width:${stream.progress}%"></span></div></section></div>${drawerReturnFooter(returnLabel)}`;
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
  if (drawerState.level === "workstream") {
    if (drawerState.parent.level === "page") closeDrawer();
    else renderDrawer(drawerState.projectId, "workstreams", drawerState.parent);
  } else if (drawerState.level === "project" && drawerState.parent.level === "portfolio") {
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
  const values = { name: project.name, unit: project.unit, owner: project.owner, objective: project.objective, start: project.start, end: project.end, status: project.status, progress: project.progress, priority: project.priority, risk: project.risk, approxCost: project.approxCost ?? "", scheduleVariance: scheduleVariance(project), contributors: project.memberNames?.filter(name => name.toLowerCase() !== project.owner.toLowerCase()).join(", ") || "", milestone: project.milestone, milestoneDate: project.milestoneDate };
  Object.entries(values).forEach(([field, value]) => { elements.form.elements[field].value = value; });
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
  elements.resourceModal.showModal();
  refreshIcons();
}

function submitResource(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.resourceForm));
  const team = teamDirectory.find(item => item.id === Number(data.assignedTeam));
  if (!team) return;
  if (resourceBeingEdited) {
    const previousTeam = teamDirectory.find(item => item.id === resourceBeingEdited.teamId);
    if (previousTeam && previousTeam.roles[resourceBeingEdited.role] === resourceBeingEdited.name && (previousTeam.id !== team.id || resourceBeingEdited.role !== data.resourceRole)) {
      previousTeam.roles[resourceBeingEdited.role] = "";
      if (previousTeam.resourceMeta) delete previousTeam.resourceMeta[resourceBeingEdited.role];
      recomputeTeamMembers(previousTeam);
    }
  }
  team.roles[data.resourceRole] = data.resourceName.trim();
  team.resourceMeta = team.resourceMeta || {};
  team.resourceMeta[data.resourceRole] = { allocation: Number(data.allocation), availability: data.availability };
  recomputeTeamMembers(team);
  team.headcount = Math.max(team.headcount, team.members.length);
  saveTeams();
  elements.resourceModal.close();
  elements.resourceForm.reset();
  renderTeams();
  renderResources();
  showToast(resourceBeingEdited ? `${data.resourceName.trim()} updated` : `${data.resourceName.trim()} assigned to ${team.name}`);
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
  if (existing) {
    Object.assign(existing, { name: data.teamName.trim(), lead: data.productOwner.trim(), headcount: members.length, members, roles: Object.fromEntries(roleEntries) });
  } else {
    const id = Math.max(0, ...teamDirectory.map(team => team.id)) + 1;
    teamDirectory.push({ id, name: data.teamName.trim(), specialty: "Cross-functional Delivery", lead: data.productOwner.trim(), capacity: 0, headcount: members.length, projectIds: [], members, roles: Object.fromEntries(roleEntries) });
  }
  saveTeams();
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
  const projectData = { name: data.name, code: initials(data.name), team: unitTeamAssignments[data.unit], unit: data.unit, owner: data.owner, status: data.status, progress: Number(data.progress), start: data.start, end: data.end, risk: data.risk, priority: data.priority, approxCost: Number(data.approxCost), objective: data.objective, milestone: data.milestone, milestoneDate: data.milestoneDate, scheduleVariance: Number(data.scheduleVariance), members, memberNames: existing && !existing.memberNames && !contributorNames.length ? undefined : memberNames };
  const savedProject = existing || { id: Date.now(), ...projectData };
  if (existing) Object.assign(existing, projectData);
  else projects.push(savedProject);
  teamDirectory.forEach(team => { team.projectIds = team.projectIds.filter(id => id !== savedProject.id); });
  const assignedTeam = teamDirectory.find(team => team.name === savedProject.team);
  if (assignedTeam && !assignedTeam.projectIds.includes(savedProject.id)) assignedTeam.projectIds.push(savedProject.id);
  saveProjects();
  saveTeams();
  elements.modal.close();
  elements.form.reset();
  populateTeamFilters();
  populateFiscalYearFilters();
  renderAll();
  if (existing) renderProjectPage(existing.id);
  showToast(existing ? `${data.name} updated` : `${data.name} added to the portfolio`);
  projectBeingEdited = null;
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
  refreshIcons();
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) switchView(viewButton.dataset.view);
  const projectButton = event.target.closest(".open-project");
  if (projectButton) renderDrawer(projectButton.dataset.id);
  const projectPageButton = event.target.closest(".open-project-page, .project-select-row");
  if (projectPageButton) renderProjectPage(projectPageButton.dataset.id || projectPageButton.dataset.projectPage);
  const editProjectButton = event.target.closest("[data-edit-project]");
  if (editProjectButton) openEditProjectModal(editProjectButton.dataset.editProject);
  const deleteProjectButton = event.target.closest("[data-delete-project]");
  if (deleteProjectButton) openDeleteProjectModal(deleteProjectButton.dataset.deleteProject);
  const drilldownButton = event.target.closest("[data-drilldown]");
  if (drilldownButton) renderPortfolioDrawer(drilldownButton.dataset.drilldown);
  const tabButton = event.target.closest("[data-project-tab]");
  if (tabButton) renderDrawer(tabButton.dataset.id, tabButton.dataset.projectTab);
  const workstreamButton = event.target.closest("[data-workstream]");
  if (workstreamButton) renderWorkstreamDrawer(workstreamButton.dataset.projectId, workstreamButton.dataset.workstream);
  if (event.target.closest("[data-drawer-back]")) returnToParent();
  if (event.target.closest("[data-return-projects]")) returnToProjects();
  const pageWorkstream = event.target.closest("[data-page-workstream]");
  if (pageWorkstream) renderWorkstreamDrawer(pageWorkstream.dataset.projectId, pageWorkstream.dataset.pageWorkstream);
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

document.querySelectorAll("[data-layout]").forEach(button => button.addEventListener("click", () => {
  activeLayout = button.dataset.layout;
  document.querySelectorAll("[data-layout]").forEach(item => item.classList.toggle("active", item === button));
  renderProjects();
}));

document.querySelectorAll("[data-scale]").forEach(button => button.addEventListener("click", () => {
  roadmapScaleMode = button.dataset.scale;
  document.querySelectorAll("#roadmapScale [data-scale]").forEach(item => item.classList.toggle("active", item === button));
  document.querySelectorAll("#roadmapScale [data-scale]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
  renderRoadmap();
  showToast(`${button.textContent} timeline selected`);
}));

document.querySelector("#globalSearch").addEventListener("input", event => { query = event.target.value; if (activeView !== "projects") switchView("projects"); renderProjects(); });
document.querySelector("#statusFilter").addEventListener("change", event => { statusFilter = event.target.value; renderProjects(); });
document.querySelector("#teamFilter").addEventListener("change", event => { teamFilter = event.target.value; renderProjects(); });
document.querySelector("#unitFilter").addEventListener("change", event => { unitFilter = event.target.value; renderProjects(); });
document.querySelector("#roadmapTeamFilter").addEventListener("change", event => { roadmapTeam = event.target.value; renderRoadmap(); });
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
document.querySelector("#exportTeamsExcel").addEventListener("click", exportTeamsExcel);
document.querySelector("#exportTeamsPdf").addEventListener("click", exportTeamsPdf);
document.querySelector("#exportResourcesExcel").addEventListener("click", exportResourcesExcel);
document.querySelector("#exportResourcesPdf").addEventListener("click", exportResourcesPdf);
document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#sidebar").classList.toggle("open"));
document.querySelector("#openProjectModal").addEventListener("click", openPrimaryCreateModal);
document.querySelector("#roadmapAddProject").addEventListener("click", openModal);
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
document.querySelector("#todayButton").addEventListener("click", () => { setFiscalYear(getFiscalYear(AS_OF_DATE)); document.querySelector(".today-line")?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); showToast(`Timeline centered on today in ${fiscalYearLabel(selectedFiscalYear)}`); });
elements.form.addEventListener("submit", submitProject);
elements.teamForm.addEventListener("submit", submitTeam);
elements.resourceForm.addEventListener("submit", submitResource);
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
document.querySelector("#logoutButton").addEventListener("click", logOff);
document.addEventListener("click", event => {
  const menu = document.querySelector("#userMenu");
  if (!menu.hidden && !event.target.closest("#userMenu, #userMenuButton")) {
    menu.hidden = true;
    document.querySelector("#userMenuButton").setAttribute("aria-expanded", "false");
  }
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
renderAll();