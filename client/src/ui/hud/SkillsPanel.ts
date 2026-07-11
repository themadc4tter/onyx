import {
  MAX_SKILL_LEVEL,
  SKILL_DEFINITIONS,
  getSkillContentDefinition,
  getSkillProgress,
  type SkillId,
  type SkillPerkDefinition,
  type SkillPerkRequirement,
  type SkillProgress,
  type SkillSpecializationPathDefinition,
} from "@onyx/shared/skills";
import type { SkillXpPayload, UniversalPerkPointsPayload } from "@onyx/shared/protocol";
import type { TooltipManager } from "../tooltips/TooltipManager";
import { buildPerkTooltip } from "../tooltips/tooltipBuilders";

export type HerbalismTabId = "overview" | "unlocks" | "specialization";

export interface SkillListItem {
  id: SkillId;
  name: string;
  nextUnlock: string;
}

interface SkillsPanelOptions {
  selectedSkill: SkillListItem;
  selectedHerbalismTab: HerbalismTabId;
  universalPerkPoints: UniversalPerkPointsPayload;
  tooltip: TooltipManager;
  getSkillTotalXp: (skillId: SkillId) => number;
  getSkillPayload: (skillId: SkillId) => SkillXpPayload;
  onSelectSkill: (skill: SkillListItem) => void;
  onSelectHerbalismTab: (tabId: HerbalismTabId) => void;
  onRequestPerkUnlock: (perk: SkillPerkDefinition, neededUniversalPoints: number) => void;
}

type HerbalismContent = NonNullable<ReturnType<typeof getSkillContentDefinition>>;

const SKILL_UNLOCKS: Record<SkillId, string> = {
  melee: "Guarding Stance",
  ranged: "Snare Trap",
  magic: "Lesser Ward",
  mining: "Iron Veins",
  smithing: "Reinforced Buckles",
  herbalism: "Moonleaf",
  alchemy: "Mist Tonic",
  cooking: "Hearty Stew",
  fishing: "River Perch",
};

export const SKILLS: SkillListItem[] = SKILL_DEFINITIONS.map(skill => ({
  id: skill.id,
  name: skill.name,
  nextUnlock: SKILL_UNLOCKS[skill.id],
}));

const HERBALISM_TABS: Array<{ id: HerbalismTabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "unlocks", label: "Unlocks" },
  { id: "specialization", label: "Specialization" },
];

export function createSkillsPanel(options: SkillsPanelOptions) {
  const layout = document.createElement("div");
  layout.className = "skills-layout";

  const list = document.createElement("div");
  list.className = "skill-list";

  for (const skill of SKILLS) {
    const progress = getSkillProgress(options.getSkillTotalXp(skill.id));
    const xpMeta = progress.isMaxLevel
      ? `${formatNumber(progress.totalXp)} XP`
      : `${formatNumber(progress.xpIntoLevel)}/${formatNumber(progress.xpForNextLevel)} (${progress.percentToNextLevel}%)`;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `skill-row${skill.id === options.selectedSkill.id ? " active" : ""}`;
    row.innerHTML = `
      <span class="skill-name">${skill.name}</span>
      <span class="skill-level">${progress.level}</span>
      <span class="xp-bar"><span class="xp-fill" style="width: ${progress.percentToNextLevel}%"></span></span>
      <span class="xp-meta">${xpMeta}</span>
    `;
    row.addEventListener("click", () => options.onSelectSkill(skill));
    list.appendChild(row);
  }

  const selectedProgress = getSkillProgress(options.getSkillTotalXp(options.selectedSkill.id));
  const detail = options.selectedSkill.id === "herbalism"
    ? createHerbalismSkillDetail(options, selectedProgress)
    : createBasicSkillDetail(options.selectedSkill, selectedProgress);

  layout.append(list, detail);
  return layout;
}

function createBasicSkillDetail(selectedSkill: SkillListItem, selectedProgress: SkillProgress) {
  const detail = document.createElement("div");
  detail.className = "skill-detail";
  const selectedXpLine = selectedProgress.isMaxLevel
    ? `${formatNumber(selectedProgress.totalXp)} XP earned.`
    : `${formatNumber(selectedProgress.xpIntoLevel)} of ${formatNumber(selectedProgress.xpForNextLevel)} XP toward level ${selectedProgress.level + 1}.`;
  detail.innerHTML = `
    <div class="detail-title">${selectedSkill.name}</div>
    <p class="detail-copy">Level ${selectedProgress.level}. ${selectedXpLine}</p>
    <div class="unlock-list">
      <div class="unlock-item"><span>Next unlock</span><strong>${selectedSkill.nextUnlock}</strong></div>
      <div class="unlock-item"><span>At level 20</span><strong>Branch perk</strong></div>
      <div class="unlock-item"><span>At level ${MAX_SKILL_LEVEL}</span><strong>Mastery cap</strong></div>
    </div>
  `;

  return detail;
}

function createHerbalismSkillDetail(options: SkillsPanelOptions, selectedProgress: SkillProgress) {
  const content = getSkillContentDefinition("herbalism");
  if (!content) return createBasicSkillDetail(options.selectedSkill, selectedProgress);

  const detail = document.createElement("div");
  detail.className = "skill-detail herbalism-detail";
  const skillPayload = options.getSkillPayload("herbalism");
  const selectedXpLine = selectedProgress.isMaxLevel
    ? `${formatNumber(selectedProgress.totalXp)} XP earned.`
    : `${formatNumber(selectedProgress.xpIntoLevel)} of ${formatNumber(selectedProgress.xpForNextLevel)} XP toward level ${selectedProgress.level + 1}.`;
  const nextUnlock = content.unlocks.find(unlock => unlock.level > selectedProgress.level);

  const header = document.createElement("div");
  header.className = "herbalism-header";
  header.innerHTML = `
    <div>
      <div class="detail-title">Herbalism</div>
      <p class="detail-copy">${selectedXpLine}</p>
    </div>
    <div class="herbalism-level-badge">${selectedProgress.level}</div>
  `;

  const summary = document.createElement("div");
  summary.className = "herbalism-summary-strip";
  summary.append(
    createHerbalismMetric("Next unlock", nextUnlock ? `Lv ${nextUnlock.level} ${nextUnlock.name}` : "All slice unlocks reached"),
    createHerbalismMetric("Skill points", `${skillPayload.availableTreePoints} available`),
    createHerbalismMetric("Universal points", `${options.universalPerkPoints.available} available`),
  );

  const tabs = document.createElement("div");
  tabs.className = "herbalism-tabs";
  for (const tab of HERBALISM_TABS) {
    const button = document.createElement("button");
    button.className = `herbalism-tab${tab.id === options.selectedHerbalismTab ? " active" : ""}`;
    button.type = "button";
    button.textContent = tab.label;
    button.addEventListener("click", () => options.onSelectHerbalismTab(tab.id));
    tabs.appendChild(button);
  }

  const body = document.createElement("div");
  body.className = "herbalism-tab-body";
  if (options.selectedHerbalismTab === "overview") body.appendChild(createHerbalismOverview(content, selectedProgress));
  if (options.selectedHerbalismTab === "unlocks") body.appendChild(createHerbalismUnlocks(content, selectedProgress));
  if (options.selectedHerbalismTab === "specialization") body.appendChild(createHerbalismSpecialization(options, content));

  detail.append(header, summary, tabs, body);
  return detail;
}

function createHerbalismMetric(label: string, value: string) {
  const metric = document.createElement("div");
  metric.className = "herbalism-metric";
  metric.innerHTML = `
    <span class="herbalism-metric-label">${label}</span>
    <span class="herbalism-metric-value">${value}</span>
  `;
  return metric;
}

function createHerbalismOverview(content: HerbalismContent, selectedProgress: SkillProgress) {
  const container = document.createElement("div");
  container.className = "herbalism-overview-grid";
  const nextMilestones = content.unlocks
    .filter(unlock => unlock.level > selectedProgress.level)
    .slice(0, 3);

  const rules = createHerbalismSection("What This Skill Does");
  const ruleList = document.createElement("div");
  ruleList.className = "herbalism-rule-list";
  ruleList.append(
    createLabelValueRow("Role", content.overview.role, "herbalism-rule"),
    createLabelValueRow("Gathering", content.overview.gathering, "herbalism-rule"),
    createLabelValueRow("Progression", content.overview.progression, "herbalism-rule"),
  );
  rules.appendChild(ruleList);

  const families = createHerbalismSection("Item Families");
  const familyList = document.createElement("div");
  familyList.className = "herbalism-family-list";
  familyList.append(
    createLabelValueRow("Herbs", "Fairly common overworld nodes. Main path: Botanist.", "herbalism-family"),
    createLabelValueRow("Mushrooms", "More uncommon cave, dungeon, and damp-area nodes. Main path: Mycologist.", "herbalism-family"),
    createLabelValueRow("Bloomhearts", "Very rare living reagent cores found through gathering, prospecting, bosses, and special sources. Main path: Bloomkeeper.", "herbalism-family"),
  );
  families.appendChild(familyList);

  const milestones = createHerbalismSection("Next Milestones");
  const milestoneList = document.createElement("div");
  milestoneList.className = "herbalism-milestone-list";
  const visibleMilestones = nextMilestones.length > 0 ? nextMilestones : content.unlocks.slice(-3);
  for (const unlock of visibleMilestones) {
    milestoneList.appendChild(createLabelValueRow(`Lv ${unlock.level}`, `${unlock.name} - ${unlock.alchemyRole}.`, "herbalism-milestone"));
  }
  milestones.appendChild(milestoneList);

  container.append(rules, families, milestones);
  return container;
}

function createHerbalismUnlocks(content: HerbalismContent, selectedProgress: SkillProgress) {
  const section = createHerbalismSection("Unlocks");
  const list = document.createElement("div");
  list.className = "herbalism-unlock-list";

  const header = document.createElement("div");
  header.className = "herbalism-unlock-header";
  header.innerHTML = `
    <span>Level</span>
    <span>Reagent</span>
    <span>Type</span>
    <span>Where</span>
    <span>XP</span>
    <span>Status</span>
  `;
  list.appendChild(header);

  for (const unlock of content.unlocks) {
    const unlocked = selectedProgress.level >= unlock.level;
    const row = document.createElement("div");
    row.className = `herbalism-unlock-row${unlocked ? "" : " locked"}`;
    row.innerHTML = `
      <span class="herbalism-unlock-level">Lv ${unlock.level}</span>
      <span class="herbalism-unlock-name">${unlock.name}</span>
      <span class="herbalism-unlock-type">${unlock.nodeType} - ${unlock.rarity}</span>
      <span class="herbalism-unlock-location">${unlock.location}</span>
      <span class="herbalism-unlock-xp">${unlock.xp}</span>
      <span class="herbalism-status${unlocked ? "" : " locked"}">${unlocked ? "Unlocked" : "Locked"}</span>
    `;
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}

function createHerbalismSpecialization(options: SkillsPanelOptions, content: HerbalismContent) {
  const container = document.createElement("div");
  container.className = "specialization-map";

  const intro = createHerbalismSection("Specialization Paths");
  const introList = document.createElement("div");
  introList.className = "herbalism-rule-list";
  for (const path of content.specializationPaths) {
    introList.appendChild(createLabelValueRow(path.name, path.summary, "herbalism-rule"));
  }
  intro.appendChild(introList);

  const paths = document.createElement("div");
  paths.className = "specialization-paths";
  for (const path of content.specializationPaths) {
    paths.appendChild(createSpecializationPath(options, path, content.perks.filter(perk => perk.pathId === path.id)));
  }

  container.append(intro, paths);
  return container;
}

function createSpecializationPath(
  options: SkillsPanelOptions,
  path: SkillSpecializationPathDefinition,
  perks: SkillPerkDefinition[],
) {
  const pathEl = document.createElement("div");
  pathEl.className = `specialization-path ${path.id}`;
  const liveCount = perks.filter(perk => perk.implementation.status === "live").length;
  pathEl.innerHTML = `
    <div class="specialization-path-title">
      <span>${path.name}</span>
      <span class="specialization-path-tag">${liveCount > 0 ? `${liveCount} live` : "Planned"}</span>
    </div>
    <div class="specialization-path-copy">${path.summary}</div>
  `;

  const perkList = document.createElement("div");
  perkList.className = "perk-list";
  for (const perk of perks) {
    const skillPayload = options.getSkillPayload(perk.skillId);
    const unlocked = skillPayload.unlockedPerkIds.includes(perk.id);
    const blocked = perk.implementation.status !== "live" || !perk.implementation.unlockable;
    const requirementsMet = areSkillPerkRequirementsMet(perk.requires, skillPayload);
    const neededUniversalPoints = Math.max(0, perk.cost - skillPayload.availableTreePoints);
    const hasPoints = skillPayload.availableTreePoints >= perk.cost || options.universalPerkPoints.available >= neededUniversalPoints;
    const canUnlock = !unlocked && !blocked && requirementsMet && hasPoints;
    const status = getPerkStatusText({
      unlocked,
      blocked,
      requirementsMet,
      hasPoints,
      neededUniversalPoints,
    });
    const node = document.createElement("div");
    node.className = [
      "perk-node",
      unlocked ? "learned" : "",
      blocked ? "blocked" : "",
      canUnlock ? "available" : "",
    ].filter(Boolean).join(" ");
    node.innerHTML = `
      <div class="perk-heading">
        <span class="perk-id">${perk.code}</span>
        <span class="perk-name">${perk.name}</span>
      </div>
      <div class="perk-effect">${perk.effectText}</div>
      <div class="perk-requirement">Requires: ${perk.requirementText}</div>
      ${perk.plannedRequirementText ? `<div class="perk-requirement">Planned path: ${perk.plannedRequirementText}</div>` : ""}
    `;
    options.tooltip.attach(node, () => buildPerkTooltip(perk, {
      status,
      unlocked,
      blocked,
      requirementsMet,
      hasPoints,
      neededUniversalPoints,
    }));

    const footer = document.createElement("div");
    footer.className = "perk-footer";

    const statusEl = document.createElement("span");
    statusEl.className = [
      "perk-status",
      unlocked ? "learned" : "",
      blocked ? "blocked" : "",
    ].filter(Boolean).join(" ");
    statusEl.textContent = status;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "perk-learn-button";
    button.disabled = !canUnlock;
    button.textContent = unlocked ? "Learned" : "Learn";
    button.addEventListener("click", () => options.onRequestPerkUnlock(perk, neededUniversalPoints));

    footer.append(statusEl, button);
    node.appendChild(footer);
    perkList.appendChild(node);
  }

  pathEl.appendChild(perkList);
  return pathEl;
}

function createHerbalismSection(titleText: string) {
  const section = document.createElement("div");
  section.className = "herbalism-section";
  const title = document.createElement("div");
  title.className = "herbalism-section-title";
  title.textContent = titleText;
  section.appendChild(title);
  return section;
}

function areSkillPerkRequirementsMet(requirements: SkillPerkRequirement[], skillPayload: SkillXpPayload) {
  const unlockedPerkIds = new Set(skillPayload.unlockedPerkIds);
  const skillLevel = getSkillProgress(skillPayload.totalXp).level;

  return requirements.every(requirement => {
    if (requirement.type === "perk") return unlockedPerkIds.has(requirement.perkId);
    if (requirement.type === "any_perk") return requirement.perkIds.some(perkId => unlockedPerkIds.has(perkId));
    return skillLevel >= requirement.level;
  });
}

function getPerkStatusText(options: {
  unlocked: boolean;
  blocked: boolean;
  requirementsMet: boolean;
  hasPoints: boolean;
  neededUniversalPoints: number;
}) {
  if (options.unlocked) return "Learned";
  if (options.blocked) return "Planned";
  if (!options.requirementsMet) return "Locked";
  if (!options.hasPoints) return "Need points";
  if (options.neededUniversalPoints > 0) return "Uses universal";
  return "Available";
}

function createLabelValueRow(label: string, value: string, className: string) {
  const row = document.createElement("div");
  row.className = className;
  const labelEl = document.createElement("strong");
  labelEl.textContent = label;
  const valueEl = document.createElement("span");
  valueEl.textContent = value;
  row.append(labelEl, valueEl);
  return row;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
